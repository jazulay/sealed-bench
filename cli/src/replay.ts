// Replay mode (`npm run verify`) and tamper demo (`npm run tamper`). Neither needs a NEAR account, a key,
// or a NEAR AI key: offline checks use only the published fixture, and on-chain checks use free RPC views.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./lib.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
const rd = (p: string) => JSON.parse(readFileSync(p, "utf8"));

function fixtureFiles(flags: Record<string, string>): string[] {
  if (flags.fixture) return [flags.fixture];
  return (flags.dir ?? "fixtures/demo").split(",").flatMap((dd) => {
    const d = join(ROOT, dd);
    return readdirSync(d).filter((f) => f.startsWith("reveal.") && f.endsWith(".json")).sort().map((f) => join(d, f));
  });
}
const ctxOf = (fx: any): L.CheckCtx => ({ suiteRoot: fx.suite.root, n: fx.suite.n, template: fx.suite.request_template, model: fx.run.model, nonce: fx.run.nonce, runRoot: fx.run.run_root, grades: fx.run.grades, pinned: fx.pinned_signers });

async function onchain() {
  try { return await import("./near.ts"); } catch (e) { return null; }
}

export async function verify(flags: Record<string, string>) {
  const near = flags.offline ? null : await onchain();
  const results: any[] = [];
  for (const f of fixtureFiles(flags)) {
    const fx = rd(f); const c = ctxOf(fx);
    const r: any = { fixture: f.replace(ROOT + "/", ""), suite: fx.suite.suite_id, model: fx.run.model, checks: {} };
    // 1. challenge indices are exactly what the chain seed produces
    const redrawn = L.drawIndices(Buffer.from(fx.suite.draw_seed, "hex"), fx.suite.suite_id, fx.suite.n, fx.suite.k);
    r.checks.challenge_rederived_from_chain_seed = JSON.stringify(redrawn) === JSON.stringify(fx.suite.challenge);
    // 2. every challenged index revealed, each passes every contract check
    const items = fx.revealed.map((it: L.RevealItem) => ({ idx: it.idx, ...L.checkReveal(c, it) }));
    r.checks.all_challenged_revealed = JSON.stringify(fx.revealed.map((i: any) => i.idx)) === JSON.stringify(fx.suite.challenge);
    r.checks.all_reveals_pass_offline = items.every((i: any) => i.ok);
    r.score = { owner_reported: [...fx.run.grades].filter((g) => g === "1").length, n: fx.suite.n };
    r.sample = { k: fx.suite.k, verified: items.filter((i: any) => i.ok).length, correct_in_sample: items.filter((i: any) => i.correct).length };
    r.signers = [...new Set(items.map((i: any) => i.recovered_signer))];
    if (near) {
      try {
        const st: any = await near.view("get_suite", { suite_id: fx.suite.suite_id });
        const run: any = await near.view("get_run", { suite_id: fx.suite.suite_id, model: fx.run.model });
        const pins: any[] = await near.view("get_signers", { model: fx.run.model });
        r.checks.onchain_suite_root_matches = st?.root === fx.suite.root;
        r.checks.onchain_challenge_matches = JSON.stringify(st?.challenge) === JSON.stringify(fx.suite.challenge);
        r.checks.onchain_run_root_and_grades_match = run?.run_root === fx.run.run_root && run?.grades === fx.run.grades;
        r.checks.onchain_signers_match = JSON.stringify(pins.map((p) => p.address).sort()) === JSON.stringify([...fx.pinned_signers].sort());
        const views = await Promise.all(fx.revealed.slice(0, Number(flags.views ?? 3)).map((it: any) => near.view<any>("check_reveal", { suite_id: fx.suite.suite_id, model: fx.run.model, item: it })));
        r.checks.onchain_check_reveal_view_ok = views.every((v) => v.ok);
        r.onchain_status = run?.status;
        r.signer_pins = pins.map((p) => ({ address: p.address, note: p.note }));
      } catch (e) { r.onchain_error = String((e as Error).message ?? e); }
    }
    r.ok = Object.values(r.checks).every(Boolean) && (!near || r.onchain_status === "Audited");
    r.claim = `Owner-reported score ${r.score.owner_reported}/${r.score.n}; ${r.sample.verified}/${r.sample.k} sampled entries verified.`;
    if (fx.run.model.startsWith("mock/")) r.warning = "DEV-ONLY mock signer (public key, not NEAR AI, not a TEE): this fixture rehearses the protocol only.";
    if (flags.verbose) r.items = items;
    results.push(r);
  }
  out({ ok: results.every((r) => r.ok), mode: near ? "offline replay + on-chain views (testnet RPC, no key)" : "offline replay only", results });
  if (!results.every((r) => r.ok)) process.exitCode = 1;
}

const ROGUE = "0x" + "07".repeat(32);

export async function tamper(flags: Record<string, string>) {
  const near = flags.offline ? null : await onchain();
  const ff = fixtureFiles(flags); const f = ff.find((x) => x.includes("sealed")) ?? ff[0]; const fx = rd(f); const c = ctxOf(fx);
  const base: L.RevealItem = fx.revealed.find((i: any) => i.grade === 1) ?? fx.revealed[0];
  const other: L.RevealItem = fx.revealed.find((i: any) => i.idx !== base.idx);
  const nonChallenged = [...Array(fx.suite.n).keys()].find((i) => !fx.suite.challenge.includes(i))!;
  type Case = { name: string; lie: string; item: L.RevealItem; ctx?: L.CheckCtx; onchain?: boolean };
  const cases: Case[] = [
    { name: "honest", lie: "none (baseline)", item: base },
    { name: "edit_response", lie: "change the model's answer in the response bytes", item: { ...base, response: base.response.replace(/ANSWER: (-?\d+)/g, (_m, d) => `ANSWER: ${Number(d) + 1}`) } },
    { name: "flip_one_byte", lie: "flip one byte of whitespace in the response", item: { ...base, response: base.response.replace(" ", "  ") } },
    { name: "change_answer_key", lie: "change the sealed answer key after the fact", item: { ...base, answer: base.answer + 1 } },
    { name: "swap_question", lie: "reveal a different (easier) question", item: { ...base, question: base.question.replace(/\d+/, (d) => String(Number(d) + 1)) } },
    { name: "flip_grade", lie: "claim a wrong answer was right (or vice versa)", item: { ...base, grade: base.grade ^ 1 } },
    { name: "borrow_signature", lie: "reuse a valid NEAR-AI signature from another item", item: { ...base, signature: other.signature } },
    { name: "self_signed", lie: "sign responses with the owner's own key and recommit a consistent run root (what-if, offline)", onchain: false,
      ...(() => {
        const text = L.signedText(c.model, L.sha256hex(L.buildRequest(c.template, c.model, c.nonce, base.question)), L.sha256hex(base.response));
        const sig = L.signEip191(ROGUE, text);
        // attacker controls every leaf; place the forged leaf in a 1-leaf-per-level tree reusing the real siblings
        const leaf = L.runLeaf(base.idx, L.sha256hex(L.buildRequest(c.template, c.model, c.nonce, base.question)), L.sha256hex(base.response), sig, base.grade);
        return { item: { ...base, signature: sig }, ctx: { ...c, runRoot: L.rootFromProof(leaf, base.idx, base.run_proof) } };
      })() },
    { name: "stale_nonce", lie: "use a response generated before start_run (different nonce) with a consistent run root (what-if, offline)", onchain: false,
      ...(() => ({ item: base, ctx: { ...c, nonce: "00".repeat(32) } }))() },
    { name: "cherry_pick", lie: `reveal index ${nonChallenged} instead of a challenged one`, item: { ...base, idx: nonChallenged } },
  ];
  const rows: any[] = [];
  for (const k of cases) {
    const off = L.checkReveal(k.ctx ?? c, k.item);
    const notChallenged = !fx.suite.challenge.includes(k.item.idx);
    const row: any = { case: k.name, lie: k.lie, offline: notChallenged ? "rejected: index not in challenge set" : off.ok ? "accepted" : `rejected: ${off.reason}` };
    if (near && k.onchain !== false && !notChallenged) {
      try { const v: any = await near.view("check_reveal", { suite_id: fx.suite.suite_id, model: fx.run.model, item: k.item }); row.onchain_view = v.ok ? "accepted" : `rejected: ${v.reason}`; }
      catch (e) { row.onchain_view = `error: ${String((e as Error).message).slice(0, 160)}`; }
    } else if (notChallenged) row.onchain_view = "reveal() panics: index not in challenge set or already revealed";
    rows.push(row);
  }
  const caught = rows.filter((r) => r.case !== "honest").every((r) => String(r.offline).startsWith("rejected") && (!r.onchain_view || !String(r.onchain_view).startsWith("accepted")));
  const honestOk = rows[0].offline === "accepted" && (!rows[0].onchain_view || rows[0].onchain_view === "accepted");
  out({ ok: caught && honestOk, fixture: f.replace(ROOT + "/", ""), model: fx.run.model, item: base.idx, results: rows,
    summary: `${rows.length - 1}/${rows.length - 1} lies rejected; honest reveal accepted=${honestOk}` });
  if (!(caught && honestOk)) process.exitCode = 1;
}

export async function exportWeb(flags: Record<string, string>) {
  const near = await onchain();
  const fixtures = fixtureFiles(flags).map(rd);
  const suites: Record<string, any> = {};
  for (const fx of fixtures) {
    const id = fx.suite.suite_id;
    if (!suites[id]) suites[id] = { ...fx.suite, runs: [] };
    let audit: any = null;
    if (near) try { audit = await near.view("get_audit", { suite_id: id, model: fx.run.model }); } catch {}
    suites[id].runs.push({ model: fx.run.model, score: [...fx.run.grades].filter((g: string) => g === "1").length, n: fx.suite.n, run_root: fx.run.run_root, nonce: fx.run.nonce, txs: fx.txs, audit, revealed: fx.revealed.map((r: any) => ({ idx: r.idx, question: r.question, answer: r.answer, model_answer: L.extractAnswer(r.response), grade: r.grade, signer: L.recoverSigner(L.signedText(fx.run.model, L.sha256hex(L.buildRequest(fx.suite.request_template, fx.run.model, fx.run.nonce, r.question)), L.sha256hex(r.response)), r.signature) })) });
  }
  const cfg = rd(join(ROOT, "config", "testnet.json"));
  const data = { generated_at: new Date().toISOString(), contract: cfg.contractId, explorer: cfg.explorer, suites: Object.values(suites) };
  const p = join(ROOT, "web", "data.js");
  writeFileSync(p, "window.SEALED_BENCH = " + JSON.stringify(data, null, 1) + ";\n");
  out({ ok: true, wrote: p, suites: Object.keys(suites) });
}
