import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as L from "../src/lib.ts";
import { AIME_TEMPLATES, gridPathsFormula, rootProd, beautifulCount } from "../src/templates_aime.ts";

const PUB = JSON.parse(readFileSync(new URL("../../data/public-aime-25.json", import.meta.url), "utf8")).items;

test("every AIME template rebuilds its public original with the official answer", () => {
  assert.equal(AIME_TEMPLATES.length, 25);
  assert.equal(PUB.length, 25);
  for (let i = 0; i < 25; i++) {
    const t = AIME_TEMPLATES[i], o = t.original();
    assert.equal(PUB[i].template, t.id);
    assert.equal(o.answer, PUB[i].answer, `${t.id} (${t.source}): code gives ${o.answer}, official ${PUB[i].answer}`);
  }
});

test("AIME variants: positive integers, differ from the originals, deterministic per seed", () => {
  const r1 = L.seededRng("ab".repeat(32), "t"), r2 = L.seededRng("ab".repeat(32), "t");
  for (const t of AIME_TEMPLATES) for (let k = 0; k < 6; k++) {
    const v = t.make(r1), w = t.make(r2);
    assert.deepEqual(v, w);
    assert.ok(Number.isSafeInteger(v.answer) && v.answer > 0, `${t.id}: ${v.answer}`);
    assert.notEqual(v.question, t.original().question);
  }
});

const binom = (n: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };

test("closed forms agree with independent brute force", () => {
  // grid paths: enumerate every monotone path of 2n steps.
  for (let n = 2; n <= 7; n++) {
    const counts = new Map<number, number>();
    const rec = (x: number, y: number, last: number, ch: number) => {
      if (x === n && y === n) { counts.set(ch, (counts.get(ch) ?? 0) + 1); return; }
      if (x < n) rec(x + 1, y, 0, ch + (last === 1 ? 1 : 0));
      if (y < n) rec(x, y + 1, 1, ch + (last === 0 ? 1 : 0));
    };
    rec(0, 0, -1, 0);
    for (let c = 1; c <= 2 * n - 1; c++) assert.equal(Number(gridPathsFormula(n, c)), counts.get(c) ?? 0, `grid n=${n} c=${c}`);
  }
  // product over roots of unity: compare with complex floating point for small n.
  for (const [n, a, c] of [[7, 2, 2], [11, 1, 3], [7, 3, 5], [5, 1, 2], [13, 2, 2]]) {
    let re = 1, im = 0;
    for (let k = 0; k < n; k++) { const t = (2 * Math.PI * k) / n, wr = Math.cos(t), wi = Math.sin(t); const fr = wr * wr - wi * wi - a * wr + c, fi = 2 * wr * wi - a * wi; [re, im] = [re * fr - im * fi, re * fi + im * fr]; }
    assert.ok(Math.abs(re - Number(rootProd(n, a, c))) < 1e-6 * Math.max(1, Math.abs(re)) && Math.abs(im) < 1e-3 * Math.max(1, Math.abs(re)), `rootprod ${n},${a},${c}`);
  }
  // b-eautiful: brute force over all two-digit base-b numbers.
  for (let b = 2; b <= 80; b++) {
    let cnt = 0; for (let n = b; n < b * b; n++) { const s = Math.floor(n / b) + (n % b); if (s * s === n) cnt++; }
    assert.equal(beautifulCount(b), cnt, `beautiful b=${b}`);
  }
  // diametric circle: enumerate seat sets for small circles.
  for (const [m, w] of [[2, 4], [3, 5], [2, 6], [4, 6], [3, 3]]) {
    const N = m + w; let good = 0, all = 0;
    for (let mask = 0; mask < 1 << N; mask++) { if (popcount(mask) !== m) continue; all++; let ok = true; for (let i = 0; i < N; i++) if (mask >> i & 1 && mask >> ((i + N / 2) % N) & 1) ok = false; if (ok) good++; }
    assert.equal(all, binom(N, m));
    assert.equal(good, binom(N / 2, m) * 2 ** m, `circle ${m},${w}`);
  }
  // lottery: enumerate draws for the original setting.
  { let prize = 0, grand = 0; const mine = [0, 1, 2, 3];
    for (let mask = 0; mask < 1 << 10; mask++) { if (popcount(mask) !== 4) continue; const hit = mine.filter((i) => mask >> i & 1).length; if (hit >= 2) prize++; if (hit === 4) grand++; }
    assert.equal(prize / grand, 115); }
});
const popcount = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
