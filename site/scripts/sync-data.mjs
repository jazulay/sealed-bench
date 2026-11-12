// Builds the site's offline snapshot from the repo fixtures + live testnet views.
// Usage: node scripts/sync-data.mjs [repoRoot]   (default: ..)
// Output: public/data/snapshot.json and public/data/reveal/*.json (full reveal items, used by the in-browser check_reveal).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "..");
const out = resolve("public/data");
mkdirSync(join(out, "reveal"), { recursive: true });
const CFG = JSON.parse(readFileSync(resolve("site.config.json"), "utf8"));
const CONTRACT = process.env.CONTRACT_ID || CFG.contractId;
const RPCS = CFG.rpcs;

async function view(method, args = {}) {
  let err;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "call_function", finality: "final", account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
      });
      const j = await r.json();
      if (j.error || j.result?.error) throw new Error(JSON.stringify(j.error ?? j.result.error).slice(0, 200));
      return { value: JSON.parse(Buffer.from(j.result.result).toString()), block: j.result.block_height };
    } catch (e) { err = e; }
  }
  throw err;
}

// Lifecycle txs that are not in the reveal fixtures (copied from README.md), keyed by contract.
const LIFECYCLE_BY_CONTRACT = { "sealedbench-hk26.testnet": {
  "gsm-sealed-v1": { commit_suite: "3sLmbCT7k1oezuHvdx4CYtEWpWn5GJQM3ENBWs6EDqtC", draw: "7E16QVernNhChGY1vDPJByCHjUYhWJPGnMqTZtx5E1nx",
    runs: { "Qwen/Qwen3.8-27B": { start: "5viv97ALBkSuUakjLdreo1aPTehnSQrmbRkKbUjhew2V", commit: "DuYm5atLYBoffE7GPsNCxwrkD2s93tTXjh5Wgvd2GgNM" },
            "z-ai/glm-5.3-flash": { start: "Hmtcw4Fj9tezeLPd99AcXzZALPEGnwXBytC2hGz7Qnp2", commit: "2kryJioRm1a5xMCjKf7NW2QYZd5tsdQTsC8en4pUEnQc" } } },
  "gsm-public-v1": { commit_suite: "BK1isLNNJCJekjkcctcCTBKQCGtt68E48KnSCfBwDSQC", draw: "5eAkJpHFnU4YJfFTXmisgHsxE6Q85yLAUssVoFYz8PRA",
    runs: { "Qwen/Qwen3.8-27B": { start: "CLwwsUvXkFKJhN7Cz3WnHA8ihuXWZGRjHMWFGSi8EhFU", commit: "FFsNvhKaXqT7DoFWHP2BQu9QNqCrL5Cg4tCxQ7E96fGo" },
            "z-ai/glm-5.3-flash": { start: "8CC1kz9MnoDqWjU2AfotjcwtMzy4dXvDBWkNYcgCHh5K", commit: "DNbSLgKGFpDLJ6N62HPfpCrgCxfXQawazz8gN2xsRDxk" } } },
  "demo-mock-sealed-v1": { draw: "4JBDqxxztMWd8oh3YxZ7K2gJgfEC83xL4LKUjUKaKs6e" },
  "demo-mock-public-v1": { draw: "2u6c8txuRbEHZaTRVv3jQrzmYCgrqTcWjkbVd7ZFvFEW" },
  "demo-mock-cheat-v2": { draw: "2Ddwwjxk8HLSDXjfrpeBLP2Jbc6QJNP8sFEuaFj74QEf" },
} };
// v2+: the publishing workstream writes fixtures/lifecycle-v2.json ({contract, txs: {suite: {commit_suite, draw, runs}}}).
for (const f of ["fixtures/lifecycle-v2.json"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, "utf8"));
  if (j.contract) LIFECYCLE_BY_CONTRACT[j.contract] = Object.fromEntries(Object.entries(j.txs).filter(([k]) => !k.startsWith("_")));
}
const LIFECYCLE = LIFECYCLE_BY_CONTRACT[CONTRACT] ?? {};

const content = (raw) => { try { return JSON.parse(raw).choices[0].message.content ?? ""; } catch { return ""; } };
// Use the CLI's grader (a JS mirror of the contract's) so the site shows the answer the contract would parse.
let responseAnswer;
try { responseAnswer = (await import(join(root, "cli/src/lib.ts"))).responseAnswer; } catch (e) { console.warn("could not load cli/src/lib.ts grader:", e.message); }
if (typeof responseAnswer !== "function") throw new Error("cli/src/lib.ts responseAnswer is required so the site matches the contract's grader");
const safe = (m) => m.replace(/[^A-Za-z0-9.-]+/g, "_");

const files = [];
// v1 fixtures moved to fixtures/legacy-v1/ when v2 landed; read both layouts. Fixtures for another contract are skipped below.
const dirs = ["", "legacy-v1/"].flatMap((pre) => [[`fixtures/${pre}real`, "real"], [`fixtures/${pre}demo`, "rehearsal"], [`fixtures/${pre}demo-fail`, "rehearsal"]]);
for (const [dir, kind] of dirs) {
  const p = join(root, dir);
  if (!existsSync(p)) continue;
  for (const f of readdirSync(p).filter((f) => f.startsWith("reveal.") && f.endsWith(".json"))) files.push({ kind, j: JSON.parse(readFileSync(join(p, f), "utf8")) });
}

const suites = new Map();
const signers = {};
let block = 0;
for (const { kind, j } of files) {
  const sid = j.suite.suite_id, model = j.run.model;
  if (j.contract && j.contract !== CONTRACT) { console.warn(`skip ${sid}/${model}: fixture is for ${j.contract}`); continue; }
  if (suites.get(sid)?.runs.some((r) => r.model === model)) continue; // same fixture in both layouts
  if (!suites.has(sid)) {
    const { value: s, block: b } = await view("get_suite", { suite_id: sid });
    block = Math.max(block, b);
    suites.set(sid, { suite_id: sid, kind, owner: s.owner, note: s.note, root: s.root, n: s.n, k: s.k, commit_height: s.commit_height, challenge: s.challenge, draw_height: s.draw_height, draw_seed: s.draw_seed, drawn_by: s.drawn_by, reveal_deadline: s.reveal_deadline, bond_payee: s.bond_payee, bond_paid: s.bond_paid, request_template: s.request_template, lifecycle: LIFECYCLE[sid] ?? {}, runs: [] });
  }
  if (!signers[model]) signers[model] = (await view("get_signers", { model })).value;
  const { value: run } = await view("get_run", { suite_id: sid, model });
  const { value: audit } = await view("get_audit", { suite_id: sid, model });
  const file = `${safe(sid)}__${safe(model)}.json`;
  writeFileSync(join(out, "reveal", file), JSON.stringify({ suite_id: sid, model, items: j.revealed }));
  suites.get(sid).runs.push({
    model, status: run.status, score: run.score, grades: run.grades, nonce: run.nonce, run_root: run.run_root, start_height: run.start_height, commit_height: run.commit_height,
    revealed: run.revealed, sample_correct: run.sample_correct, fail_reason: run.fail_reason, claim: audit.claim, signers: run.signers, commit_deadline: run.commit_deadline,
    reveal_file: file, reveal_txs: j.txs.map((t) => ({ tx: t.tx, status: t.status })),
    entries: j.revealed.map((it) => { const c = content(it.response); const a = responseAnswer(it.response); return { idx: it.idx, question: it.question, answer: it.answer, grade: it.grade, content: c, model_answer: a == null ? null : String(a), signature: it.signature }; }),
  });
}
const order = (s) => (s.kind === "real" ? 0 : 10) + (/^gsm/.test(s.suite_id) ? 2 : 0) + (/sealed/.test(s.suite_id) ? 0 : 1) + (/cheat/.test(s.suite_id) ? 1 : 0);
// Paired public-vs-sealed gap, computed by the CLI from chain data (method in PREREGISTRATION.md).
import { execFileSync } from "node:child_process";
const GAP_PAIRS = [["AIME-style (pre-registered)", "aime-public-v1", "aime-sealed-v1"], ["GSM8K control", "gsm-public-v2", "gsm-sealed-v2"]];
const gaps = [];
for (const [label, pub, sea] of GAP_PAIRS) {
  if (!suites.has(pub) || !suites.has(sea)) continue;
  const g = JSON.parse(execFileSync("node", [join(root, "cli/src/cli.ts"), "gap", "--public", pub, "--sealed", sea], { cwd: root, encoding: "utf8" }));
  if (!g.ok || g.contract !== CONTRACT) throw new Error(`gap ${pub}/${sea} failed or is for another contract`);
  gaps.push({ label, public: pub, sealed: sea, block: g.block, method: g.method, rows: g.rows });
}
const snapshot = { generated_at: new Date().toISOString(), block_height: block, contract: CONTRACT, network: "testnet", explorer: "https://testnet.nearblocks.io", signers, suites: [...suites.values()].sort((a, b) => order(a) - order(b)), gaps };
writeFileSync(join(out, "snapshot.json"), JSON.stringify(snapshot));
console.log(JSON.stringify({ ok: true, suites: snapshot.suites.map((s) => `${s.suite_id}: ${s.runs.map((r) => `${r.model} ${r.score}/${s.n} ${r.status}`).join(", ")}`), block }, null, 1));
