// Replay mode (`npm run verify`) and tamper demo (`npm run tamper`). Neither needs a NEAR account, a key,
// or a NEAR AI key. Both read the live testnet contract by default (free RPC views pinned to one final block);
// `--offline` replays fixture files only and says so.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "./lib.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
const rd = (p: string) => JSON.parse(readFileSync(p, "utf8"));

function fixtureFiles(flags: Record<string, string>): string[] {
  if (flags.fixture) return [flags.fixture];
  const dirs = (flags.dir ?? "fixtures/real").split(",");
  const files = dirs.flatMap((dd) => {
    const d = join(ROOT, dd);
    if (!existsSync(d)) throw new Error(`fixture folder ${dd} does not exist`);
    return readdirSync(d).filter((f) => f.startsWith("reveal.") && f.endsWith(".json")).sort().map((f) => join(d, f));
  });
  // P0-10: an empty folder must never "verify".
  if (!files.length) throw new Error(`no reveal.*.json fixtures found in ${dirs.join(", ")}: nothing to verify`);
  return files;
}
const ctxOf = (fx: any): L.CheckCtx => ({ suiteRoot: fx.suite.root, n: fx.suite.n, template: fx.suite.request_template, model: fx.run.model, nonce: fx.run.nonce, runRoot: fx.run.run_root, grades: fx.run.grades, pinned: fx.pinned_signers });

type Near = typeof import("./near.ts");
/** On-chain mode is the default. Offline mode only when explicitly asked for; a broken import is an error, not a silent downgrade. */
async function nearOrOffline(flags: Record<string, string>): Promise<Near | null> {
  if (flags.offline) return null;
  try { return await import("./near.ts"); }
  catch (e) { throw new Error(`could not load the NEAR RPC client (${(e as Error).message}). Fix the install (npm ci) or pass --offline to replay fixture files only.`); }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58hex(s: string): string {
  let n = 0n; for (const ch of s) { const v = B58.indexOf(ch); if (v < 0) throw new Error("bad base58"); n = n * 58n + BigInt(v); }
  let h = n.toString(16); if (h.length % 2) h = "0" + h;
  const lead = [...s].findIndex((c) => c !== "1"); return "00".repeat(lead < 0 ? s.length : lead) + h.padStart(64, "0");
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) { const j = i++; out[j] = await f(xs[j]); } }));
  return out;
}

export async function verify(flags: Record<string, string>) {
  const near = await nearOrOffline(flags);
  const files = fixtureFiles(flags);
  const cfg = rd(join(ROOT, "config", "testnet.json"));
  let snap: any = null; const top: any = {};
  if (near) {
    snap = await near.snapshot(); // every read below is pinned to this one final block
    top.block = { height: snap.height, hash: snap.hash };
    top.contract = cfg.contractId;
    top.code_hash_sha256 = b58hex(snap.code_hash);
    top.release_wasm_sha256 = cfg.wasm_sha256;
    top.deployed_code_matches_release_wasm = top.code_hash_sha256 === cfg.wasm_sha256;
  }
  const results: any[] = [];
  for (const f of files) {
    const fx = rd(f);
    const r: any = { fixture: f.replace(ROOT + "/", ""), suite: fx.suite.suite_id, model: fx.run.model, checks: {} };
    let c = ctxOf(fx); let challenge: number[] = fx.suite.challenge; let seed = fx.suite.draw_seed; let k = fx.suite.k;
    if (near) {
      if (fx.contract && fx.contract !== cfg.contractId) { r.checks.fixture_is_for_this_contract = false; r.note = `fixture is for ${fx.contract}, config is ${cfg.contractId}`; results.push({ ...r, ok: false }); continue; }
      const h = snap.height;
      const st: any = await near.view("get_suite", { suite_id: fx.suite.suite_id }, h);
      const run: any = await near.view("get_run", { suite_id: fx.suite.suite_id, model: fx.run.model }, h);
      if (!st || !run) { r.checks.suite_and_run_exist_on_chain = false; results.push({ ...r, ok: false }); continue; }
      // Context comes from the chain, not from the file: the file only supplies the revealed bytes.
      c = { suiteRoot: st.root, n: st.n, template: st.request_template, model: fx.run.model, nonce: run.nonce, runRoot: run.run_root, grades: run.grades, pinned: run.signers };
      challenge = st.challenge; seed = st.draw_seed; k = st.k;
      r.checks.fixture_matches_chain = JSON.stringify(ctxOf(fx)) === JSON.stringify(c) && JSON.stringify(fx.suite.challenge) === JSON.stringify(st.challenge);
      r.checks.onchain_status_audited = run.status === "Audited";
      r.checks.onchain_revealed_set_is_the_challenge = JSON.stringify([...run.revealed].sort((a: number, b: number) => a - b)) === JSON.stringify(st.challenge);
      // Every one of the k sampled items is re-checked by the contract's own check_reveal view at the pinned block.
      const views = await pool(fx.revealed, 5, (it: any) => near.view<any>("check_reveal", { suite_id: fx.suite.suite_id, model: fx.run.model, item: it }, h));
      r.checks.onchain_check_reveal_all_k = views.length === k && views.every((v) => v.ok);
      r.onchain = { status: run.status, draw_height: st.draw_height, drawn_by: st.drawn_by, owner: st.owner, run_signers: run.signers, check_reveal_ok: `${views.filter((v) => v.ok).length}/${views.length}` };
      r.checks.drawn_by_non_owner = st.drawn_by !== st.owner;
      if (!fx.run.model.startsWith("mock/")) {
        // The signer the run used must be pinned with the sha256 of an attestation report that is in this repo.
        const pins: any[] = await near.view("get_signers", { model: fx.run.model }, h);
        const rawF = join(ROOT, "fixtures", "attestation", `${fx.run.model.replace(/[^A-Za-z0-9.-]+/g, "_")}.report.raw.json`);
        const sha = existsSync(rawF) ? L.sha256hex(readFileSync(rawF, "utf8")) : null;
        r.checks.signer_pinned_with_repo_attestation = run.signers.every((a: string) => pins.some((p) => p.address === a && p.attestation_sha256 === sha));
      }
    }
    r.checks.challenge_rederived_from_seed = JSON.stringify(L.drawIndices(Buffer.from(seed, "hex"), fx.suite.suite_id, c.n, k)) === JSON.stringify(challenge);
    const items = fx.revealed.map((it: L.RevealItem) => ({ idx: it.idx, ...L.checkReveal(c, it) }));
    r.checks.revealed_exactly_the_challenge = JSON.stringify(fx.revealed.map((i: any) => i.idx)) === JSON.stringify(challenge);
    r.checks.all_k_replay_locally = items.length === k && items.every((i: any) => i.ok);
    r.score = { owner_reported: [...c.grades].filter((g) => g === "1").length, n: c.n };
    r.sample = { k, verified: items.filter((i: any) => i.ok).length, correct_in_sample: items.filter((i: any) => i.correct).length };
    r.signers = [...new Set(items.map((i: any) => i.recovered_signer))];
    if (near && top.deployed_code_matches_release_wasm === false) r.checks.deployed_code_matches_release_wasm = false;
    r.ok = Object.values(r.checks).every(Boolean);
    r.claim = `Owner-reported score ${r.score.owner_reported}/${r.score.n}; ${r.sample.verified}/${k} randomly sampled entries matched TEE-signed responses and re-graded. A spot check, not a proof.`;
    if (fx.run.model.startsWith("mock/")) r.warning = "DEV-ONLY mock signer (public key, not NEAR AI, not a TEE): this fixture rehearses the protocol only.";
    if (flags.verbose) r.items = items;
    results.push(r);
  }
  const ok = results.every((r) => r.ok);
  out({ ok, mode: near ? `on-chain: context read from ${cfg.contractId} at final block ${snap.height}; all k items re-checked by the contract's check_reveal view and replayed locally` : "OFFLINE (explicit --offline): fixture self-consistency only; proves nothing about what is on-chain", ...top, results });
  if (!ok) process.exitCode = 1;
}

const ROGUE = "0x" + "07".repeat(32);
const VIEW = "on-chain view: check_reveal on the deployed contract";
const WHATIF = "offline what-if: the attacker would have to re-commit; replayed with lib.ts (a line-for-line port of check_inner, shared parser table)";
const RULE = "contract rule: a transaction-level rule a view cannot exercise; covered by the named unit test";

export async function tamper(flags: Record<string, string>) {
  const near = await nearOrOffline(flags);
  const ff = fixtureFiles(flags);
  const base_ = (x: string) => x.split("/").pop()!;
  const f = ff.find((x) => /^reveal\.[^/]*-sealed-[^/]*\.json$/.test(base_(x)) && !/mock/.test(base_(x))) ?? ff[0]; const fx = rd(f); const c = ctxOf(fx);
  const base: L.RevealItem = fx.revealed.find((i: any) => i.grade === 1) ?? fx.revealed[0];
  const other: L.RevealItem = fx.revealed.find((i: any) => i.idx !== base.idx);
  const nonChallenged = [...Array(fx.suite.n).keys()].find((i) => !fx.suite.challenge.includes(i))!;
  const h = near ? (await near.snapshot()).height : 0;
  type Case = { name: string; lie: string; mode: string; item?: L.RevealItem; ctx?: L.CheckCtx; expect: "rejected" | "accepted"; test?: string; note?: string };
  const selfSigned = (() => {
    const rq = L.sha256hex(L.buildRequest(c.template, c.model, c.nonce, base.question));
    const sig = L.signEip191(ROGUE, L.signedText(c.model, rq, L.sha256hex(base.response)));
    const leaf = L.runLeaf(base.idx, rq, L.sha256hex(base.response), sig, base.grade);
    return { item: { ...base, signature: sig }, ctx: { ...c, runRoot: L.rootFromProof(leaf, base.idx, base.run_proof) } };
  })();
  const staleNonce = (() => {
    // A response signed under an old nonce, committed with a run root that is consistent with the NEW nonce:
    // the Merkle checks pass, so the lie is caught only by the signature over the rebuilt request bytes.
    const nonce = "ab".repeat(32);
    const leaf = L.runLeaf(base.idx, L.sha256hex(L.buildRequest(c.template, c.model, nonce, base.question)), L.sha256hex(base.response), base.signature, base.grade);
    return { item: base, ctx: { ...c, nonce, runRoot: L.rootFromProof(leaf, base.idx, base.run_proof) } };
  })();
  const pPass = (80 * 79) / (100 * 99);
  const cases: Case[] = [
    { name: "honest", lie: "none (baseline)", mode: VIEW, item: base, expect: "accepted" },
    { name: "edit_response", lie: "change the model's answer in the response bytes", mode: VIEW, item: { ...base, response: base.response.replace(/ANSWER: (-?\d+)/g, (_m, d) => `ANSWER: ${Number(d) + 1}`) }, expect: "rejected" },
    { name: "flip_one_byte", lie: "add one space to the response", mode: VIEW, item: { ...base, response: base.response.replace(" ", "  ") }, expect: "rejected" },
    { name: "change_answer_key", lie: "change the sealed answer key after the fact", mode: VIEW, item: { ...base, answer: base.answer + 1 }, expect: "rejected" },
    { name: "swap_question", lie: "reveal a different (easier) question", mode: VIEW, item: { ...base, question: base.question.replace(/\d+/, (d) => String(Number(d) + 1)) }, expect: "rejected" },
    { name: "flip_grade", lie: "claim a wrong answer was right (or vice versa)", mode: VIEW, item: { ...base, grade: base.grade ^ 1 }, expect: "rejected" },
    { name: "borrow_signature", lie: "reuse a valid NEAR AI signature from another item", mode: VIEW, item: { ...base, signature: other.signature }, expect: "rejected" },
    { name: "bad_salt", lie: "use a non-hex salt (P0-4)", mode: VIEW, item: { ...base, salt: base.salt.toUpperCase().replace(/^./, "Z") }, expect: "rejected" },
    { name: "cherry_pick", lie: `reveal index ${nonChallenged} instead of a challenged one`, mode: VIEW, item: { ...base, idx: nonChallenged }, expect: "rejected", note: "reveal() also refuses any index outside the challenge set" },
    { name: "self_signed", lie: "sign responses with the owner's own key and commit a consistent run root", mode: WHATIF, ...selfSigned, expect: "rejected" },
    { name: "stale_nonce", lie: "reuse a response signed under an earlier run's nonce, with a run root consistent with the new nonce", mode: WHATIF, ...staleNonce, expect: "rejected" },
    { name: "same_block_draw_reveal", lie: "draw and reveal in one transaction, re-rolling until the sample is favourable (P0-1)", mode: RULE, expect: "rejected", test: "contract/src/tests.rs::p0_1_reveal_in_draw_block_rejected" },
    { name: "signer_pinned_late", lie: "pin a new signer after the run started and use it (P0-2)", mode: RULE, expect: "rejected", test: "contract/src/tests.rs::p0_2_signer_pinned_after_start_does_not_count" },
    { name: "late_commit", lie: "commit a run after its commit deadline, or a duplicate suite root (P0-3)", mode: RULE, expect: "rejected", test: "contract/src/tests.rs::p0_3_late_commit_rejected, p0_3_duplicate_root_rejected" },
    // Honest rows: lies that still succeed. These are limits of a spot check and are published, not hidden.
    { name: "inflate_2_unsampled", lie: "flip 2 of 100 grades from 0 to 1 and hope neither is sampled", mode: "math: hypergeometric, k=20 of n=100", expect: "accepted", note: `STILL SUCCEEDS ${(pPass * 100).toFixed(0)}% of the time (caught ${((1 - pPass) * 100).toFixed(0)}%). Inflating 10 of 100 passes one audit 9.5% of the time, so ten fresh re-salted suites give at least one pass 63% of the time; owner_record makes those repeated suites public.` },
    { name: "best_of_n_reroll", lie: "call the model several times under the same run nonce and keep the best signed response per item", mode: "inferred from the protocol", expect: "accepted", note: "STILL SUCCEEDS: every kept response is genuinely TEE-signed. temperature 0 makes re-rolls mostly identical, but nothing on-chain forbids them." },
    { name: "abandon_and_retry", lie: "abandon a bad run before the draw and start again", mode: "inferred from the protocol", expect: "accepted", note: "STILL POSSIBLE but PUBLIC: the run is marked Abandoned and the bond is forfeited; owner_record lists it." },
  ];
  const rows: any[] = [];
  for (const k of cases) {
    const row: any = { case: k.name, lie: k.lie, mode: k.mode, expected: k.expect };
    if (k.item && k.mode === VIEW) {
      const off = L.checkReveal(c, k.item);
      row.offline_replay = off.ok ? "accepted" : `rejected: ${off.reason}`;
      if (near) {
        try { const v: any = await near.view("check_reveal", { suite_id: fx.suite.suite_id, model: fx.run.model, item: k.item }, h); row.result = v.ok ? "accepted" : `rejected: ${v.reason}`; }
        catch (e) {
          const m = String((e as Error).message);
          row.result = /panicked|Smart contract/.test(m) ? `rejected (view panicked): ${m.slice(0, 120)}` : `INCONCLUSIVE (RPC error): ${m.slice(0, 120)}`;
        }
      } else { row.result = `${row.offline_replay} (offline only)`; row.mode = "offline replay (explicit --offline)"; }
    } else if (k.item) {
      const off = L.checkReveal(k.ctx ?? c, k.item); row.result = off.ok ? "accepted" : `rejected: ${off.reason}`;
    } else row.result = k.expect === "rejected" ? `rejected by rule (see ${k.test})` : "accepted (known limit)";
    if (k.test) row.test = k.test; if (k.note) row.note = k.note;
    row.as_expected = String(row.result).startsWith(k.expect);
    rows.push(row);
  }
  const inconclusive = rows.filter((r) => String(r.result).startsWith("INCONCLUSIVE")).length;
  const lies = rows.filter((r) => r.expected === "rejected");
  const ok = rows.every((r) => r.as_expected) && !inconclusive;
  const by = (m: string) => lies.filter((r) => r.mode === m).length;
  out({ ok, fixture: f.replace(ROOT + "/", ""), model: fx.run.model, item: base.idx, block: near ? h : null, results: rows,
    summary: `${lies.filter((r) => r.as_expected).length}/${lies.length} lies rejected (${near ? by(VIEW) + " by the live contract view" : by("offline replay (explicit --offline)") + " offline only"}, ${by(WHATIF)} offline what-if, ${by(RULE)} by contract rules with unit tests); honest reveal accepted; ${rows.filter((r) => r.expected === "accepted" && r.case !== "honest").length} known limits still succeed and are listed${inconclusive ? `; ${inconclusive} INCONCLUSIVE (RPC)` : ""}.` });
  if (!ok) process.exitCode = 1;
}

export async function exportWeb(flags: Record<string, string>) {
  const near = flags.offline ? null : await import("./near.ts");
  const fixtures = fixtureFiles(flags).map(rd);
  const suites: Record<string, any> = {};
  for (const fx of fixtures) {
    const id = fx.suite.suite_id;
    if (!suites[id]) suites[id] = { ...fx.suite, contract: fx.contract, runs: [] };
    let audit: any = null;
    if (near) try { audit = await near.view("get_audit", { suite_id: id, model: fx.run.model }); } catch {}
    suites[id].runs.push({ model: fx.run.model, grades: fx.run.grades, score: [...fx.run.grades].filter((g: string) => g === "1").length, n: fx.suite.n, run_root: fx.run.run_root, nonce: fx.run.nonce, txs: fx.txs, audit, revealed: fx.revealed.map((r: any) => ({ idx: r.idx, question: r.question, answer: r.answer, model_answer: L.responseAnswer(r.response), grade: r.grade, signer: L.recoverSigner(L.signedText(fx.run.model, L.sha256hex(L.buildRequest(fx.suite.request_template, fx.run.model, fx.run.nonce, r.question)), L.sha256hex(r.response)), r.signature) })) });
  }
  const cfg = rd(join(ROOT, "config", "testnet.json"));
  // Pre-registered paired gap per (family, model), from the committed grade vectors in the fixtures.
  const { pairedGap } = await import("./gap.ts");
  const gaps: any[] = [];
  for (const pub of fixtures.filter((x) => /-public-/.test(x.suite.suite_id) && !x.run.model.startsWith("mock/"))) {
    const fam = pub.suite.suite_id.split("-public-")[0];
    const sea = fixtures.find((x) => x.suite.suite_id.startsWith(fam + "-sealed-") && x.run.model === pub.run.model);
    if (!sea) continue;
    const c = (g: string) => [...g].filter((x) => x === "1").length;
    gaps.push({ family: fam, public_suite: pub.suite.suite_id, sealed_suite: sea.suite.suite_id, model: pub.run.model, public: [c(pub.run.grades), pub.suite.n], sealed: [c(sea.run.grades), sea.suite.n], ...pairedGap(pub.run.grades, sea.run.grades) });
  }
  const data = { generated_at: new Date().toISOString(), contract: cfg.contractId, explorer: cfg.explorer, wasm_sha256: cfg.wasm_sha256, gaps, suites: Object.values(suites) };
  const p = join(ROOT, "web", "data.js");
  writeFileSync(p, "window.SEALED_BENCH = " + JSON.stringify(data, null, 1) + ";\n");
  out({ ok: true, wrote: p, suites: Object.keys(suites) });
}
