// 25 parameterized templates, each a numeric variant of one public AIME problem (see data/public-aime-25.json).
// Every answer is computed by code (mostly brute force, never by a model). `original()` rebuilds the public
// problem from the same code path, and cli/test/aime.test.ts checks it reproduces the official AIME answer and
// cross-checks the closed-form solvers against independent brute force.
import type { Rng, Variant } from "./templates.ts";

export interface AimeTemplate { id: string; source: string; make(r: Rng): Variant; original(): Variant }
type P = Record<string, any>;
const TPL = (id: string, source: string, orig: P, gen: (r: Rng) => P | null, build: (p: P) => Variant | null): AimeTemplate => ({
  id, source,
  original: () => { const v = build(orig); if (!v) throw new Error(`${id}: original has no answer`); return v; },
  make(r) {
    const o = build(orig)!;
    for (let i = 0; i < 5000; i++) {
      const p = gen(r); if (!p) continue;
      const v = build(p);
      if (v && Number.isSafeInteger(v.answer) && v.answer > 0 && v.question !== o.question) return v;
    }
    throw new Error(`${id}: no valid variant after 5000 tries`);
  },
});

// ---- exact helpers ----
const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const bgcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const C = (n: number, k: number): bigint => { if (k < 0 || k > n) return 0n; let r = 1n; for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1); return r; };
export class Q { // exact rational
  n: bigint; d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) { let N = BigInt(n), D = BigInt(d); if (D < 0n) { N = -N; D = -D; } const g = bgcd(N, D) || 1n; this.n = N / g; this.d = D / g; }
  add(o: Q) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Q) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Q) { return new Q(this.n * o.n, this.d * o.d); }
  div(o: Q) { return new Q(this.n * o.d, this.d * o.n); }
  abs() { return new Q(this.n < 0n ? -this.n : this.n, this.d); }
  isInt() { return this.d === 1n; }
}
const mPlusN = (q: Q) => Number(q.n + q.d);
const isPrime = (n: number) => { if (n < 2) return false; for (let p = 2; p * p <= n; p++) if (n % p === 0) return false; return true; };
const modpow = (b: bigint, e: bigint, m: bigint) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
const W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const Cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
function* perms(xs: number[]): Generator<number[]> { if (xs.length <= 1) { yield xs; return; } for (let i = 0; i < xs.length; i++) for (const p of perms([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...p]; }
const permCount = new Map<number, number>();
const perm8DivBy = (d: number) => { if (!permCount.has(d)) { let c = 0; for (const p of perms([1, 2, 3, 4, 5, 6, 7, 8])) if (Number(p.join("")) % d === 0) c++; permCount.set(d, c); } return permCount.get(d)!; };
const term = (c: number, v: string, first: boolean) => { if (c === 0) return ""; const s = c < 0 ? "-" : first ? "" : "+"; const a = Math.abs(c); return `${s}${a === 1 ? "" : a}${v}`; };

export const AIME_TEMPLATES: AimeTemplate[] = [
  TPL("bases", "2025 AIME I Problem 1", { y: 7, u: 9, v: 7 }, (r) => ({ y: r.int(1, 9), u: r.int(2, 9), v: r.int(0, 9) }), ({ y, u, v }) => {
    const m = Math.max(y, u, v), K = v - u * y; if (K === 0) return null;
    let sum = 0, cnt = 0; for (let b = m + 1; b + y <= Math.abs(K); b++) if ((u * b + v) % (b + y) === 0) { sum += b; cnt++; }
    if (cnt < 2) return null;
    return { question: `Find the sum of all integer bases $b>${m}$ for which $1${y}_{b}$ is a divisor of $${u}${v}_{b}$.`, answer: sum };
  }),
  TPL("icecream", "2025 AIME I Problem 3", { n: 9 }, (r) => ({ n: r.int(8, 16) }), ({ n }) => {
    let N = 0n; const f = (k: number) => { let x = 1n; for (let i = 2; i <= k; i++) x *= BigInt(i); return x; };
    for (let s = 1; s <= n; s++) for (let v = s + 1; v <= n; v++) { const c = n - s - v; if (c > v) N += f(n) / (f(c) * f(v) * f(s)); }
    return { question: `The ${n} members of a baseball team went to an ice cream parlor after their game. Each player had a single-scoop cone of chocolate, vanilla, or strawberry ice cream. At least one player chose each flavor, and the number of players who chose chocolate was greater than the number of players who chose vanilla, which was greater than the number of players who chose strawberry. Let $N$ be the number of different assignments of flavors to players that meet these conditions. Find the remainder when $N$ is divided by 1000.`, answer: Number(N % 1000n) };
  }),
  TPL("quadform", "2025 AIME I Problem 4", { p: 3, q: 2, rr: 4, s: -3, L: 100 }, (r) => ({ p: r.int(1, 6), q: r.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]), rr: r.int(1, 6), s: r.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]), L: 10 * r.int(5, 15) }), ({ p, q, rr, s, L }) => {
    // (p x + q y)(rr x + s y) = A x^2 + B xy + Cc y^2
    const A = p * rr, B = p * s + q * rr, Cc = q * s; if (B === 0 || p * s === q * rr) return null;
    let cnt = 0; for (let x = -L; x <= L; x++) for (let y = -L; y <= L; y++) if (A * x * x + B * x * y + Cc * y * y === 0) cnt++;
    const poly = `${term(A, "x^{2}", true)}${term(B, "xy", false)}${term(Cc, "y^{2}", false)}`;
    return { question: `Find the number of ordered pairs $(x,y)$, where both $x$ and $y$ are integers between $-${L}$ and $${L}$, inclusive, such that $${poly}=0$.`, answer: cnt };
  }),
  TPL("perm22", "2025 AIME I Problem 5", { d: 22, K: 2025 }, (r) => ({ d: r.pick([11, 22, 33, 44, 55, 66, 88]), K: r.int(1000, 3000) }), ({ d, K }) => {
    const N = perm8DivBy(d); if (N === K) return null;
    return { question: `There are $8!=40320$ eight-digit positive integers that use each of the digits $1,2,3,4,5,6,7,8$ exactly once. Let $N$ be the number of these integers that are divisible by ${d}. Find the difference between $N$ and ${K}.`, answer: Math.abs(N - K) };
  }),
  TPL("divprod", "2025 AIME II Problem 2", { a: 2, c: 3, d: 3, e: 9 }, (r) => ({ a: r.int(1, 6), c: r.int(2, 7), d: r.int(1, 9), e: r.int(1, 12) }), ({ a, c, d, e }) => {
    if (d === a) return null; const K = Math.abs(c * (d - a) * (a * a + e)); let sum = 0, cnt = 0;
    for (let n = 1; n + a <= K; n++) if ((c * (n + d) * (n * n + e)) % (n + a) === 0) { sum += n; cnt++; }
    if (cnt < 2) return null;
    return { question: `Find the sum of all positive integers $ n $ such that $ n + ${a} $ divides the product $ ${c}(n + ${d})(n^2 + ${e}) $.`, answer: sum };
  }),
  TPL("aya", "2024 AIME I Problem 1", { D: 9, k: 5, delta: 2, t: 24, h: 1 }, (r) => ({ D: r.int(4, 15), k: r.int(3, 12), delta: r.int(1, 3), t: r.int(10, 50), h: r.int(1, 3) }), ({ D, k, delta, t, h }) => {
    // speed s = k/2 km/h; third speed s + h/2. All walking times (minutes) must be integers.
    const mins = (twiceSpeed: number) => (120 * D) % twiceSpeed === 0 ? (120 * D) / twiceSpeed : null;
    const m1 = mins(k), m2 = mins(k + 2 * delta), m3 = mins(k + h); if (m1 === null || m2 === null || m3 === null) return null;
    const fmt = (m: number) => { const H = Math.floor(m / 60), M = m % 60; const hs = `${H} hour${H === 1 ? "" : "s"}`; return M === 0 ? hs : H === 0 ? `${M} minutes` : `${hs} and ${M} minutes`; };
    const hTxt = h === 1 ? "\\frac{1}{2}" : h === 2 ? "1" : "\\frac{3}{2}";
    return { question: `Every morning Aya goes for a $${D}$-kilometer-long walk and stops at a coffee shop afterwards. When she walks at a constant speed of $s$ kilometers per hour, the walk takes her ${fmt(m1 + t)}, including $t$ minutes spent in the coffee shop. When she walks $s+${delta}$ kilometers per hour, the walk takes her ${fmt(m2 + t)}, including $t$ minutes spent in the coffee shop. Suppose Aya walks at $s+${hTxt}$ kilometers per hour. Find the number of minutes the walk takes her, including the $t$ minutes spent in the coffee shop.`, answer: m3 + t };
  }),
  TPL("tokens", "2024 AIME I Problem 3", { k: 4, N: 2024 }, (r) => ({ k: r.pick([3, 5, 6, 7]), N: r.int(1000, 3000) }), ({ k, N }) => {
    const win: boolean[] = [false]; let cnt = 0; // win[n]: player to move wins with n tokens left
    for (let n = 1; n <= N; n++) { win[n] = !win[n - 1] || (n >= k && !win[n - k]); if (!win[n]) cnt++; }
    return { question: `Alice and Bob play the following game. A stack of $n$ tokens lies before them. The players take turns with Alice going first. On each turn, the player removes either $1$ token or $${k}$ tokens from the stack. Whoever removes the last token wins. Find the number of positive integers $n$ less than or equal to $${N}$ for which there exists a strategy for Bob that guarantees that Bob will win the game regardless of Alice's play.`, answer: cnt };
  }),
  TPL("lottery", "2024 AIME I Problem 4", { n: 10, k: 4, t: 2 }, (r) => ({ n: r.int(8, 14), k: r.int(3, 5), t: r.int(2, 4) }), ({ n, k, t }) => {
    if (t >= k || 2 * k > n) return null;
    let prize = 0n; for (let j = t; j <= k; j++) prize += C(k, j) * C(n - k, k - j);
    return { question: `Jen enters a lottery by picking $${k}$ distinct numbers from $S=\\{1,2,3,\\cdots,${n - 1},${n}\\}.$ $${k}$ numbers are randomly chosen from $S.$ She wins a prize if at least ${W[t]} of her numbers were $${t}$ of the randomly chosen numbers, and wins the grand prize if all ${W[k]} of her numbers were the randomly chosen numbers. The probability of her winning the grand prize given that she won a prize is $\\tfrac{m}{n}$ where $m$ and $n$ are relatively prime positive integers. Find $m+n$.`, answer: mPlusN(new Q(1n, prize)) };
  }),
  TPL("gridpaths", "2024 AIME I Problem 6", { n: 8, c: 4 }, (r) => ({ n: r.int(5, 10), c: r.int(2, 7) }), ({ n, c }) => {
    const answer = Number(gridPathsFormula(n, c)); if (!answer) return null;
    return { question: `Consider the paths of length $${2 * n}$ that follow the lines from the lower left corner to the upper right corner on an $${n}\\times ${n}$ grid. Find the number of such paths that change direction exactly ${W[c]} times.`, answer };
  }),
  TPL("complexmax", "2024 AIME I Problem 7", { a: 75, b: 117, c: 96, d: 144, R: 4 }, (r) => {
    const [p, q] = r.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]] as const), m = r.int(4, 40), R = r.int(2, 6);
    const [X, Y] = r.int(0, 1) ? [p * m, -q * m] : [q * m, -p * m]; // X = R a + c/R, Y = d/R - R b
    const a = Math.floor(X / R) - r.int(1, 8), b = Math.floor(-Y / R) + r.int(1, 12);
    return { a, b, c: R * (X - R * a), d: R * (Y + R * b), R };
  }, ({ a, b, c, d, R }) => {
    if (a <= 0 || b <= 0 || c <= 0 || d <= 0) return null;
    const X = new Q(R * a).add(new Q(c, R)), Y = new Q(d, R).sub(new Q(R * b)); if (!X.isInt() || !Y.isInt()) return null;
    const s2 = Number(X.n * X.n + Y.n * Y.n), s = Math.round(Math.sqrt(s2)); if (s * s !== s2) return null;
    return { question: `Find the largest possible real part of \\[(${a}+${b}i)z + \\frac{${c}+${d}i}{z}\\] where $z$ is a complex number with $|z|=${R}$.`, answer: s };
  }),
  TPL("p2n4", "2024 AIME I Problem 13", { e: 4, c: 1 }, (r) => ({ e: r.pick([2, 3, 4, 6]), c: r.int(1, 12) }), ({ e, c }) => {
    for (let p = 2; p < 2000; p++) {
      if (!isPrime(p)) continue; const P2 = BigInt(p * p);
      for (let m = 1; m <= p * p; m++) if ((modpow(BigInt(m), BigInt(e), P2) + BigInt(c)) % P2 === 0n) {
        if (p < 5 || m < 10) return null;
        const f = `n^{${e}}+${c}`;
        return { question: `Let $p$ be the least prime number for which there exists a positive integer $n$ such that $${f}$ is divisible by $p^{2}$. Find the least positive integer $m$ such that $${f.replace("n", "m")}$ is divisible by $p^{2}$.`, answer: m };
      }
    }
    return null;
  }),
  TPL("aimeville", "2024 AIME II Problem 1", { N: 900, A: 195, B: 367, Cc: 562, e2: 437, e3: 234 }, (r) => {
    const e4 = r.int(20, 120), e3 = r.int(100, 300), e2 = r.int(200, 500), e1 = r.int(50, 300), N = e1 + e2 + e3 + e4;
    const S = e2 + 2 * e3 + 3 * e4, hi = e2 + e3 + e4; const A = r.int(e4, Math.min(hi, S - 2 * e4)), B = r.int(e4, Math.min(hi, S - A - e4)), Cc = S - A - B;
    if (Cc < e4 || Cc > hi) return null; return { N, A, B, Cc, e2, e3 };
  }, ({ N, A, B, Cc, e2, e3 }) => {
    const e4 = (A + B + Cc - e2 - 2 * e3) / 3; if (!Number.isInteger(e4) || e4 <= 0 || e2 + e3 + e4 > N) return null;
    return { question: `Among the ${N} residents of Aimeville, there are ${A} who own a diamond ring, ${B} who own a set of golf clubs, and ${Cc} who own a garden spade. In addition, each of the ${N} residents owns a bag of candy hearts. There are ${e2} residents who own exactly two of these things, and ${e3} residents who own exactly three of these things. Find the number of residents of Aimeville who own all four of these things.`, answer: e4 };
  }),
  TPL("logsys", "2024 AIME II Problem 4", { q1: 2, q2: 3, q3: 4, a: 4, b: 3, c: 2 }, (r) => ({ q1: r.int(2, 7), q2: r.int(2, 7), q3: r.int(2, 7), a: r.int(1, 6), b: r.int(1, 6), c: r.int(1, 6) }), ({ q1, q2, q3, a, b, c }) => {
    if (new Set([q1, q2, q3]).size < 3) return null;
    const p1 = new Q(1, q1), p2 = new Q(1, q2), p3 = new Q(1, q3), half = new Q(-1, 2);
    const X = p2.add(p3).mul(half), Y = p1.add(p3).mul(half), Z = p1.add(p2).mul(half);
    const v = X.mul(new Q(a)).add(Y.mul(new Q(b))).add(Z.mul(new Q(c))).abs(); if (v.n === 0n) return null;
    const mon = (s: string, k: number) => (k === 1 ? s : `${s}^${k}`);
    return { question: `Let $x,y$ and $z$ be positive real numbers that satisfy the following system of equations: \\[\\log_2\\left({x \\over yz}\\right) = {1 \\over ${q1}}\\] \\[\\log_2\\left({y \\over xz}\\right) = {1 \\over ${q2}}\\] \\[\\log_2\\left({z \\over xy}\\right) = {1 \\over ${q3}}\\] Then the value of $\\left|\\log_2(${mon("x", a)}${mon("y", b)}${mon("z", c)})\\right|$ is $\\tfrac{m}{n}$ where $m$ and $n$ are relatively prime positive integers. Find $m+n$.`, answer: mPlusN(v) };
  }),
  TPL("digit1", "2024 AIME II Problem 7", { d: 1, k: 7 }, (r) => ({ d: r.int(1, 9), k: r.pick([7, 11, 13, 17, 19, 23]) }), ({ d, k }) => {
    for (let N = 9999; N >= 1000; N--) {
      const s = String(N); let ok = true;
      for (let i = 0; i < 4 && ok; i++) if (Number(s.slice(0, i) + d + s.slice(i + 1)) % k !== 0) ok = false;
      if (ok) return { question: `Let $N$ be the greatest four-digit positive integer with the property that whenever one of its digits is changed to $${d}$, the resulting number is divisible by $${k}$. Let $Q$ and $R$ be the quotient and remainder, respectively, when $N$ is divided by $1000$. Find $Q+R$.`, answer: Math.floor(N / 1000) + (N % 1000) };
    }
    return null;
  }),
  TPL("rootprod", "2024 AIME II Problem 13", { n: 13, a: 2, c: 2 }, (r) => ({ n: r.pick([7, 11, 13, 17, 19, 23, 29]), a: r.int(1, 4), c: r.int(2, 9) }), ({ n, a, c }) => {
    if (a * a >= 4 * c) return null;
    const answer = Number(((rootProd(n, a, c) % 1000n) + 1000n) % 1000n);
    return { question: `Let $\\omega \\neq 1$ be a ${ord(n)} root of unity. Find the remainder when \\[ \\prod_{k=0}^{${n - 1}}(${c} - ${a === 1 ? "" : a}\\omega^k + \\omega^{2k}) \\] is divided by 1000.`, answer };
  }),
  TPL("beautiful", "2024 AIME II Problem 14", { K: 10 }, (r) => ({ K: r.int(3, 15) }), ({ K }) => {
    for (let b = 2; b < 100000; b++) if (beautifulCount(b) > K) return { question: `Let $b \\geq 2$ be an integer. Call a positive integer $n$ $b$\\textit{-eautiful} if it has exactly two digits when expressed in base $b$, and these two digits sum to $\\sqrt{n}$. For example, $81$ is $13$-eautiful because $81=\\underline{6}\\underline{3}_{13}$ and $6+3=\\sqrt{81}$. Find the least integer $b \\geq 2$ for which there are more than ${W[K]} $b$-eautiful integers.`, answer: b };
    return null;
  }),
  TPL("circle", "2023 AIME I Problem 1", { m: 5, w: 9 }, (r) => ({ m: r.int(2, 7), w: r.int(3, 15) }), ({ m, w }) => {
    const N = m + w; if (N % 2 || m > N / 2 || w > 15 || m === w) return null;
    const q = new Q(C(N / 2, m) * (1n << BigInt(m)), C(N, m));
    return { question: `${Cap(W[m])} men and ${W[w]} women stand equally spaced around a circle in random order. The probability that every man stands diametrically opposite a woman is $\\frac{m}{n},$ where $m$ and $n$ are relatively prime positive integers. Find $m+n.$`, answer: mPlusN(q) };
  }),
  TPL("factsq", "2023 AIME I Problem 4", { n: 13, pw: 2 }, (r) => ({ n: r.int(6, 16), pw: r.pick([2, 3]) }), ({ n, pw }) => {
    let S = 1n; const primes: number[] = [];
    for (let p = 2; p <= n; p++) { if (!isPrime(p)) continue; primes.push(p); let e = 0; for (let x = n; x; x = Math.floor(x / p)) e += Math.floor(x / p); let s = 0n; for (let f = e % pw; f <= e; f += pw) s += BigInt(p) ** BigInt(f); S *= s; }
    const fac: [bigint, number][] = []; let x = S; for (let p = 2n; p * p <= x; p++) { let k = 0; while (x % p === 0n) { x /= p; k++; } if (k) fac.push([p, k]); } if (x > 1n) fac.push([x, 1]);
    const total = fac.reduce((s, [, k]) => s + k, 0), kind = pw === 2 ? "square" : "cube";
    if (n === 13 && pw === 2) { // the original wording, which names the six primes
      if (fac.length !== 6 || fac.some(([p], i) => p !== BigInt(primes[i]))) return null;
      return { question: `The sum of all positive integers $m$ such that $\\frac{13!}{m}$ is a perfect square can be written as $2^a3^b5^c7^d11^e13^f,$ where $a,b,c,d,e,$ and $f$ are positive integers. Find $a+b+c+d+e+f.$`, answer: total };
    }
    return { question: `The sum of all positive integers $m$ such that $\\frac{${n}!}{m}$ is a perfect ${kind} can be written as $p_1^{e_1}p_2^{e_2}\\cdots p_k^{e_k},$ where $p_1<p_2<\\cdots<p_k$ are primes and $e_1,e_2,\\ldots,e_k$ are positive integers. Find $e_1+e_2+\\cdots+e_k.$`, answer: total };
  }),
  TPL("quadpq", "2022 AIME I Problem 1", { a: 2, b: 2, x1: 16, y1: 54, x2: 20, y2: 53 }, (r) => { const x1 = r.int(4, 25); return { a: r.int(1, 5), b: r.int(1, 5), x1, y1: r.int(20, 90), x2: x1 + r.int(2, 8), y2: r.int(20, 90) }; }, ({ a, b, x1, y1, x2, y2 }) => {
    const slope = new Q(y2 - y1, x2 - x1);
    const v = new Q(2 * y1).sub(new Q(2 * x1).mul(slope)).add(new Q((a - b) * x1 * x2)); if (!v.isInt() || v.n <= 0n) return null;
    const lead = (k: number) => (k === 1 ? "1" : String(k));
    return { question: `Quadratic polynomials $P(x)$ and $Q(x)$ have leading coefficients $${lead(a)}$ and $-${lead(b)},$ respectively. The graphs of both polynomials pass through the two points $(${x1},${y1})$ and $(${x2},${y2}).$ Find $P(0) + Q(0).$`, answer: Number(v.n) };
  }),
  TPL("base9", "2022 AIME I Problem 2", { base: 9, pat: "bca" }, (r) => ({ base: r.int(5, 20), pat: r.pick(["bca", "cab", "cba", "bac", "acb"]) }), ({ base, pat }) => {
    const sols: number[] = [];
    for (let N = 100; N <= 999; N++) {
      const dg: Record<string, number> = { a: Math.floor(N / 100), b: Math.floor(N / 10) % 10, c: N % 10 };
      const ds = pat.split("").map((ch: string) => dg[ch]); if (ds[0] === 0 || ds.some((x: number) => x >= base)) continue;
      if (ds[0] * base * base + ds[1] * base + ds[2] === N) sols.push(N);
    }
    if (sols.length !== 1) return null;
    const ul = pat.split("").map((ch: string) => `\\underline{${ch}}`).join("\\,");
    return { question: `Find the three-digit positive integer $\\underline{a}\\,\\underline{b}\\,\\underline{c}$ whose representation in base ${W[base]} is $${ul}_{\\,\\text{${W[base]}}},$ where $a,$ $b,$ and $c$ are (not necessarily distinct) digits.`, answer: sols[0] };
  }),
  TPL("wzpairs", "2022 AIME I Problem 4", { lhs: "i", B: 100 }, (r) => ({ lhs: r.pick(["i", "-i", "-1"]), B: r.int(40, 200) }), ({ lhs, B }) => {
    const off = ({ i: 3, "-i": 9, "-1": 6 } as Record<string, number>)[lhs]; // arguments in units of pi/6
    let cnt = 0; for (let r = 1; r <= B; r++) for (let s = 1; s <= B; s++) if ((((off + r - 4 * s) % 12) + 12) % 12 === 0) cnt++;
    const L = lhs === "-1" ? "-" : `${lhs} \\cdot `;
    return { question: `Let $w = \\dfrac{\\sqrt{3} + i}{2}$ and $z = \\dfrac{-1 + i\\sqrt{3}}{2},$ where $i = \\sqrt{-1}.$ Find the number of ordered pairs $(r,s)$ of positive integers not exceeding $${B}$ that satisfy the equation $${L}w^r = z^s.$`, answer: cnt };
  }),
  TPL("pow2diff", "2021 AIME I Problem 3", { g: 2, L: 1000 }, (r) => ({ g: r.pick([2, 2, 3]), L: 100 * r.int(5, 60) }), ({ g, L }) => {
    const pw: number[] = []; for (let x = 1; x < 4 * L * g; x *= g) pw.push(x);
    const set = new Set<number>(); for (const a of pw) for (const b of pw) if (a > b && a - b < L) set.add(a - b);
    return { question: `Find the number of positive integers less than $${L}$ that can be expressed as the difference of two integral powers of $${g}.$`, answer: set.size };
  }),
  TPL("nines", "2019 AIME I Problem 1", { k: 321 }, (r) => ({ k: r.int(30, 999) }), ({ k }) => {
    let N = 0n; for (let i = 1; i <= k; i++) N += 10n ** BigInt(i) - 1n;
    return { question: `Consider the integer \\[N = 9 + 99 + 999 + 9999 + \\cdots + \\underbrace{99\\ldots 99}_\\text{${k} digits}.\\] Find the sum of the digits of $N$ .`, answer: [...N.toString()].reduce((s, ch) => s + Number(ch), 0) };
  }),
  TPL("oddprime", "2019 AIME I Problem 14", { a: 2019, e: 8 }, (r) => ({ a: r.int(1000, 3000), e: r.pick([4, 8]) }), ({ a, e }) => {
    for (let p = 3; p < 1_000_000; p += 2) if (isPrime(p) && (modpow(BigInt(a), BigInt(e), BigInt(p)) + 1n) % BigInt(p) === 0n) return { question: `Find the least odd prime factor of $${a}^${e} + 1$ .`, answer: p };
    return null;
  }),
  TPL("factorable", "2018 AIME I Problem 1", { A: 100 }, (r) => ({ A: r.int(40, 400) }), ({ A }) => {
    let S = 0; for (let a = 1; a <= A; a++) for (let b = 0; b <= (a * a) / 4; b++) { const D = a * a - 4 * b, s = Math.round(Math.sqrt(D)); if (s * s === D) S++; }
    return { question: `Let $S$ be the number of ordered pairs of integers $(a,b)$ with $1 \\leq a \\leq ${A}$ and $b \\geq 0$ such that the polynomial $x^2+ax+b$ can be factored into the product of two (not necessarily distinct) linear factors with integer coefficients. Find the remainder when $S$ is divided by $1000$ .`, answer: S % 1000 };
  }),
];

/** Lattice paths on an n x n grid (2n unit steps) with exactly c direction changes: closed form. */
export function gridPathsFormula(n: number, c: number): bigint {
  const runs = c + 1;
  if (runs % 2 === 1) { const j = (runs - 1) / 2; return 2n * C(n - 1, j) * C(n - 1, j - 1); }
  const j = runs / 2; return 2n * C(n - 1, j - 1) * C(n - 1, j - 1);
}
/** prod over all n-th roots of unity w of (w^2 - a w + c) = c^n - L_n + 1, L_n = r1^n + r2^n (Lucas sequence). */
export function rootProd(n: number, a: number, c: number): bigint {
  let L0 = 2n, L1 = BigInt(a); for (let i = 1; i < n; i++) [L0, L1] = [L1, BigInt(a) * L1 - BigInt(c) * L0];
  return BigInt(c) ** BigInt(n) - L1 + 1n;
}
/** Number of b-eautiful integers: n = s^2 with base-b digits d1 >= 1, d0, d1 + d0 = s, i.e. d1 = s(s-1)/(b-1). */
export function beautifulCount(b: number): number {
  let cnt = 0;
  for (let s = 1; s <= 2 * b - 2; s++) { const num = s * (s - 1); if (num % (b - 1)) continue; const d1 = num / (b - 1), d0 = s - d1; if (d1 >= 1 && d1 <= b - 1 && d0 >= 0 && d0 <= b - 1) cnt++; }
  return cnt;
}
