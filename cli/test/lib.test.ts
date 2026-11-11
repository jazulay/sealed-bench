import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet, verifyMessage } from "ethers";
import * as L from "../src/lib.ts";
import { TEMPLATES } from "../src/templates.ts";

test("EIP-191 recovery matches ethers and the contract's vector", async () => {
  const w = new Wallet("0x" + "11".repeat(32));
  const text = "Qwen/Qwen3.8-27B:cde2b0f878a1c163140d450d852af84c0ca78be279fd6b031b33cd24126543e9:6a1033610c680d0a2df88bcb8861cff3c23ed0214b4a590817c984171dce3da8";
  const sig = await w.signMessage(text);
  assert.equal(sig, "0x1cb355ee5f72491f733a87afa53e61caec695d32ccab05f0fca782e0758ebfa63663fd263c0494ba535f76388d2674b9a8af18af4c2d9f6e4e8f1da6ff52b3841c");
  assert.equal(L.recoverSigner(text, sig), w.address.toLowerCase());
  assert.equal(verifyMessage(text, L.signEip191("0x" + "11".repeat(32), text)).toLowerCase(), w.address.toLowerCase());
  assert.equal(L.addressOf("0x" + "11".repeat(32)), w.address.toLowerCase());
});

test("extractAnswer mirrors the contract", () => {
  assert.equal(L.extractAnswer("so ANSWER: 42"), 42);
  assert.equal(L.extractAnswer("ANSWER: 1 then ANSWER: 7"), 7);
  assert.equal(L.extractAnswer("ANSWER: **$1,234**"), 1234);
  assert.equal(L.extractAnswer("ANSWER: -5"), -5);
  assert.equal(L.extractAnswer('{"content":"x\\nANSWER: 12\\n"}'), 12);
  assert.equal(L.extractAnswer("ANSWER: none"), null);
  assert.equal(L.extractAnswer("ANSWER: 1234567890123456789"), null);
});

test("Merkle proofs round-trip for every index and odd sizes", () => {
  for (const n of [1, 2, 3, 5, 25, 100]) {
    const leaves = [...Array(n).keys()].map((i) => L.itemLeaf(i, "ab".repeat(32), i, `q${i}`));
    const lv = L.buildTree(leaves);
    for (let i = 0; i < n; i++) {
      const p = L.proofOf(lv, i);
      assert.equal(p.length, L.treeDepth(n));
      assert.equal(L.rootFromProof(leaves[i], i, p), L.rootOf(lv));
    }
  }
});

test("draw is distinct and sorted", () => {
  const d = L.drawIndices(Buffer.alloc(32, 7), "s", 100, 20);
  assert.equal(new Set(d).size, 20);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
});

test("every template yields positive integer answers across many seeds", () => {
  for (let s = 0; s < 200; s++) {
    const r = L.seededRng(String(s), "t");
    for (const t of TEMPLATES) {
      const v = t.make(r);
      assert.ok(Number.isInteger(v.answer) && v.answer > 0, `${t.id} -> ${v.answer}`);
    }
  }
  assert.equal(TEMPLATES.length, 25);
});

test("buildRequest JSON-quotes the question like the contract", () => {
  const r = L.buildRequest('{"m":"{MODEL}","n":"{NONCE}","q":{QUESTION}}', "a/b", "00", 'He said "hi"\nthen left.');
  assert.equal(r, '{"m":"a/b","n":"00","q":"He said \\"hi\\"\\nthen left."}');
  assert.deepEqual(JSON.parse(r).q, 'He said "hi"\nthen left.');
});
