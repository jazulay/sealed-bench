// Pre-registered paired gap analysis (PREREGISTRATION.md), computed from the PUBLIC on-chain grade vectors only.
// Sealed item idx = variant * 25 + template, so template j's variants are idx j, j+25, j+50, j+75.
import { view, snapshot, CONFIG } from "./near.ts";

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function pairedGap(pub: string, sealed: string, B = 10000, seed = 1) {
  const T = pub.length; const per = sealed.length / T;
  const d = [...Array(T).keys()].map((j) => {
    let s = 0; for (let v = 0; v < per; v++) s += Number(sealed[v * T + j]);
    return Number(pub[j]) - s / per;
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const rnd = mulberry32(seed); const boots: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < T; i++) s += d[Math.floor(rnd() * T)]; boots.push(s / T); }
  boots.sort((a, b) => a - b);
  const lo = boots[Math.floor(0.025 * B)], hi = boots[Math.ceil(0.975 * B) - 1];
  return { per_problem_d: d.map((x) => Math.round(x * 100) / 100), gap_pts: +(mean(d) * 100).toFixed(1), ci95_pts: [+(lo * 100).toFixed(1), +(hi * 100).toFixed(1)], detected: lo > 0 };
}

export async function gap(flags: Record<string, string>) {
  const snap = await snapshot();
  const pubId = flags.public, sealedId = flags.sealed;
  const models: string[] = (await view<any>("get_suite", { suite_id: sealedId }, snap.height)).models;
  const rows: any[] = [];
  for (const model of models) {
    const p: any = await view("get_run", { suite_id: pubId, model }, snap.height);
    const s: any = await view("get_run", { suite_id: sealedId, model }, snap.height);
    if (!p?.grades || !s?.grades) { rows.push({ model, error: "run not committed" }); continue; }
    const pubPct = (100 * [...p.grades].filter((g) => g === "1").length) / p.grades.length;
    const sealedPct = (100 * [...s.grades].filter((g) => g === "1").length) / s.grades.length;
    rows.push({ model, public: `${[...p.grades].filter((g) => g === "1").length}/${p.grades.length}`, sealed: `${[...s.grades].filter((g) => g === "1").length}/${s.grades.length}`,
      public_pct: +pubPct.toFixed(1), sealed_pct: +sealedPct.toFixed(1), raw_gap_pts: +(pubPct - sealedPct).toFixed(1), status: { public: p.status, sealed: s.status }, paired: pairedGap(p.grades, s.grades) });
  }
  console.log(JSON.stringify({ ok: true, contract: CONFIG.contractId, block: snap.height, public: pubId, sealed: sealedId, method: "PREREGISTRATION.md: d_j = original - mean(4 variants); bootstrap over 25 problems, 10,000 resamples, mulberry32 seed 1; detected iff CI lower bound > 0", rows }, null, 2));
}
