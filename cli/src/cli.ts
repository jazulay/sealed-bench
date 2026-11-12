#!/usr/bin/env node
// Sealed Bench CLI. Every command prints one JSON object to stdout.
//   node cli/src/cli.ts <command> [--flag value ...]     (Node >= 22.18, native TypeScript type stripping)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import * as L from "./lib.ts";
import { TEMPLATES } from "./templates.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags: Record<string, string> = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const k = argv[i].slice(2);
    flags[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
  }
}
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
const rd = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const wr = (p: string, o: unknown) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 1) + "\n"); };
const slug = (m: string) => m.replace(/[^A-Za-z0-9._-]/g, "_");
const need = (k: string) => { if (!flags[k]) throw new Error(`--${k} is required`); return flags[k]; };
const dirOf = () => flags.dir ?? join(ROOT, "runs", need("suite"));
const nearMod = () => import("./near.ts");

// DEV-ONLY mock signer: a publicly known key. It is NOT NEAR AI and NOT a TEE. It exists only so the full
// on-chain flow can be rehearsed before a NEAR AI Cloud key is available. Its model id says so.
export const MOCK_MODEL = "mock/DEV-ONLY-not-a-TEE";
const MOCK_KEY = "0x" + createHash("sha256").update("sealed-bench DEV-ONLY mock signer -- NOT NEAR AI, NOT A TEE").digest("hex");
export const MOCK_ADDRESS = L.addressOf(MOCK_KEY);

// Public, committed with each suite. Thinking is switched off (Qwen3 honours enable_thinking=false; GLM still
// returns a short reasoning_content, which the contract ignores: it grades only the `content` field).
export const REQUEST_TEMPLATE =
  '{"model":"{MODEL}","messages":[{"role":"system","content":"You are taking a math test. Solve the problem concisely. Your reply must end with one final line of the form ANSWER: <integer> (digits only, no units). Run nonce: {NONCE}"},{"role":"user","content":{QUESTION}}],"temperature":0,"max_tokens":1024,"stream":false,"chat_template_kwargs":{"enable_thinking":false}}';

function gen() {
  const suite = need("suite");
  const kind = flags.kind ?? "sealed"; // sealed | public
  const seed = flags.seed ?? randomBytes(32).toString("hex");
  const per = Number(flags.per ?? 4);
  const r = L.seededRng(seed, suite);
  let items: { idx: number; salt: string; answer: number; question: string; template: string; gsm8k: number }[];
  if (kind === "public") {
    const pub = rd(join(ROOT, "data", "public-gsm8k-25.json")).items;
    items = pub.map((p: any, idx: number) => ({ idx, salt: r.hex32(), answer: p.answer, question: p.question, template: "original", gsm8k: p.gsm8k_test_index }));
  } else {
    items = [];
    for (let v = 0; v < per; v++) for (const t of TEMPLATES) {
      const { question, answer } = t.make(r);
      if (!Number.isInteger(answer) || answer <= 0) throw new Error(`template ${t.id} produced ${answer}`);
      items.push({ idx: items.length, salt: r.hex32(), answer, question, template: t.id, gsm8k: t.gsm8k });
    }
  }
  const levels = L.buildTree(items.map((it) => L.itemLeaf(it.idx, it.salt, it.answer, it.question)));
  const root = L.rootOf(levels);
  const dir = dirOf();
  const secret = { suite_id: suite, kind, seed, root, n: items.length, request_template: REQUEST_TEMPLATE, items };
  wr(join(dir, "suite.secret.json"), secret);
  wr(join(dir, "suite.public.json"), { suite_id: suite, kind, root, n: items.length, request_template: REQUEST_TEMPLATE, templates: [...new Set(items.map((i) => i.template))].length, note: kind === "public" ? "public originals from GSM8K test" : "sealed numeric variants; items stay secret except challenged reveals" });
  out({ ok: true, suite, kind, n: items.length, root, dir, secret_file: join(dir, "suite.secret.json"), warning: kind === "sealed" && !flags.seed ? "seed is secret: keep suite.secret.json out of git" : undefined });
}

function mockResponse(model: string, chatId: string, question: string, answer: number, idx: number, publicSet: boolean): string {
  // Simulated model: right more often on public originals (memorized) than on sealed variants.
  const h = createHash("sha256").update(`mock|${chatId}`).digest();
  const p = publicSet ? 0.92 : 0.7;
  const right = h[0] / 256 < p;
  const a = right ? answer : answer + 1 + (h[1] % 9);
  const content = `(DEV-ONLY simulated model output for item ${idx}.)\nWorking...\nANSWER: ${a}`;
  return JSON.stringify({ id: chatId, object: "chat.completion", created: 0, model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(question.length / 4), completion_tokens: 20 } });
}

async function infer() {
  const dir = dirOf();
  const s = rd(join(dir, "suite.secret.json"));
  const model = flags.mock ? MOCK_MODEL : need("model");
  const runFile = join(dir, `run.${slug(model)}.json`);
  const run = rd(runFile);
  if (!run.nonce) throw new Error("run has no nonce; call start-run first");
  const { signedCompletion } = await import("./nearai.ts");
  const entries = run.entries ?? [];
  const limit = Number(flags.limit ?? s.n);
  // Cross-check the exact request bytes against the contract's own builder before spending any inference.
  const { view } = await nearMod();
  const onchainReq = await view<string>("build_request_for", { suite_id: s.suite_id, model, question: s.items[0].question });
  if (onchainReq !== L.buildRequest(s.request_template, model, run.nonce, s.items[0].question)) throw new Error("request bytes differ from contract build_request_for; refusing to run");
  const todo = s.items.slice(0, limit).filter((it: any) => !entries[it.idx]?.signature);
  const conc = Number(flags.concurrency ?? (flags.mock ? 1 : 6));
  let failures = 0;
  const one = async (it: any) => {
    const request = L.buildRequest(s.request_template, model, run.nonce, it.question);
    let e: any;
    if (flags.mock) {
      const chat_id = `mock-${run.nonce.slice(0, 8)}-${it.idx}`;
      const response = mockResponse(model, chat_id, it.question, it.answer, it.idx, s.kind === "public");
      const text = L.signedText(model, L.sha256hex(request), L.sha256hex(response));
      e = { request, response, chat_id, signature: L.signEip191(MOCK_KEY, text), signing_address: MOCK_ADDRESS, signature_kind: "DEV-ONLY-mock", text };
    } else {
      for (let attempt = 1; ; attempt++) {
        try { e = await signedCompletion(model, request); break; }
        catch (err) { if (attempt >= 3) { failures++; process.stderr.write(`#${it.idx} FAILED: ${(err as Error).message.slice(0, 200)}\n`); return; } await new Promise((r) => setTimeout(r, 3000 * attempt)); }
      }
    }
    const rawAns = L.responseAnswer(e.response);
    let usage: any = null; let finish: any = null;
    try { const j = JSON.parse(e.response); usage = j.usage ?? null; finish = j.choices?.[0]?.finish_reason ?? null; } catch {}
    entries[it.idx] = { idx: it.idx, ...e, req_hash: L.sha256hex(e.request), resp_hash: L.sha256hex(e.response), model_answer: rawAns, grade: rawAns === it.answer ? 1 : 0, usage, finish_reason: finish };
    run.entries = entries;
    wr(runFile, run);
    process.stderr.write(`#${it.idx} answer=${rawAns} key=${it.answer} grade=${entries[it.idx].grade} finish=${finish} out=${usage?.completion_tokens}\n`);
  };
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.max(1, conc) }, async () => { while (queue.length) await one(queue.shift()); }));
  const tokens = entries.filter(Boolean).reduce((a: any, e: any) => ({ in: a.in + (e.usage?.prompt_tokens ?? 0), out: a.out + (e.usage?.completion_tokens ?? 0) }), { in: 0, out: 0 });
  if (failures) process.stderr.write(`${failures} items failed; re-run infer to resume\n`);
  const done = entries.filter(Boolean).length;
  out({ ok: done === s.n, model, mock: !!flags.mock, done, of: s.n, tokens, correct: entries.filter((e: any) => e?.grade === 1).length, run_file: runFile });
}

function runTree(entries: any[]) {
  return L.buildTree(entries.map((e) => L.runLeaf(e.idx, e.req_hash, e.resp_hash, e.signature, e.grade)));
}

async function main() {
  switch (cmd) {
    case "gen": return gen();
    case "attest": {
      const { attest } = await import("./nearai.ts");
      const model = need("model");
      const a = await attest(model);
      const f = join(ROOT, "fixtures", "attestation", `${slug(model)}.json`);
      const rawFile = f.replace(/\.json$/, ".report.raw.json");
      writeFileSync(rawFile, a.raw); // exact bytes: sha256(file) == attestation_sha256 pinned on-chain
      wr(f, { fetched_at: new Date().toISOString(), nonce: a.nonce, report_sha256: a.report_sha256, signing_address: a.signing_address, checks: a.checks, raw_report_file: rawFile.replace(ROOT + "/", "") });
      return out({ ok: true, model, signing_address: a.signing_address, attestation_sha256: a.report_sha256, checks: a.checks, saved: f });
    }
    case "pin-signer": {
      const { call, CONFIG } = await nearMod();
      let model = flags.model, address = flags.address, att = flags.attestation ?? "00".repeat(32), note = flags.note ?? "";
      if (flags.mock) { model = MOCK_MODEL; address = MOCK_ADDRESS; note = "DEV-ONLY mock signer with a PUBLIC key. Not NEAR AI, not a TEE. Rehearsal only."; att = L.sha256hex("no attestation: dev mock"); }
      else if (!address) {
        const f = rd(join(ROOT, "fixtures", "attestation", `${slug(model!)}.json`));
        address = f.signing_address; att = f.report_sha256; note = `NEAR AI Cloud model TEE signer; DCAP ${f.checks.dcap_tcb_status}; app_compose ${f.checks.app_compose_sha256}; fetched ${f.fetched_at}`;
      }
      const t = await call(CONFIG.admin, "pin_signer", { model, address, attestation_sha256: att, note });
      return out({ ok: true, model, address, attestation_sha256: att, ...t });
    }
    case "commit-suite": {
      const { call, CONFIG } = await nearMod();
      const dir = dirOf(); const s = rd(join(dir, "suite.public.json"));
      const k = Number(flags.k ?? Math.min(20, s.n));
      const t = await call(CONFIG.owner, "commit_suite", {
        suite_id: s.suite_id, root: s.root, n: s.n, k, request_template: s.request_template,
        challenge_delay_blocks: Number(flags.delay ?? 20), reveal_window_blocks: Number(flags.window ?? 7200), note: flags.note ?? s.note,
      }, flags.bond ?? "0.1");
      return out({ ok: true, suite: s.suite_id, root: s.root, n: s.n, k, ...t });
    }
    case "start-run": {
      const { call, CONFIG } = await nearMod();
      const dir = dirOf(); const s = rd(join(dir, "suite.public.json"));
      const model = flags.mock ? MOCK_MODEL : need("model");
      const t = await call(CONFIG.owner, "start_run", { suite_id: s.suite_id, model });
      const runFile = join(dir, `run.${slug(model)}.json`);
      wr(runFile, { suite_id: s.suite_id, model, nonce: t.result, start_tx: t.tx, entries: [] });
      return out({ ok: true, model, nonce: t.result, run_file: runFile, ...t });
    }
    case "infer": return infer();
    case "commit-run": {
      const { call, CONFIG } = await nearMod();
      const dir = dirOf(); const s = rd(join(dir, "suite.public.json"));
      const model = flags.mock ? MOCK_MODEL : need("model");
      const runFile = join(dir, `run.${slug(model)}.json`); const run = rd(runFile);
      if ((run.entries ?? []).filter(Boolean).length !== s.n) throw new Error("run incomplete; finish infer first");
      if (flags["cheat-inflate"]) { // DEMO OF CHEATING: claim every item correct. The audit must catch this.
        run.entries.forEach((e: any) => { e.grade = 1; }); run.cheat = "inflated grades (demo)";
      }
      const levels = runTree(run.entries);
      const grades = run.entries.map((e: any) => String(e.grade)).join("");
      const t = await call(CONFIG.owner, "commit_run", { suite_id: s.suite_id, model, run_root: L.rootOf(levels), grades });
      run.run_root = L.rootOf(levels); run.grades = grades; run.commit_tx = t.tx; wr(runFile, run);
      return out({ ok: true, model, run_root: run.run_root, score: t.result, n: s.n, ...t });
    }
    case "draw": {
      const { call, CONFIG, view, blockHeight } = await nearMod();
      const suite = need("suite");
      const st: any = await view("get_suite", { suite_id: suite });
      const h = await blockHeight(); const from = st.last_run_commit_height + st.challenge_delay;
      if (h < from && !flags.force) return out({ ok: false, reason: `too early: draw allowed from block ${from}, now ${h}` });
      const t = await call(flags.as ?? CONFIG.owner, "draw_challenge", { suite_id: suite });
      return out({ ok: true, suite, challenge: t.result, ...t });
    }
    case "reveal": {
      const { call, CONFIG, view } = await nearMod();
      const dir = dirOf(); const s = rd(join(dir, "suite.secret.json"));
      const model = flags.mock ? MOCK_MODEL : need("model");
      const run = rd(join(dir, `run.${slug(model)}.json`));
      const st: any = await view("get_suite", { suite_id: s.suite_id });
      if (!st.challenge) throw new Error("challenge not drawn yet");
      const r: any = await view("get_run", { suite_id: s.suite_id, model });
      const sLevels = L.buildTree(s.items.map((it: any) => L.itemLeaf(it.idx, it.salt, it.answer, it.question)));
      const rLevels = runTree(run.entries);
      const items: L.RevealItem[] = st.challenge.filter((i: number) => !r.revealed.includes(i)).map((i: number) => {
        const it = s.items[i], e = run.entries[i];
        return { idx: i, salt: it.salt, answer: it.answer, question: it.question, response: e.response, signature: e.signature, grade: e.grade, suite_proof: L.proofOf(sLevels, i), run_proof: L.proofOf(rLevels, i) };
      });
      const batch = Number(flags.batch ?? 5); const txs: any[] = [];
      let status = r.status;
      for (let i = 0; i < items.length; i += batch) {
        const t = await call(CONFIG.owner, "reveal", { suite_id: s.suite_id, model, items: items.slice(i, i + batch) });
        status = t.result; txs.push({ tx: t.tx, explorer: t.explorer, status });
        if (status === "Failed") break;
      }
      // Publish everything a third party needs to replay this audit (only challenged items are revealed).
      const pinned = (await view<any[]>("get_signers", { model })).map((p) => p.address);
      const fx = { suite: { suite_id: s.suite_id, root: s.root, n: s.n, k: st.k, request_template: s.request_template, challenge: st.challenge, draw_height: st.draw_height, draw_seed: st.draw_seed }, contract: CONFIG.contractId, network: CONFIG.network,
        run: { model, nonce: run.nonce, run_root: run.run_root, grades: run.grades }, pinned_signers: pinned,
        revealed: st.challenge.map((i: number) => { const it = s.items[i], e = run.entries[i];
          return { idx: i, salt: it.salt, answer: it.answer, question: it.question, response: e.response, signature: e.signature, grade: e.grade, suite_proof: L.proofOf(sLevels, i), run_proof: L.proofOf(rLevels, i) }; }),
        txs };
      const f = join(dir, `reveal.${slug(model)}.json`); wr(f, fx);
      return out({ ok: status === "Audited", model, status, revealed: items.length, txs, fixture: f });
    }
    case "status": {
      const { view, CONFIG } = await nearMod();
      const suite = need("suite"); const st: any = await view("get_suite", { suite_id: suite });
      if (!st) return out({ ok: false, reason: "no such suite" });
      const runs = await Promise.all(st.models.map((m: string) => view("get_audit", { suite_id: suite, model: m })));
      return out({ ok: true, contract: CONFIG.contractId, suite: st, audits: runs });
    }
    case "verify": return (await import("./replay.ts")).verify(flags);
    case "tamper": return (await import("./replay.ts")).tamper(flags);
    case "export-web": return (await import("./replay.ts")).exportWeb(flags);
    default:
      out({ ok: false, usage: "gen | attest | pin-signer | commit-suite | start-run | infer | commit-run | draw | reveal | status | verify | tamper | export-web" });
  }
}

main().catch((e) => { out({ ok: false, error: String(e?.message ?? e) }); process.exit(1); });
