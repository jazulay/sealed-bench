# Round 3: locking the spec

## Prompt packet (merged spec)
# NEAR HACKATHON idea debate — ROUND 3 (lock-in)
CRITIC ONLY: text reply, no code, no file edits, no modifying commands, no chain actions.
Round 2: all three (Grok, Claude, Codex) chose SEALED BENCH as a sampled audit. Below is the merged spec. Reply in under 250 words: "ACCEPT" or "ACCEPT WITH <one change>" or "OBJECT: <blocking flaw>". Only raise blocking issues.

## LOCKED SPEC: Sealed Bench — sampled audit for private evals
Tracks: privacy (primary), open; agents only if CLI JSON/view method ships.
Claim language: "Owner-reported score 72%; 20/20 sampled entries verified on NEAR. Under uniform sampling, if >=10% of entries were invalid this audit would have caught it with prob >= 88% (1-(1-f)^k). This is not the probability the score is correct and says nothing about benchmark quality." Headline experiment = "public-to-sealed variant gap" (contamination is one possible explanation, not proven).
Dataset: ~25 public GSM8K-style problems turned into code templates; generator draws fresh numbers/names; answers computed by code (correct by construction, difficulty-matched). ~100 sealed items + their ~100 public originals. Suite and reporting rule fixed before results; publish whatever comes out.
Protocol (one NEAR testnet Rust contract):
1. commit_suite: salted Merkle root over (idx, item, answer) + nominal bond; pinned TEE signer address(es) + attestation report hash (registered after off-chain attestation check; trust basis disclosed).
2. start_run(model): contract derives run nonce from random_seed; every request = public template + item + nonce; temp 0, thinking off, max_tokens ~400, non-stream, canonical model id, x-no-aliasing; model must end with "ANSWER: <int>".
3. commit_run(model): run root over (idx, req_hash, resp_hash, sig, grade) + FULL public grade vector; contract computes the score itself from the vector.
4. All model runs for the suite (2 models: Qwen3.8-27B, GLM-5.3-flash; DeepSeek stretch) must be committed before draw_challenge, callable by anyone only after height H+N, first call wins, one immutable set of k=20 distinct indices shared across all runs; reveal deadline; timeout => run FAILED.
5. reveal (batches of ~5): contract checks Merkle proofs (suite + run), recomputes req hash from template+item+nonce, sha256 of response bytes, ecrecover vs pinned signer, extracts last "ANSWER:" integer from raw response bytes, compares to committed answer and to the grade-vector entry. Pass => AUDITED; any mismatch => FAILED (status permanent; runs cannot be deleted).
6. View get_audit(suite, model) + CLI JSON output; one static results page with explorer links.
Judge path: deployed testnet contract + genuine recorded signed fixtures; `npm run verify` (no API key) re-verifies everything; `npm run tamper` alters a challenged entry -> rejected on-chain / in verifier. Live inference optional flag.
Build order: Wed = signature byte-exact spike (JS + Rust ecrecover unit test) + save fixture + contract skeleton + gas for 1 reveal; Thu AM = generator + inference runs (save all sigs immediately); Thu PM = commit/challenge/reveal on testnet + CLI; Thu night = page, README (do X -> see Y, threat model), video; Fri AM buffer. Fallback if request hash not reproducible: response-only binding, disclosed.
Cut: bond economics, MCP server, market.near.ai integration, signer rotation, 3rd model, fancy leaderboard, offline attestation re-check unless it truly works.
Threat model: trusts NEAR AI TEE key + admin signer pinning (model id is gateway claim, not proof of weights); set hidden from vendors/public, not from owner; unsampled grades only probabilistically checked; re-rolls not prevented (temp 0 + nonce reduce, disclosed); revealed items burned; block-producer randomness bias; recorded replay proves verification, not live availability.

## Claude Code
**ACCEPT WITH one change: fix the number in the claim.**

The claim says "≥88%" and cites 1-(1-f)^k. With f = 0.10 and k = 20 that formula gives 1 − 0.9²⁰ ≈ 0.878. So "≥88%" is false as written; it rounds up past a lower bound. This sentence is the honesty statement of the whole project, so a judge who checks it would wrongly read the error as overclaiming.

Replace it with:

> "...if ≥10% of the N=100 entries were invalid, this audit catches it with probability ≥87.8% (with-replacement bound 1−(1−f)^k; exact without-replacement value for 20 distinct indices from 100 ≈ 90%)."

Your protocol draws k=20 *distinct* indices, which is sampling without replacement. That gives a hypergeometric miss probability of C(90,20)/C(100,20) ≈ 0.095, so a catch rate of about 90%. Either state the conservative 87.8% bound, or compute the exact value in `npm run verify` and print that. Don't mix the formula from one with the number from the other.

Also, not blocking: if there are two committed runs, state that the bound applies **per run**. Otherwise readers may combine the two into one bigger sample.

Everything else is sound enough to lock:
- The run nonce comes after commit_suite, so answers can't be precomputed.
- The contract computes the score from the public grade vector.
- The challenge is drawn after all runs are committed, and the index set is shared across runs.
- A failed or late reveal is a permanent FAIL.
- The threat model already lists the honest residual risks: re-rolls, how much trust rests on the TEE key, and bias in the block randomness.

The Wednesday byte-exact signature spike is the right risk to tackle first.

## Codex
ACCEPT

The sampled-audit claim is appropriately limited, the challenge follows all run commitments, and failed audits remain visible. The disclosed trust assumptions and replay limitations fit the proposed demo. No blocking issue.
## Grok
ACCEPT. Applying Claude's correction: 1-(0.9)^20 = 87.8% (with-replacement bound); exact without-replacement value for k=20 distinct of N=100 at f=10% is 90.5% (checked: 1-C(90,20)/C(100,20) = 0.9049). The bound is per run.

**Result: unanimous ACCEPT (Claude with the number fix, which is applied).**
