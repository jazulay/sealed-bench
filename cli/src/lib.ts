// Byte-for-byte mirror of contract/src/verify.rs. Any change here must match the contract.
import { createHash } from "node:crypto";
import { hashMessage, recoverAddress, SigningKey, Signature, keccak256, toUtf8Bytes } from "ethers";

export const sha256hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(typeof data === "string" ? Buffer.from(data, "utf8") : data).digest("hex");
const sha256buf = (b: Buffer): Buffer => createHash("sha256").update(b).digest();
export const strip0x = (s: string) => s.replace(/^0x/i, "");

/** sha256(0x00 || "sb-item-v1\n{idx}\n{salt}\n{answer}\n{question}") */
export function itemLeaf(idx: number, salt: string, answer: number | bigint, question: string): Buffer {
  return sha256buf(Buffer.concat([Buffer.from([0]), Buffer.from(`sb-item-v1\n${idx}\n${salt.toLowerCase()}\n${answer}\n${question}`, "utf8")]));
}
/** sha256(0x00 || "sb-run-v1\n{idx}\n{req}\n{resp}\n{sig}\n{grade}") */
export function runLeaf(idx: number, reqHash: string, respHash: string, sig: string, grade: number): Buffer {
  return sha256buf(Buffer.concat([Buffer.from([0]), Buffer.from(`sb-run-v1\n${idx}\n${reqHash}\n${respHash}\n${strip0x(sig).toLowerCase()}\n${grade}`, "utf8")]));
}
export const node = (l: Buffer, r: Buffer) => sha256buf(Buffer.concat([Buffer.from([1]), l, r]));

export function buildTree(leaves: Buffer[]): Buffer[][] {
  const levels = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(node(cur[i], cur[i + 1] ?? cur[i]));
    levels.push(next);
  }
  return levels;
}
export const rootOf = (levels: Buffer[][]) => levels[levels.length - 1][0].toString("hex");
export function proofOf(levels: Buffer[][], idx: number): string[] {
  const p: string[] = [];
  for (const lvl of levels.slice(0, -1)) {
    const sib = idx % 2 === 0 ? Math.min(idx + 1, lvl.length - 1) : idx - 1;
    p.push(lvl[sib].toString("hex"));
    idx = Math.floor(idx / 2);
  }
  return p;
}
export function rootFromProof(leaf: Buffer, idx: number, proof: string[]): string {
  let cur = leaf;
  for (const s of proof) {
    const sib = Buffer.from(s, "hex");
    cur = idx & 1 ? node(sib, cur) : node(cur, sib);
    idx >>>= 1;
  }
  return cur.toString("hex");
}
export function treeDepth(n: number): number {
  let d = 0, w = Math.max(1, n);
  while (w > 1) { w = Math.ceil(w / 2); d++; }
  return d;
}

/** {MODEL}, {NONCE} and JSON-quoted {QUESTION} substitution (JSON.stringify == contract json_string). */
export function buildRequest(template: string, model: string, nonce: string, question: string): string {
  return template.split("{MODEL}").join(model).split("{NONCE}").join(nonce).split("{QUESTION}").join(JSON.stringify(question));
}
export const signedText = (model: string, reqHash: string, respHash: string) => `${model}:${reqHash}:${respHash}`;

/** EIP-191 personal_sign recovery, as NEAR AI Cloud ECDSA signatures are verified. */
export function recoverSigner(text: string, sig: string): string {
  const raw = strip0x(sig);
  if (raw.length !== 130) throw new Error(`signature must be 65 bytes, got ${raw.length / 2}`);
  return recoverAddress(hashMessage(text), Signature.from("0x" + raw)).toLowerCase();
}
export function signEip191(privKeyHex: string, text: string): string {
  return new SigningKey(privKeyHex).sign(hashMessage(text)).serialized;
}
export const addressOf = (privKeyHex: string) =>
  ("0x" + keccak256("0x" + new SigningKey(privKeyHex).publicKey.slice(4)).slice(-40)).toLowerCase();

/** Mirror of verify.rs answer_region: the first `"content":"` JSON string value (still escaped). */
export function answerRegion(raw: string): string | null {
  const MARK = '"content":"';
  const p = raw.indexOf(MARK);
  if (p < 0) return raw.includes("reasoning_content") ? null : raw;
  const start = p + MARK.length;
  for (let i = start; i < raw.length; ) {
    if (raw[i] === "\\") i += 2;
    else if (raw[i] === '"') return raw.slice(start, i);
    else i += 1;
  }
  return null;
}
/** Grade input: the last ANSWER inside the response's `content` only (never reasoning_content). */
export const responseAnswer = (raw: string): number | null => { const r = answerRegion(raw); return r === null ? null : extractAnswer(r); };

/** Last "ANSWER:" marker; skip ' ', '*', '$'; optional '-'; digits with thousands commas; <=18 digits. */
export function extractAnswer(resp: string): number | null {
  const pos = resp.lastIndexOf("ANSWER:");
  if (pos < 0) return null;
  let i = pos + 7;
  while (i < resp.length && (resp[i] === " " || resp[i] === "*" || resp[i] === "$")) i++;
  let neg = false;
  if (resp[i] === "-") { neg = true; i++; }
  let digits = "";
  while (i < resp.length) {
    const c = resp[i];
    if (c >= "0" && c <= "9") { digits += c; i++; }
    else if (c === "," && i + 1 < resp.length && resp[i + 1] >= "0" && resp[i + 1] <= "9") i++;
    else break;
  }
  if (!digits || digits.length > 18) return null;
  const v = Number(digits);
  return neg ? -v : v;
}

/** k distinct sorted indices: sha256("sb-draw-v1"||seed||suite_id||ctr_le64) mod n. */
export function drawIndices(seed: Buffer, suiteId: string, n: number, k: number): number[] {
  const out: number[] = [];
  for (let ctr = 0n; out.length < k; ctr++) {
    const c = Buffer.alloc(8); c.writeBigUInt64LE(ctr);
    const h = sha256buf(Buffer.concat([Buffer.from("sb-draw-v1"), seed, Buffer.from(suiteId), c]));
    const idx = Number(h.readBigUInt64LE(0) % BigInt(n));
    if (!out.includes(idx)) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}

export interface RevealItem {
  idx: number; salt: string; answer: number; question: string; response: string;
  signature: string; grade: number; suite_proof: string[]; run_proof: string[];
}
export interface CheckCtx { suiteRoot: string; n: number; template: string; model: string; nonce: string; runRoot: string; grades: string; pinned: string[] }
export interface Check { ok: boolean; reason: string; request_sha256?: string; response_sha256?: string; signed_text?: string; recovered_signer?: string | null; model_answer?: number | null; correct?: boolean }

/** Offline replay of the contract's check_inner, in the same order with the same reasons. */
export function checkReveal(c: CheckCtx, it: RevealItem): Check {
  const r: Check = { ok: false, reason: "" };
  const fail = (m: string) => ({ ...r, reason: m });
  if (it.idx >= c.n) return fail("idx out of range");
  if (it.suite_proof.length !== treeDepth(c.n)) return fail("suite proof has wrong length");
  if (rootFromProof(itemLeaf(it.idx, it.salt, it.answer, it.question), it.idx, it.suite_proof) !== c.suiteRoot)
    return fail("suite Merkle proof does not match committed root");
  const req = buildRequest(c.template, c.model, c.nonce, it.question);
  r.request_sha256 = sha256hex(req);
  r.response_sha256 = sha256hex(it.response);
  if (it.grade > 1) return fail("grade must be 0 or 1");
  if (it.run_proof.length !== treeDepth(c.n)) return fail("run proof has wrong length");
  if (rootFromProof(runLeaf(it.idx, r.request_sha256, r.response_sha256, it.signature, it.grade), it.idx, it.run_proof) !== c.runRoot)
    return fail("run Merkle proof does not match committed run root (request, response, signature or grade changed)");
  if (Number(c.grades[it.idx]) !== it.grade) return fail("grade differs from committed grade vector");
  r.signed_text = signedText(c.model, r.request_sha256, r.response_sha256);
  try { r.recovered_signer = recoverSigner(r.signed_text, it.signature); } catch (e) { return fail(`signature: ${(e as Error).message}`); }
  if (!c.pinned.map((a) => a.toLowerCase()).includes(r.recovered_signer)) return fail(`signature not from a pinned signer for ${c.model}`);
  r.model_answer = responseAnswer(it.response);
  r.correct = r.model_answer === it.answer;
  if (Number(r.correct) !== it.grade) return fail(`re-grade mismatch: model answered ${r.model_answer ?? "none"}, key ${it.answer}, committed grade ${it.grade}`);
  return { ...r, ok: true, reason: "all checks passed" };
}

/** Deterministic RNG from a 32-byte seed (sha256 counter mode). */
export function seededRng(seedHex: string, label: string) {
  let ctr = 0;
  const next = () => {
    const h = createHash("sha256").update(`${seedHex}|${label}|${ctr++}`).digest();
    return Number(h.readBigUInt64LE(0) >> 11n) / 2 ** 53;
  };
  return {
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    hex32: () => createHash("sha256").update(`${seedHex}|${label}|salt|${ctr++}`).digest("hex"),
  };
}
