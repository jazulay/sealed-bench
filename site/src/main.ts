import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./style.css";
import { view, tx, acct, CONTRACT, ContractError } from "./near";

/* ---------- types ---------- */
type Entry = { idx: number; question: string; answer: number; grade: number; content: string; model_answer: number | string | null; signature: string };
type Run = { model: string; status: string; score: number | null; grades: string | null; nonce: string; run_root: string | null; revealed: number[]; sample_correct: number; fail_reason: string | null; claim: string; reveal_file?: string; reveal_txs?: { tx: string; status: string }[]; entries?: Entry[] };
type Suite = { suite_id: string; kind: "real" | "rehearsal"; owner: string; note: string; root: string; n: number; k: number; challenge: number[] | null; draw_height: number | null; draw_seed: string | null; drawn_by: string | null; reveal_deadline: number | null; lifecycle?: { commit_suite?: string; draw?: string; runs?: Record<string, { start: string; commit: string }> }; runs: Run[] };
type Pin = { address: string; attestation_sha256: string; pinned_height: number; note: string };
type Data = { generated_at: string; block_height: number; contract: string; signers: Record<string, Pin[]>; suites: Suite[]; source: "live" | "snapshot"; rpc?: string };
type RawItem = { idx: number; salt: string; answer: number; question: string; response: string; signature: string; grade: number; suite_proof: string[]; run_proof: string[] };
type Check = { ok: boolean; reason: string; request_sha256: string; response_sha256: string; signed_text: string; recovered_signer: string | null; model_answer: number | null; correct: boolean };

/* ---------- helpers ---------- */
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (h: string | null | undefined, a = 6, b = 4) => (h ? (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h) : "–");
const isMock = (m: string) => m.startsWith("mock/");
const modelLabel = (m: string) => (isMock(m) ? "DEV-ONLY mock" : m.split("/").pop()!);
const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US"));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CHEV = `<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Pin transactions on the v1 testnet contract; other contracts fall back to the contract page.
const PIN_TX: Record<string, string> = CONTRACT !== "sealedbench-hk26.testnet" ? {} : {
  "0x835ab53d20294ef795906dff21ae4c045336aa26": "ArAfm58NWkrdjWPXvfBJ2PqWKGnucpsVcGKVPoaavN72",
  "0x3b753b4406613c5e70ae640508632b600424fa0c": "BGQ1Yy99GdxQbN3A5cbVirmoHKUoYCL685hb4ikk473S",
  "0xa6c3a19d7bdf8743396362411554a92f74fe9fa3": "F1AidK6P6qZaCsfK1AYtxbKgpj1fzJLXn51nVB8XX7go",
};

/* ---------- data ---------- */
async function loadSnapshot(): Promise<Data> {
  const r = await fetch("/data/snapshot.json");
  return { ...(await r.json()), source: "snapshot" };
}

async function loadLive(snap: Data): Promise<Data> {
  const { value: ids, block, rpc } = await view<string[]>("list_suites");
  const bySnap = new Map(snap.suites.map((s) => [s.suite_id, s]));
  const suites = await Promise.all(ids.map(async (id) => {
    const { value: s } = await view<any>("get_suite", { suite_id: id });
    const base = bySnap.get(id);
    const runs = await Promise.all((s.models as string[]).map(async (m) => {
      const [{ value: run }, { value: audit }] = await Promise.all([view<any>("get_run", { suite_id: id, model: m }), view<any>("get_audit", { suite_id: id, model: m })]);
      const sr = base?.runs.find((r) => r.model === m);
      return { ...sr, model: m, status: run.status, score: run.score, grades: run.grades, nonce: run.nonce, run_root: run.run_root, revealed: run.revealed, sample_correct: run.sample_correct, fail_reason: run.fail_reason, claim: audit.claim } as Run;
    }));
    const kind: Suite["kind"] = runs.length && runs.every((r) => isMock(r.model)) ? "rehearsal" : "real";
    return { ...base, suite_id: id, kind, owner: s.owner, note: s.note, root: s.root, n: s.n, k: s.k, challenge: s.challenge, draw_height: s.draw_height, draw_seed: s.draw_seed, drawn_by: s.drawn_by, reveal_deadline: s.reveal_deadline, lifecycle: base?.lifecycle, runs } as Suite;
  }));
  const models = [...new Set(suites.flatMap((s) => s.runs.map((r) => r.model)))];
  const signers: Record<string, Pin[]> = {};
  await Promise.all(models.map(async (m) => { signers[m] = (await view<Pin[]>("get_signers", { model: m })).value; }));
  const rank = (s: Suite) => (s.kind === "real" ? 0 : 10) + (/sealed/.test(s.suite_id) ? 0 : 1) + (/cheat-v1/.test(s.suite_id) ? 5 : 0) + (/cheat-v2/.test(s.suite_id) ? 3 : 0);
  suites.sort((a, b) => rank(a) - rank(b));
  return { generated_at: new Date().toISOString(), block_height: block, contract: CONTRACT, signers, suites, source: "live", rpc };
}

/* ---------- source indicators ---------- */
function setSource(d: Data) {
  const nav = $("#nav-live");
  nav.dataset.state = d.source;
  $("span", nav).textContent = d.source === "live" ? `Live · #${fmt(d.block_height)}` : "Snapshot";
  const fb = $("#fallback");
  if (d.source === "snapshot") {
    fb.hidden = false;
    fb.innerHTML = `<b>Showing a saved snapshot.</b> NEAR testnet RPC didn't answer, so this explorer is showing contract state exported on ${esc(new Date(d.generated_at).toUTCString())} (block #${fmt(d.block_height)}). It refreshes automatically when RPC is back.`;
  } else fb.hidden = true;
  $("#foot-fine").textContent = d.source === "live"
    ? `Live from ${CONTRACT} on NEAR testnet · final block #${fmt(d.block_height)} via ${d.rpc}`
    : `Snapshot of ${CONTRACT} · block #${fmt(d.block_height)} · ${new Date(d.generated_at).toUTCString()}`;
}

/* ---------- stats ---------- */
function countUp(el: HTMLElement, to: number, suffix = "") {
  if (reduced) { el.textContent = fmt(to) + suffix; return; }
  const t0 = performance.now(), from = Number(el.dataset.v ?? 0), dur = 1100;
  el.dataset.v = String(to);
  const step = (t: number) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(Math.round(from + (to - from) * e)) + suffix; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderStats(d: Data) {
  const real = d.suites.filter((s) => s.kind === "real").flatMap((s) => s.runs.map((r) => ({ s, r })));
  const audited = real.filter(({ r }) => r.status === "Audited");
  const verified = audited.reduce((a, { r }) => a + r.revealed.length, 0);
  const signers = Object.entries(d.signers).filter(([m, p]) => !isMock(m) && p.length).length;
  const caught = d.suites.filter((s) => s.kind === "rehearsal").flatMap((s) => s.runs).filter((r) => r.status === "Failed").length;
  const k = (n: string) => $(`#stats [data-k="${n}"]`);
  countUp(k("audited"), audited.length); countUp(k("verified"), verified); countUp(k("signers"), signers); countUp(k("caught"), caught);
}

/* ---------- hero stage ---------- */
function pickHero(d: Data) {
  const s = d.suites.find((x) => x.suite_id === "gsm-sealed-v1" && x.challenge) ?? d.suites.find((x) => x.kind === "real" && x.challenge && x.n === 100) ?? d.suites.find((x) => x.challenge)!;
  const r = s.runs.find((x) => x.grades && x.grades.includes("0") && x.status === "Audited") ?? s.runs[0];
  return { s, r };
}
let heroToken = 0;
async function runHero(d: Data) {
  const token = ++heroToken;
  const { s, r } = pickHero(d);
  const cells = $("#cells"), con = $("#console"), verdict = $("#verdict"), board = $(".board"), cap = $("#v-score");
  $("#stage-path").textContent = `${CONTRACT} / ${s.suite_id} / ${r.model}`;
  $("#stage-src").textContent = d.source === "live" ? `replaying on-chain state · #${fmt(d.block_height)}` : "replaying snapshot state";
  const n = Math.min(s.n, 100);
  cells.innerHTML = Array.from({ length: n }, () => `<i class="cell"></i>`).join("");
  cells.style.gridTemplateColumns = `repeat(${Math.ceil(Math.sqrt(n))}, 1fr)`;
  const els = $$(".cell", cells);
  const grades = r.grades ?? "";
  const ch = s.challenge ?? [];
  const sig = d.signers[r.model]?.[0]?.address ?? "";
  const ents = new Map((r.entries ?? []).map((e) => [e.idx, e]));
  const phases = $$("#phases li");
  const setPhase = (p: number) => phases.forEach((li, i) => { li.classList.toggle("on", i === p); li.classList.toggle("done", i < p); });
  const log = (html: string) => { const div = document.createElement("div"); div.innerHTML = html; con.appendChild(div); while (con.children.length > 14) con.firstElementChild!.remove(); };
  const alive = () => token === heroToken;
  const finalState = () => {
    els.forEach((c, i) => { c.className = "cell sealed" + (grades[i] === "0" ? " miss" : ""); });
    ch.forEach((i) => els[i] && (els[i].className = "cell ok"));
    cells.classList.add("dim"); verdict.classList.add("on"); setPhase(3); cap.textContent = `${r.score}/${s.n} · ${r.revealed.length}/${s.k} sampled entries verified`;
    con.innerHTML = "";
    log(`<span class="k">commit_suite</span> root ${short(s.root, 10, 6)}`);
    log(`<span class="k">commit_run</span> ${esc(modelLabel(r.model))} score <span class="w">${r.score}/${s.n}</span>`);
    log(`<span class="k">draw_challenge</span> seed ${short(s.draw_seed, 10, 6)}`);
    log(`<span class="k">reveal</span> ${ch.length} entries · ecrecover → ${short(sig, 6, 4)}`);
    log(`<span class="g">status AUDITED</span>`);
  };
  if (reduced) { finalState(); return; }
  while (alive()) {
    con.innerHTML = ""; verdict.classList.remove("on"); cells.classList.remove("dim");
    els.forEach((c) => (c.className = "cell"));
    setPhase(0); cap.textContent = `sealing ${s.n} entries…`;
    log(`<span class="k">commit_suite</span> ${esc(s.suite_id)} n=${s.n} k=${s.k}`);
    log(`  root <span class="w">${short(s.root, 16, 8)}</span>`);
    for (let i = 0; i < n && alive(); i += 4) { for (let j = i; j < i + 4 && j < n; j++) els[j].classList.add("sealed"); await sleep(14); }
    await sleep(350);
    log(`<span class="k">start_run</span> ${esc(modelLabel(r.model))} nonce ${short(r.nonce, 10, 4)}`);
    log(`<span class="k">commit_run</span> grades ${esc(grades.slice(0, 14))}… score <span class="w">${r.score}/${s.n}</span>`);
    els.forEach((c, i) => grades[i] === "0" && c.classList.add("miss"));
    cap.textContent = `sealed · root ${short(s.root, 8, 4)} · score ${r.score}/${s.n} committed`;
    await sleep(1300); if (!alive()) return;
    setPhase(1); cap.textContent = `random_seed @ #${fmt(s.draw_height)} → ${ch.length} of ${s.n}`;
    board.classList.remove("scan"); void board.offsetWidth; board.classList.add("scan");
    await sleep(700);
    log(`<span class="k">draw_challenge</span> @ block #${fmt(s.draw_height)}`);
    log(`  random_seed <span class="w">${short(s.draw_seed, 16, 6)}</span>`);
    for (const i of ch) { if (!alive()) return; els[i]?.classList.add("drawn"); await sleep(70); }
    log(`  → [${ch.slice(0, 8).join(", ")}, …] ${ch.length} of ${s.n}`);
    await sleep(1300); if (!alive()) return;
    setPhase(2); cap.textContent = `revealing ${ch.length} entries in ${Math.ceil(ch.length / 5)} transactions`;
    cells.classList.add("dim");
    for (let b = 0; b < ch.length; b += 5) { const t = r.reveal_txs?.[b / 5]; log(`<span class="k">reveal</span> entries ${ch.slice(b, b + 5).join(",")} ${t ? `· tx ${short(t.tx, 7, 0).replace("…", "")}…` : ""}`); await sleep(380); }
    await sleep(500); if (!alive()) return;
    setPhase(3); cap.textContent = `ecrecover → ${short(sig, 6, 4)} · re-grading`;
    for (const [j, i] of ch.entries()) {
      if (!alive()) return;
      els[i]?.classList.remove("drawn"); els[i]?.classList.add("ok");
      if (j % 4 === 0) { const e = ents.get(i); log(`  #${i} ecrecover → <span class="w">${short(sig, 6, 4)}</span> <span class="g">✓</span>${e ? ` answer ${e.model_answer}` : ""}`); }
      await sleep(95);
    }
    log(`<span class="g">status AUDITED · ${r.revealed.length}/${s.k} verified</span>`);
    verdict.classList.add("on"); cap.textContent = `${r.score}/${s.n} · ${r.revealed.length}/${s.k} sampled entries verified`;
    await sleep(4200);
  }
}

/* ---------- protocol steps ---------- */
function renderSteps(d: Data) {
  const { s, r } = pickHero(d);
  const lc = s.lifecycle ?? {}, rl = lc.runs?.[r.model];
  const link = (h?: string, label = "view tx") => (h ? `<a href="${tx(h)}" rel="noopener">${label} ↗</a>` : "");
  const sig = d.signers[r.model]?.[0]?.address;
  const steps = [
    { h: "Commit", p: "The owner seals the test set as a salted Merkle root, then commits each model's full run: a Merkle root over every signed response and the complete grade vector. The contract sums the score itself.", c: [`<span class="c">commit_suite</span> ${esc(s.suite_id)}`, `root ${short(s.root, 12, 6)}`, `<span class="c">commit_run</span> score ${r.score}/${s.n}`, link(lc.commit_suite, "commit_suite")] },
    { h: "Draw", p: "Once every run is committed, the draw is permissionless: anyone can trigger it. NEAR's random_seed picks one shared sample of entries that every run must open.", c: [`<span class="c">draw_challenge</span> #${fmt(s.draw_height)}`, `seed ${short(s.draw_seed, 12, 6)}`, `called by ${esc(s.drawn_by ?? "–")}`, link(lc.draw, "draw")] },
    { h: "Reveal", p: "The owner opens exactly those entries: question, salt, answer key, raw response bytes, TEE signature and both Merkle proofs. Miss the deadline and the run fails.", c: [`<span class="c">reveal</span> ${r.revealed.length} entries`, `in ${r.reveal_txs?.length ?? 4} batches`, r.reveal_txs?.[0] ? link(r.reveal_txs[0].tx, "first reveal") : "", ""] },
    { h: "Verify", p: "For each entry the contract rebuilds the request, hashes both sides, recovers the NEAR AI TEE signer with ecrecover and re-grades the raw answer. The run settles as AUDITED or FAILED.", c: [`<span class="c">ecrecover</span> → ${short(sig, 8, 4)}`, `pinned signer ✓`, `status <span style="color:var(--ok)">${esc(r.status.toUpperCase())}</span>`, ""] },
  ];
  $("#steps").innerHTML = steps.map((x, i) => `<article class="step"><span class="step-n">0${i + 1}</span><h3>${x.h}</h3><p>${x.p}</p><div class="tx">${x.c.filter(Boolean).map((l) => `<div>${l}</div>`).join("")}</div></article>`).join("");
}

/* ---------- explorer ---------- */
const checks = new Map<string, Check | { error: string } | "pending">();
const rawCache = new Map<string, Promise<RawItem[]>>();
const getRaw = (file: string) => { if (!rawCache.has(file)) rawCache.set(file, fetch(`/data/reveal/${file}`).then((r) => r.json()).then((j) => j.items)); return rawCache.get(file)!; };
let cur = { suite: "", model: "" };
let DATA: Data;

function renderTabs(d: Data) {
  const side = $("#ex-suites");
  let html = "", lastKind = "";
  for (const s of d.suites) {
    if (s.kind !== lastKind) { html += `<div class="ex-group ${s.kind === "rehearsal" ? "warn" : ""}">${s.kind === "real" ? "Real · NEAR AI TEE" : "Rehearsal · DEV-ONLY mock signer"}</div>`; lastKind = s.kind; }
    const st = [...new Set(s.runs.map((r) => r.status))];
    html += `<button class="ex-tab" role="tab" id="tab-${esc(s.suite_id)}" aria-selected="${s.suite_id === cur.suite}" aria-controls="ex-main" data-s="${esc(s.suite_id)}" tabindex="${s.suite_id === cur.suite ? 0 : -1}">
      <span class="t1">${esc(s.suite_id)}</span>
      <span class="t2">${s.n} entries · ${s.runs.length} run${s.runs.length === 1 ? "" : "s"} ${st.map((x) => `<span class="pill ${esc(x)}">${esc(x)}</span>`).join("")}</span></button>`;
  }
  side.innerHTML = html;
  $$<HTMLButtonElement>(".ex-tab", side).forEach((b, i, all) => {
    b.onclick = () => selectSuite(b.dataset.s!);
    b.onkeydown = (e) => { const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (dir) { e.preventDefault(); const n = all[(i + dir + all.length) % all.length]; n.focus(); selectSuite(n.dataset.s!); } };
  });
}
function selectSuite(id: string, model?: string) {
  const s = DATA.suites.find((x) => x.suite_id === id)!;
  cur = { suite: id, model: model && s.runs.some((r) => r.model === model) ? model : (s.runs.find((r) => r.model === cur.model) ?? s.runs[0])?.model ?? "" };
  $$(".ex-tab").forEach((b) => { const on = b.dataset.s === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  $("#ex-main").setAttribute("aria-labelledby", `tab-${id}`);
  renderRun();
}
const key = (s: string, m: string, i: number) => `${s}|${m}|${i}`;

function renderRun() {
  const s = DATA.suites.find((x) => x.suite_id === cur.suite)!, r = s.runs.find((x) => x.model === cur.model);
  const main = $("#ex-main");
  if (!r) { main.innerHTML = `<p class="mut">No runs on this suite yet.</p>`; return; }
  const ch = new Set(s.challenge ?? []), grades = r.grades ?? "", ents = new Map((r.entries ?? []).map((e) => [e.idx, e]));
  const lc = s.lifecycle ?? {}, rl = lc.runs?.[r.model];
  const cols = s.n >= 100 ? 20 : s.n >= 25 ? 25 : 10;
  const gv = Array.from({ length: s.n }, (_, i) => {
    const g = grades[i], c = checks.get(key(s.suite_id, r.model, i));
    const st = c && c !== "pending" ? ("ok" in c && c.ok ? " v" : " x") : c === "pending" ? " chk" : "";
    return `<i class="g${g ?? ""}${ch.has(i) ? " s" : ""}${st}" title="entry ${i}${g ? ` · committed grade ${g}` : ""}${ch.has(i) ? " · sampled" : ""}"></i>`;
  }).join("");
  const sampled = [...ch].sort((a, b) => a - b);
  const verifiedCount = sampled.filter((i) => { const c = checks.get(key(s.suite_id, r.model, i)); return c && c !== "pending" && "ok" in c && c.ok; }).length;
  const mock = isMock(r.model);
  main.innerHTML = `
    <div class="run-top">
      <div class="run-id">${esc(CONTRACT)} / <b>${esc(s.suite_id)}</b></div>
      ${s.runs.length > 1 ? `<div class="models" role="group" aria-label="Model">${s.runs.map((x) => `<button type="button" aria-pressed="${x.model === r.model}" data-m="${esc(x.model)}">${esc(modelLabel(x.model))}</button>`).join("")}</div>` : `<span class="pill ${mock ? "mock" : ""}">${esc(mock ? "DEV-ONLY mock" : modelLabel(r.model))}</span>`}
    </div>
    ${mock ? `<div class="mock-warn"><b>Rehearsal.</b> This run is signed by a DEV-ONLY mock key that anyone can use. It is not NEAR AI and not a TEE. It exists to show the protocol working, including catching a cheat. No claim cites it.</div>` : ""}
    <div class="run-hero">
      <div>
        <div class="score">${r.score ?? "–"}<small>/ ${s.n}</small></div>
        <div class="score-sub"><span class="pill ${esc(r.status)}">${esc(r.status)}</span>&nbsp; ${esc(r.model)}</div>
        <blockquote class="claim ${esc(r.status)}">${esc(r.claim)}<cite>— get_audit, verbatim · ${DATA.source === "live" ? `live view, block #${fmt(DATA.block_height)}` : `saved snapshot, block #${fmt(DATA.block_height)}`}</cite></blockquote>
        <dl class="kv">
          <dt>Suite root</dt><dd title="${esc(s.root)}">${esc(short(s.root, 14, 8))}</dd>
          <dt>Run root</dt><dd title="${esc(r.run_root ?? "")}">${esc(short(r.run_root, 14, 8))}</dd>
          <dt>Run nonce</dt><dd>${esc(short(r.nonce, 14, 8))}</dd>
          <dt>Drawn at</dt><dd>${s.draw_height ? `block #${fmt(s.draw_height)} by <a href="${acct(s.drawn_by!)}" rel="noopener">${esc(s.drawn_by)}</a>` : "not drawn yet"}</dd>
          <dt>Owner</dt><dd><a href="${acct(s.owner)}" rel="noopener">${esc(s.owner)}</a></dd>
          ${r.fail_reason ? `<dt>Fail reason</dt><dd style="color:var(--bad);white-space:normal">${esc(r.fail_reason)}</dd>` : ""}
        </dl>
      </div>
      <div class="gv-wrap">
        <div class="gv-head"><span>Committed grade vector · ${s.n} entries</span><span class="mono">${grades ? `${[...grades].filter((g) => g === "1").length} correct` : "not committed"}</span></div>
        <div class="gv" style="--cols:${cols}" role="img" aria-label="Grade vector: ${s.n} entries, ${grades.split("0").length - 1} marked wrong, ${ch.size} sampled by the chain">${gv}</div>
        <div class="legend"><span><i></i>correct</span><span><i class="l0"></i>wrong</span><span><i class="ls"></i>sampled</span><span><i class="lv"></i>verified live</span></div>
        <p class="fine" style="margin:12px 0 0">${esc(s.note)}</p>
      </div>
    </div>
    <div class="ent-head">
      <h3>Sampled entries <span class="mut" style="font-weight:400">· ${sampled.length} drawn · ${r.revealed.length} accepted on-chain · text from published fixtures</span></h3>
      <div class="row-act">
        <span class="prog" id="prog" aria-live="polite">${verifiedCount ? `${verifiedCount}/${sampled.length} re-verified on NEAR` : ""}</span>
        ${r.reveal_file ? `<button class="btn btn-ok btn-sm" type="button" id="verify-all">Re-verify all ${sampled.length} on NEAR</button>` : ""}
      </div>
    </div>
    <div class="ents">${sampled.map((i) => {
      const e = ents.get(i), c = checks.get(key(s.suite_id, r.model, i));
      const vs = c === "pending" ? `<span class="vs">checking…</span>` : c && "ok" in c ? `<span class="vs ${c.ok ? "ok" : "bad"}">${c.ok ? "verified" : "rejected"}</span>` : c ? `<span class="vs bad">error</span>` : `<span class="vs">${r.revealed.includes(i) ? "accepted" : "not accepted"}</span>`;
      return `<div class="ent" data-i="${i}" data-open="false">
        <button type="button" aria-expanded="false" aria-controls="eb-${i}"><span class="ix">#${i}</span><span class="q">${esc(e?.question ?? "Entry revealed on-chain; payload not in this site's fixtures")}</span><span class="n">key <b>${e ? esc(e.answer) : "–"}</b></span><span class="n">model <b>${e?.model_answer ?? "–"}</b></span>${vs}${CHEV}</button>
        <div class="ent-body" id="eb-${i}"><div><div class="ent-in">${e ? entryBody(s, r, e, c) : `<p class="fine">This site has no reveal payload for this entry.</p>`}</div></div></div></div>`;
    }).join("")}</div>
    <div class="txs">
      ${lc.commit_suite ? `<a href="${tx(lc.commit_suite)}" rel="noopener"><span>commit_suite</span>${short(lc.commit_suite, 6, 4)} ↗</a>` : ""}
      ${rl ? `<a href="${tx(rl.start)}" rel="noopener"><span>start_run</span>${short(rl.start, 6, 4)} ↗</a><a href="${tx(rl.commit)}" rel="noopener"><span>commit_run</span>${short(rl.commit, 6, 4)} ↗</a>` : ""}
      ${lc.draw ? `<a href="${tx(lc.draw)}" rel="noopener"><span>draw</span>${short(lc.draw, 6, 4)} ↗</a>` : ""}
      ${(r.reveal_txs ?? []).map((t, i) => `<a href="${tx(t.tx)}" rel="noopener"><span>reveal ${i + 1}${t.status === "Failed" ? " → FAILED" : ""}</span>${short(t.tx, 6, 4)} ↗</a>`).join("")}
      <a href="${acct(CONTRACT)}" rel="noopener"><span>contract</span>${CONTRACT} ↗</a>
    </div>`;
  $$<HTMLButtonElement>(".models button", main).forEach((b) => (b.onclick = () => { cur.model = b.dataset.m!; renderRun(); $<HTMLButtonElement>(`.models button[data-m="${CSS.escape(cur.model)}"]`)?.focus(); }));
  $$(".ent", main).forEach((el) => {
    const btn = $<HTMLButtonElement>("button", el);
    btn.onclick = () => { const open = el.dataset.open !== "true"; el.dataset.open = String(open); btn.setAttribute("aria-expanded", String(open)); };
  });
  $$<HTMLButtonElement>("[data-verify]", main).forEach((b) => (b.onclick = () => verifyOne(s, r, Number(b.dataset.verify))));
  const all = $<HTMLButtonElement>("#verify-all", main);
  if (all) all.onclick = () => verifyAll(s, r);
}

function entryBody(s: Suite, r: Run, e: Entry, c: ReturnType<typeof checks.get>) {
  const pinned = (DATA.signers[r.model] ?? []).map((p) => p.address);
  let res = "";
  if (c && c !== "pending" && "ok" in c) {
    const sigOk = !!c.recovered_signer && pinned.includes(c.recovered_signer);
    const merkle = !/Merkle/.test(c.reason) || c.ok;
    res = `<div><div class="lbl">check_reveal · live on NEAR</div><div class="checks">
      <span class="chk ${merkle ? "ok" : "bad"}">Merkle proofs match committed roots</span>
      <span class="chk ${c.request_sha256 ? "ok" : "bad"}">Request bytes rebuilt from template</span>
      <span class="chk ${sigOk ? "ok" : "bad"}">Signer recovered = pinned TEE key</span>
      <span class="chk ${c.ok ? "ok" : "bad"}">Re-grade matches committed grade</span></div>
      <p class="recov" style="margin:10px 0 0">${c.ok ? "" : `<span class="badr">${esc(c.reason)}</span><br>`}signed <span>${esc(c.signed_text || "–")}</span><br>recovered <b>${esc(c.recovered_signer ?? "none")}</b> ${sigOk ? `· pinned for ${esc(r.model)}` : ""}</p></div>`;
  } else if (c && c !== "pending") res = `<p class="recov"><span class="badr">RPC error: ${esc((c as any).error)}</span></p>`;
  return `
    <div><div class="lbl">Question</div><div class="blk">${esc(e.question)}</div></div>
    <div><div class="lbl">Model output (TEE-signed response content)</div><div class="blk">${esc(e.content || "(empty)")}</div></div>
    <div><div class="lbl">NEAR AI signature</div><div class="blk sig">${esc(e.signature)}</div></div>
    ${res}
    <div class="row-act"><button class="btn btn-ghost btn-sm" type="button" data-verify="${e.idx}" ${c === "pending" ? "disabled" : ""}>${c && c !== "pending" ? "Run check_reveal again" : "Run check_reveal on NEAR"}</button><span class="fine">Free read-only view call to ${CONTRACT}. Nothing is signed or written.</span></div>`;
}

async function doCheck(s: Suite, r: Run, idx: number) {
  const k = key(s.suite_id, r.model, idx);
  checks.set(k, "pending");
  try {
    const items = await getRaw(r.reveal_file!);
    const item = items.find((x) => x.idx === idx)!;
    const { value } = await view<Check>("check_reveal", { suite_id: s.suite_id, model: r.model, item });
    checks.set(k, value);
  } catch (e) { checks.set(k, { error: e instanceof Error ? e.message : String(e) }); }
}
function patchEntry(s: Suite, r: Run, idx: number) {
  if (cur.suite !== s.suite_id || cur.model !== r.model) return;
  const el = $(`.ent[data-i="${idx}"]`); if (!el) return;
  const open = el.dataset.open;
  const c = checks.get(key(s.suite_id, r.model, idx));
  const e = r.entries?.find((x) => x.idx === idx);
  const vs = $(".vs", el);
  vs.className = "vs" + (c === "pending" ? "" : c && "ok" in c ? (c.ok ? " ok" : " bad") : " bad");
  vs.textContent = c === "pending" ? "checking…" : c && "ok" in c ? (c.ok ? "verified" : "rejected") : "error";
  if (e) $(".ent-in", el).innerHTML = entryBody(s, r, e, c);
  $$<HTMLButtonElement>("[data-verify]", el).forEach((b) => (b.onclick = () => verifyOne(s, r, Number(b.dataset.verify))));
  el.dataset.open = open!;
  const cell = $$(".gv i")[idx];
  if (cell) { cell.classList.remove("chk", "v", "x"); cell.classList.add(c === "pending" ? "chk" : c && "ok" in c && c.ok ? "v" : "x"); }
  const sampled = s.challenge ?? [];
  const n = sampled.filter((i) => { const x = checks.get(key(s.suite_id, r.model, i)); return x && x !== "pending" && "ok" in x && x.ok; }).length;
  const p = $("#prog"); if (p) p.textContent = n ? `${n}/${sampled.length} re-verified on NEAR` : "";
}
async function verifyOne(s: Suite, r: Run, idx: number) {
  doCheckAndPatch(s, r, idx);
}
async function doCheckAndPatch(s: Suite, r: Run, idx: number) {
  const p = doCheck(s, r, idx); patchEntry(s, r, idx); await p; patchEntry(s, r, idx);
}
async function verifyAll(s: Suite, r: Run) {
  const b = $<HTMLButtonElement>("#verify-all"); if (b) { b.disabled = true; b.textContent = "Verifying on NEAR…"; }
  const list = s.challenge ?? [];
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map((idx) => doCheckAndPatch(s, r, idx)));
  if (b && cur.suite === s.suite_id && cur.model === r.model) { b.disabled = false; b.textContent = `Re-verify all ${list.length} on NEAR`; }
}

/* ---------- gap ---------- */
function renderGap(d: Data) {
  const real = d.suites.filter((s) => s.kind === "real");
  const pub = real.find((s) => /public/.test(s.suite_id)), sea = real.find((s) => /sealed/.test(s.suite_id));
  if (!pub || !sea) { $("#gap-table").innerHTML = `<p class="fine">Waiting for both real suites to be audited.</p>`; return; }
  const models = sea.runs.map((r) => r.model).filter((m) => pub.runs.some((r) => r.model === m));
  $("#gap-table").innerHTML = models.map((m) => {
    const a = pub.runs.find((r) => r.model === m)!, b = sea.runs.find((r) => r.model === m)!;
    const pa = (100 * (a.score ?? 0)) / pub.n, pb = (100 * (b.score ?? 0)) / sea.n;
    return `<article class="card gap-card"><div class="m">${esc(m)}</div>
      <div class="bars">
        <div class="bar"><span>Public originals</span><span class="tr"><i class="pub" data-w="${pa}"></i></span><b>${a.score}/${pub.n}</b></div>
        <div class="bar"><span>Sealed variants</span><span class="tr"><i data-w="${pb}"></i></span><b>${b.score}/${sea.n}</b></div>
      </div>
      <div class="gap-delta"><span>Public − sealed gap<br><span class="pill ${esc(a.status)}">${esc(a.status)}</span> <span class="pill ${esc(b.status)}">${esc(b.status)}</span></span><b>${(pa - pb).toFixed(1)} pts</b></div></article>`;
  }).join("");
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { $$<HTMLElement>(".tr i", e.target).forEach((i) => (i.style.width = i.dataset.w + "%")); io.disconnect(); } }), { threshold: 0.3 });
  io.observe($("#gap-table"));
}

/* ---------- pins ---------- */
function renderPins(d: Data) {
  $("#pins").innerHTML = Object.entries(d.signers).filter(([m]) => !isMock(m)).flatMap(([m, ps]) => ps.map((p) => `<a href="${PIN_TX[p.address] ? tx(PIN_TX[p.address]) : acct(CONTRACT)}" rel="noopener"><span>${esc(modelLabel(m))}</span><span>${esc(short(p.address, 6, 4))} ↗</span></a>`)).join("");
}

/* ---------- tamper lab ---------- */
type Preset = { id: string; t: string; d: string; f: (base: RawItem, all: RawItem[], ch: number[]) => Partial<RawItem> & { content?: string } };
const PRESETS: Preset[] = [
  { id: "honest", t: "Honest reveal", d: "Send the entry exactly as committed.", f: () => ({}) },
  { id: "answer", t: "Change the model's answer", d: "Edit the signed response so it says something else.", f: (b) => ({ content: undefined, _bump: 1 } as any) },
  { id: "grade", t: "Flip the grade", d: "Claim a wrong answer was right, or the reverse.", f: (b) => ({ grade: b.grade ? 0 : 1 }) },
  { id: "key", t: "Change the answer key", d: "Quietly move the goalposts after the run.", f: (b) => ({ answer: b.answer + 1 }) },
  { id: "question", t: "Swap the question", d: "Reveal an easier question than the sealed one.", f: (_b, all) => ({ question: all[1].question }) },
  { id: "borrow", t: "Borrow another signature", d: "Reuse a genuine NEAR AI signature from a different entry.", f: (_b, all) => ({ signature: all[1].signature }) },
  { id: "forge", t: "Forge a signature", d: "Sign it yourself with a key that isn't the TEE's.", f: () => ({ signature: "0x" + [...crypto.getRandomValues(new Uint8Array(64))].map((x) => x.toString(16).padStart(2, "0")).join("") + "1b" }) },
  { id: "undrawn", t: "Relabel the entry", d: "Claim this answer belongs to an entry the draw didn't pick.", f: (b, _all, ch) => { let i = 0; while (ch.includes(i)) i++; return { idx: i }; } },
];
function bumpAnswer(content: string) {
  const m = [...content.matchAll(/ANSWER:\s*(-?\d+)/g)].pop();
  if (!m) return content + "\nANSWER: 1";
  return content.slice(0, m.index!) + `ANSWER: ${Number(m[1]) + 1}` + content.slice(m.index! + m[0].length);
}
function withContent(raw: string, oldC: string, newC: string) {
  if (oldC === newC) return raw;
  const a = JSON.stringify(oldC).slice(1, -1), b = JSON.stringify(newC).slice(1, -1);
  if (raw.includes(a)) return raw.replace(a, b);
  try { const j = JSON.parse(raw); j.choices[0].message.content = newC; return JSON.stringify(j); } catch { return raw + " "; }
}
async function setupLab(d: Data) {
  const s = d.suites.find((x) => x.suite_id === "gsm-sealed-v1") ?? d.suites.find((x) => x.kind === "real" && x.runs.some((r) => r.reveal_file));
  const r = s?.runs.find((x) => /Qwen/.test(x.model) && x.reveal_file) ?? s?.runs.find((x) => x.reveal_file);
  const lab = $("#lab");
  if (!s || !r) { lab.innerHTML = `<p class="fine" style="padding:24px">No real reveal payload available yet.</p>`; return; }
  const all = await getRaw(r.reveal_file!);
  const base = all.find((x) => x.idx === (s.challenge ?? [0])[0]) ?? all[0];
  const content = (raw: string) => { try { return JSON.parse(raw).choices[0].message.content; } catch { return ""; } };
  const baseContent = content(base.response);
  lab.innerHTML = `
    <div class="lab-side" role="radiogroup" aria-label="Cheat to attempt">${PRESETS.map((p, i) => `<button type="button" class="lab-opt" role="radio" aria-checked="${i === 1}" data-p="${p.id}" tabindex="${i === 1 ? 0 : -1}"><b>${p.t}</b><span>${p.d}</span></button>`).join("")}</div>
    <div class="lab-main">
      <div class="meta">Real entry #${base.idx} · ${esc(s.suite_id)} · ${esc(r.model)} · TEE-signed by ${esc(short(d.signers[r.model]?.[0]?.address, 6, 4))}</div>
      <div class="lab-field">
        <label>Entry index<input id="lab-idx" inputmode="numeric" value="${base.idx}"></label>
        <label>Answer key<input id="lab-key" inputmode="numeric" value="${base.answer}"></label>
        <label>Committed grade<input id="lab-grade" inputmode="numeric" value="${base.grade}"></label>
      </div>
      <label class="lbl" for="lab-text" style="margin:0">Model response (edit anything)</label>
      <textarea id="lab-text" spellcheck="false">${esc(baseContent)}</textarea>
      <div class="row-act"><button class="btn btn-primary btn-sm" type="button" id="lab-send">Submit to the contract</button><button class="btn btn-ghost btn-sm" type="button" id="lab-reset">Reset</button><span class="fine">Calls <code>check_reveal</code> on ${CONTRACT}: free, read-only.</span></div>
      <div class="verdict-box" id="lab-out" aria-live="polite"><span class="vh" style="color:var(--dim)">READY</span>Pick a cheat on the left, or edit the fields yourself, then submit.</div>
    </div>`;
  let sel = PRESETS[1], extraSig: string | undefined, extraQ: string | undefined;
  const fIdx = $<HTMLInputElement>("#lab-idx"), fKey = $<HTMLInputElement>("#lab-key"), fGrade = $<HTMLInputElement>("#lab-grade"), fText = $<HTMLTextAreaElement>("#lab-text");
  const apply = (p: Preset) => {
    sel = p; extraSig = undefined; extraQ = undefined;
    fIdx.value = String(base.idx); fKey.value = String(base.answer); fGrade.value = String(base.grade); fText.value = baseContent;
    const ch = p.f(base, all, s.challenge ?? []);
    if (p.id === "answer") fText.value = bumpAnswer(baseContent);
    if (ch.idx != null) fIdx.value = String(ch.idx);
    if (ch.answer != null) fKey.value = String(ch.answer);
    if (ch.grade != null) fGrade.value = String(ch.grade);
    if (ch.signature) extraSig = ch.signature;
    if (ch.question) extraQ = ch.question;
    $$(".lab-opt", lab).forEach((b) => { const on = b.dataset.p === p.id; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  };
  const opts = $$<HTMLButtonElement>(".lab-opt", lab);
  opts.forEach((b, i) => {
    b.onclick = () => apply(PRESETS.find((p) => p.id === b.dataset.p)!);
    b.onkeydown = (e) => { const dir = ["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : ["ArrowUp", "ArrowLeft"].includes(e.key) ? -1 : 0; if (dir) { e.preventDefault(); const n = opts[(i + dir + opts.length) % opts.length]; n.focus(); n.click(); } };
  });
  apply(sel);
  $("#lab-reset").onclick = () => apply(PRESETS[0]);
  const out = $("#lab-out");
  $<HTMLButtonElement>("#lab-send").onclick = async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    const item: RawItem = { ...base, idx: Number(fIdx.value) | 0, answer: Number(fKey.value) | 0, grade: Number(fGrade.value) ? 1 : 0, response: withContent(base.response, baseContent, fText.value), signature: extraSig ?? base.signature, question: extraQ ?? base.question };
    btn.disabled = true; out.className = "verdict-box"; out.innerHTML = `<span class="vh" style="color:var(--mut)">SENDING…</span>check_reveal(${esc(s.suite_id)}, ${esc(r.model)}, entry #${item.idx})`;
    const t0 = performance.now();
    try {
      const { value: c, rpc } = await view<Check>("check_reveal", { suite_id: s.suite_id, model: r.model, item });
      const ms = Math.round(performance.now() - t0);
      out.className = "verdict-box " + (c.ok ? "ok" : "bad");
      out.innerHTML = `<span class="vh">${c.ok ? "ACCEPTED · ALL CHECKS PASSED" : "REJECTED BY THE CONTRACT"}</span><span class="r">${esc(c.reason)}</span><br>recovered signer: ${esc(c.recovered_signer ?? "none")}${c.model_answer != null ? ` · model answer ${c.model_answer}` : ""}<br><span style="color:var(--dim)">${ms} ms via ${esc(rpc)} · final block</span>`;
    } catch (e) {
      out.className = "verdict-box bad";
      const msg = e instanceof ContractError ? e.message.replace(/^.*Smart contract panicked: /, "") : `RPC unreachable: ${e instanceof Error ? e.message : e}`;
      out.innerHTML = `<span class="vh">${e instanceof ContractError ? "REJECTED BY THE CONTRACT" : "COULD NOT REACH NEAR"}</span><span class="r">${esc(msg)}</span>`;
    }
    if (out.classList.contains("bad") && !reduced) { out.classList.remove("shake"); void out.offsetWidth; out.classList.add("shake"); }
    btn.disabled = false;
  };
}

/* ---------- odds ---------- */
function catchP(m: number, n = 100, k = 20) { let miss = 1; for (let i = 0; i < k; i++) miss *= Math.max(0, n - m - i) / (n - i); return 1 - miss; }
function setupOdds() {
  const inp = $<HTMLInputElement>("#odds-in"), out = $("#odds-out span"), mEl = $("#odds-m"), svg = $("#odds-chart");
  const W = 400, H = 200, max = 30, X = (m: number) => ((m - 1) / (max - 1)) * W, Y = (p: number) => H - p * (H - 12) - 4;
  const pts = Array.from({ length: max }, (_, i) => `${X(i + 1).toFixed(1)},${Y(catchP(i + 1)).toFixed(1)}`);
  svg.innerHTML = `<defs><linearGradient id="og" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#00ec97" stop-opacity=".28"/><stop offset="1" stop-color="#00ec97" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75, 1].map((p) => `<line x1="0" x2="${W}" y1="${Y(p)}" y2="${Y(p)}" stroke="rgba(255,255,255,.07)"/><text x="${W}" y="${Y(p) - 5}" text-anchor="end" fill="#78808a" font-size="10" font-family="JetBrains Mono Variable, monospace">${p * 100}%</text>`).join("")}
    <path d="M0,${H} L${pts.join(" L")} L${W},${H} Z" fill="url(#og)"/><path d="M${pts.join(" L")}" fill="none" stroke="#00ec97" stroke-width="2"/>
    <line id="ov" y1="0" y2="${H}" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/><circle id="od" r="5" fill="#fff" stroke="#00ec97" stroke-width="3"/>
    <text x="0" y="${H + 16}" fill="#78808a" font-size="10" font-family="JetBrains Mono Variable, monospace">1 wrong</text><text x="${W}" y="${H + 16}" text-anchor="end" fill="#78808a" font-size="10" font-family="JetBrains Mono Variable, monospace">${max} of 100 wrong</text>`;
  const upd = () => {
    const m = Number(inp.value), p = catchP(m);
    mEl.textContent = String(m); out.textContent = (p * 100 >= 99.95 ? ">99.9" : (p * 100).toFixed(1)) + "%";
    inp.style.setProperty("--p", `${((m - 1) / (max - 1)) * 100}%`);
    inp.setAttribute("aria-valuetext", `${m} misreported entries: ${(p * 100).toFixed(1)}% chance of being caught`);
    const x = X(m), y = Y(p); $("#ov", svg).setAttribute("x1", String(x)); $("#ov", svg).setAttribute("x2", String(x)); $("#od", svg).setAttribute("cx", String(x)); $("#od", svg).setAttribute("cy", String(y));
  };
  inp.oninput = upd; upd();
}

/* ---------- misc ---------- */
function setupChrome() {
  const mb = $<HTMLButtonElement>("#menu-btn"), links = $("#nav-links");
  mb.onclick = () => { const open = mb.getAttribute("aria-expanded") !== "true"; mb.setAttribute("aria-expanded", String(open)); links.classList.toggle("open", open); };
  $$("a", links).forEach((a) => a.addEventListener("click", () => { mb.setAttribute("aria-expanded", "false"); links.classList.remove("open"); }));
  const nav = $("#nav"); const onS = () => nav.classList.toggle("scrolled", scrollY > 8); addEventListener("scroll", onS, { passive: true }); onS();
  $$<HTMLButtonElement>(".copy").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy!); b.textContent = "Copied ✓"; b.classList.add("done"); setTimeout(() => { b.textContent = "Copy all"; b.classList.remove("done"); }, 1800); } catch { b.textContent = "Select and copy"; } }));
  const targets = $$(".sec .kicker, .sec .h2, .sec .lede-sm, .sec .card, .sec .sec-note, .term, .odds-card, .vlist li, .explorer, .lab, .closer-in > *");
  if (!reduced && "IntersectionObserver" in window) {
    targets.forEach((t) => t.classList.add("rv"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const el = e.target as HTMLElement; const sib = [...(el.parentElement?.children ?? [])].indexOf(el); el.style.transitionDelay = `${Math.min(sib, 5) * 60}ms`; el.classList.add("in"); io.unobserve(el); } }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((t) => io.observe(t));
  }
  const st = $("#steps"); new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { st.classList.add("in"); o.disconnect(); } }), { threshold: 0.3 }).observe(st);
}

function renderAll(d: Data) {
  DATA = d;
  setSource(d);
  renderStats(d);
  renderSteps(d);
  if (!cur.suite || !d.suites.some((s) => s.suite_id === cur.suite)) cur.suite = d.suites[0]?.suite_id ?? "";
  renderTabs(d);
  selectSuite(cur.suite, cur.model);
  renderGap(d);
  renderPins(d);
}

async function boot() {
  setupChrome(); setupOdds();
  const snap = await loadSnapshot();
  renderAll(snap); runHero(snap);
  const labIo = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { labIo.disconnect(); setupLab(DATA); } }, { rootMargin: "600px 0px" });
  labIo.observe($("#lab"));
  const tryLive = async () => {
    try { const live = await loadLive(snap); const first = DATA.source !== "live"; renderAll(live); if (first) runHero(live); return true; }
    catch (e) { console.warn("NEAR RPC unavailable, staying on snapshot", e); setSource(snap); return false; }
  };
  if (!(await tryLive())) { const iv = setInterval(async () => { if (await tryLive()) clearInterval(iv); }, 20000); }
  else setInterval(() => { if (!document.hidden) tryLive(); }, 60000);
}
boot();
