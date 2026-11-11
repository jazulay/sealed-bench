I'm replying in text only, as the round asks: no files, no commands, no chain actions.

## 1. Accept? Yes, with three amendments

I accept the synthesis as the single pick. Calling it a "sampled audit" instead of a "certificate" fixes the overclaiming Codex flagged, and the protocol is unchanged. These three amendments make it hold up when a judge pushes on it:

**A. Generate the sealed items from templates, not free-form paraphrases.**
- Turn about 30 public GSM8K-style problems into code templates. Draw fresh numbers and names for each one, and let the code compute the answer.
- Answer keys are then correct by construction, and each sealed item is as hard as its public original.
- This removes the obvious objection: "your paraphrases are just harder, so the gap isn't contamination."
- Even so, call the headline a **"public-vs-sealed gap"**, not "proof of contamination."

**B. One challenge draw covers every model's run in a suite.**
- All 2–3 model runs must be committed before a single shared random seed picks the k indices.
- Only k items get revealed per suite, instead of k per model.
- The models are audited on the same items, so they can be compared fairly.
- The owner can't wait to see one model's challenge draw before deciding whether to run the next model.

**C. Grade from the raw response bytes; don't parse JSON on-chain.**
- The prompt template makes the model end with `ANSWER: <integer>`.
- The contract finds the last occurrence of that marker in the revealed response bytes and compares the number to the committed answer.
- There's no JSON parser and no fuzzy normalization in Rust.
- Turn off thinking mode on Qwen and GLM, and cap `max_tokens` (~400) so the revealed bytes stay small.

## 2. Three riskiest build items

**1. Byte-exact signature checking from start to finish.** It's unclear what the gateway actually hashes: the raw request body we send, or a re-serialized version. On top of that come the EIP-191 prefix, keccak vs sha256, the recovery byte (v = 27/28 vs 0/1), and the canonical model id.
- *De-risk:* make this the first job on Wednesday. Get one signed response, reproduce the hash and recovered address in JS, then reproduce it in a Rust unit test using `env::ecrecover`.
- Save that response immediately as a test fixture.
- Nothing else gets built until this passes.
- If the request hash can't be reproduced, fall back to revealing the response only and say so in the threat model.

**2. Gas and argument size for reveals on-chain.** Each challenged item needs two Merkle proofs, the full request and response bytes, sha256, ecrecover, and the grade check.
- *De-risk:* reveal in batches of about 5 items per transaction. Keep k = 20–30 (with f = 10%, k = 30 catches a lie 96% of the time).
- Measure gas on a single item on Wednesday night, before writing the frontend.

**3. NEAR AI availability and credits during the window.**
- *De-risk:* run every inference Wednesday night or Thursday morning (about 150 items × 3 models × public + sealed, roughly 900 calls).
- Fetch each signature right after its response, in case signatures expire, and save everything as fixtures.
- The demo and `npm run verify` replay the saved fixtures. Live mode is a flag, not something the demo depends on.

## 3. Cut list

Cut these:
- **Bond economics.** Keep a nominal bond and a `failed` status. No slashing distribution and no bond-size tuning.
- **MCP server.** Ship a CLI that outputs JSON, plus a contract view method `get_audit(suite, model)`. Mention MCP as roadmap for Stepan.
- **On-chain attestation handling.** Store only the attestation report hash next to the pinned signer. Offline attestation re-checking in the CLI is a stretch goal.
- **Abandoned-run UI.** Runs can't be deleted by design. A status column covers it.
- **The market.near.ai integration.** It stays in the pitch only.
- **Multiple suites, and the third model** if it misbehaves. Two models with a clear gap beat three with a messy one.
- **A polished leaderboard.** One static page that reads view methods, plus the explorer links.

Keep these:
- `npm run verify` and `npm run tamper` with no API key.
- The headline gap number.
- A README with the formula 1−(1−f)^k and the honest threat model (Claude's version plus Codex's points).

Schedule:
- **Wednesday:** signature spike, contract, gas measurement.
- **Thursday morning:** inference runs and fixtures.
- **Thursday afternoon:** commit → challenge → reveal on testnet, then the CLI.
- **Thursday night:** page, README, video.
- **Friday morning:** buffer only.

## 4. Final pick

**FINAL: Sealed Bench, a sampled audit of private, template-generated evals with a certified public-vs-sealed gap / Privacy (primary), Open, Agents**
