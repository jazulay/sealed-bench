# Decision: Sealed Bench, a sampled audit for private AI evals
Unanimous after 3 rounds between Grok, Claude Code and Codex (Wed Nov 11, 2026, ~2:05 PM CT). Claude and Codex acted as critics only and wrote no code. Transcripts: round1.md, round2.md, round3.md; raw outputs are in raw/.

**Tracks:** `privacy` (primary) and `open`. Add `agents` only if the agent-facing view method and CLI JSON ship.

## Why
1. Illia asked for it by name: "AI benchmarking with private test sets… certified for given model and given hash of test set". None of the 498 current submissions does this.
2. Real, checkable crypto that only a chain can provide: commitments that can't be changed, public randomness, and TEE signatures checked on-chain. The claims are honestly scoped, with a stated detection bound.
3. It produces a measured result (the public-to-sealed variant gap). Past NEAR winners won on measured results, and it's easy for the Claude Code and Codex screeners to reproduce: `npm run verify` and `npm run tamper` work without an API key.

## Claim wording (fixed)
"Owner-reported score X%; 20/20 sampled entries verified on NEAR. Under uniform sampling, if ≥10% of the 100 entries were invalid, this audit would catch it with probability ≥87.8% (with-replacement bound 1−(1−f)^k; exact for 20 distinct indices from 100 ≈ 90.5%). The bound applies per run. It is not the probability that the score is correct, and it says nothing about benchmark quality."

The headline is a **"public-to-sealed variant gap"**. Contamination is one possible explanation, not a proven one.

## MVP scope
- **Dataset:**
  - About 25 public GSM8K-style problems are turned into code templates. A generator draws fresh numbers and names, and code computes each answer, so answers are correct by construction and the difficulty matches the original.
  - About 100 sealed items, plus the ~100 public originals.
  - The suite and the reporting rule are fixed before any results, and the result gets published whatever it shows.
- **Contract** (one Rust contract on NEAR testnet), in order:
  1. `commit_suite`: a salted Merkle root over (idx, item, answer), a nominal bond, a pinned TEE signer address, and the attestation report hash.
  2. `start_run(model)`: produces a run nonce from `random_seed`. Each request is the public template + the item + the nonce. Settings: temperature 0, thinking off, max_tokens around 400, non-streaming, canonical model id, `x-no-aliasing`. The prompt ends with "ANSWER: <int>".
  3. `commit_run`: a run root over (idx, req_hash, resp_hash, sig, grade), plus the **full public grade vector**. The contract computes the score itself.
  4. `draw_challenge`: callable by anyone after height H+N, and the first call wins. It picks one immutable set of k=20 distinct indices, **shared across all runs**, after **all** runs are committed. There is a reveal deadline, and a timeout marks the run FAILED.
  5. `reveal`, in batches of about 5. For each revealed item it checks:
     - both Merkle proofs;
     - that the request hash recomputes from template + item + nonce;
     - the sha256 of the response;
     - `env::ecrecover` against the pinned signer;
     - the last `ANSWER:` integer in the raw response bytes, against both the committed answer and the grade-vector entry.

     Results are AUDITED or FAILED, permanently. Runs cannot be deleted.
  6. `get_audit(suite, model)` is a view method.
- **Models:** Qwen3.8-27B and GLM-5.3-flash, both served in TEEs by NEAR AI Cloud. DeepSeek-V4.1-Flash is a stretch goal.
- **Interfaces:** a CLI with JSON output, one static results page with explorer links, `npm run verify` (replays genuine recorded signed fixtures against the deployed testnet contract), `npm run tamper` (alters a challenged entry, which gets rejected), and live inference as an optional flag.
- **Cut:** bond economics and slashing, MCP server, market.near.ai integration, signer rotation, 3rd model, polished leaderboard, offline attestation re-check (unless it really works).

## Demo (~75s)
- **0–10s:** "Public benchmarks leak into training data. How do you prove a score without showing the test?"
- **10–25s:** Commit a sealed suite of 100 template-generated items. The root appears on the testnet explorer.
- **25–40s:** Run Qwen and GLM. TEE-signed responses stream in, and both runs plus their grade vectors are committed.
- **40–55s:** Anyone triggers the challenge draw, and 20 shared indices light up. They're revealed, and every on-chain check turns green: Merkle proof, request hash, signature, answer. Status: AUDITED.
- **55–68s:** The tamper script flips one challenged answer. The contract rejects it and the run is marked FAILED, permanently.
- **68–75s:** Results show the public score next to the sealed score and the variant gap. Close on "`git clone && npm run verify`, no API key needed."

## Threat model (README)
- **Trusted parties:** you trust NEAR AI's TEE signing key and the admin who pins the signer after checking attestation off-chain. The model id is the gateway's claim, not proof of which weights ran. Same-model instances share one key.
- **Who can see the set:** it's hidden from model vendors and the public, but not from the owner, who generates and grades it.
- **Unsampled entries:** they are only checked probabilistically (bound above). Re-rolls are not prevented; temperature 0 and the nonce reduce them, and this is disclosed.
- **Revealed items are used up:** each reveal removes them from the sealed set. Block producers can slightly bias the randomness (fine for testnet). Recorded replay proves the verification works; it doesn't prove the live service is up.

## Build order (ship Fri Nov 13, noon CT)
- **Wed:**
  - Byte-exact signature spike: one signed response, its hash and recovered address reproduced in JS and in a Rust `env::ecrecover` unit test. Save it as a fixture immediately; nothing else gets built until it passes.
  - Contract skeleton, and gas measured for a single reveal.
- **Thu AM:** generator plus all inference runs (about 400 calls). Fetch and store each signature immediately.
- **Thu PM:** commit, challenge and reveal on testnet, then the CLI.
- **Thu night:** results page, README ("do X → see Y" plus threat model), video, X post draft.
- **Fri AM:** buffer.
- **Fallback:** if the request hash can't be reproduced, bind to the response only and disclose it.

## Key changes from the debate
- "Certificate" became a **sampled audit**, with printed sampling assumptions (Codex).
- Added a run nonce and per-item grades committed before the challenge. Wording changed from "Contamination Delta" to a **variant gap** (Claude, Codex).
- The contract computes the score from a **public grade vector**; previously the score was owner-declared (Codex).
- Items are **template-generated**, so answers are correct by construction; previously they were free-form paraphrases (Claude).
- **One challenge set shared across all model runs**, drawn after all runs are committed (Claude).
- Grading reads **raw response bytes** (`ANSWER: <int>`), with no JSON parsing on-chain (Claude).
- The challenge draw is anyone-callable after H+N, first call wins, with a reveal deadline and permanent FAILED (Codex).
- Smaller scale: 100 items and 2 models (Codex). Corrected the bound: 87.8% / 90.5%, stated per run (Claude).

## NEAR AI Cloud credits
- **Required for the build, not for judges.** Genuine TEE-signed responses only come from NEAR AI Cloud, which needs an API key with credits.
- The cost is tiny: about 400 calls × ~500 tokens on Qwen3.8-27B or GLM-5.3-flash comes to well under $1.
- The **free $10 NEAR Builders key** (nearbuilders.org/join, then dashboard) is enough; no purchase is needed. Yossi has to do that signup himself.
- Whether the Builders key's responses support `/v1/signature` the same way should be confirmed in the Wednesday spike.
- Judges need no key: `npm run verify` replays the recorded fixtures.
- **Without any key there is no honest fallback.** Mock signatures would break the core claim. The only alternative is a different TEE (OutLayer TDX, pricing unverified).
