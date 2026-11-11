# Round 2: synthesis

## Prompt packet (includes both Round 1 critiques and Grok's synthesis)
# NEAR HACKATHON idea debate — ROUND 2
You are a CRITIC / IDEA REVIEWER ONLY. Text reply only: no code, no file edits, no commands that modify anything, no blockchain actions.
Constraints recap: solo builder + 1 AI coding agent, ~2 days, ship Fri Nov 13 noon CT; testnet OK; NEAR AI Cloud TEE models (Qwen3.8-27B, DeepSeek-V4.1-Flash, GLM-5.3-flash) with per-response ECDSA signature over "MODEL:sha256(req):sha256(resp)"; NEAR contract can ecrecover; Shade Agents deprecated; Intents mainnet-only. Judges: Illia, Mert, Haseeb, Eddy (a16z), Avichal, Kain, Stepan + Claude Code/Codex screeners.

## Round 1 result: SPLIT
- CLAUDE picked SEALED BENCH + "Contamination Delta" variant (full text below).
- CODEX picked BLINDSPOT (private code review with receipts), ranking Sealed Bench #2 because its "certificate overclaims" (full text below).
- GROK (me) picked SEALED BENCH.

=== CLAUDE ROUND 1 ===
I'm replying in text only, as the packet asks: no files and no commands.

## 1. Ranking

1. **Sealed Bench.** It's on Illia's list and nobody has taken it. It uses NEAR for something only a chain can do: public randomness and permanent commitments. It can also produce a number, which is how past winners won.
2. **Blindspot.** Easy to build and easy for the AI screeners to run, but it reads as "an API wrapper plus a receipt." The on-chain part does very little.
3. **Unwind.** Haseeb's chargeback argument is a real hook. But 34 escrow entries already exist, and the AI arbiter is the weakest, most subjective part.
4. **Vault Heist.** Best live demo, but Freysa clones and Bag Heist are already in. It will look derivative.
5. **Sealed Second Opinion.** It's a frontend for TEE inference. The prompt-NFT royalties feel bolted on.
6. **Oracle of the Meme.** Fun, but it's mostly the memecoins track and the "AI judge" part is shallow.
7. **Basis Butler.** It needs mainnet and real money in 2 days, and judges can't reproduce it. Drop it.
8. **Quiet Ledger.** Aftercall already exists. Drop it.

## 2. Attacking Sealed Bench

**What the signature proves.** Only this: a key that NEAR AI keeps in its TEE signed `MODEL:H(req):H(resp)`. It does **not** prove which model weights ran. The model string is the gateway's own claim. All instances of a model share one key, and the docs say this is not a full chain from model to response.

The contract can't check Intel TDX attestation itself. Someone registers the allowed signer address after checking attestation off-chain. Say that plainly in the README; if you claim more, a technical judge will catch it.

**The biggest hole: grading lies on hidden items.** The signature proves a response exists, not that it was graded correctly. The contract can't check items nobody reveals. Random challenges catch this, but only if the owner commits every per-item grade **before** the random seed exists. Detection is then measurable: if a fraction f of grades are false and k items are challenged, the lie escapes with probability (1−f)^k. With k=30 and f=10%, it's caught 96% of the time. Put that formula in the README; it's the strongest thing in the project.

**Requests can be swapped.** The owner could slip answer hints into the prompt. For every challenged item, reveal the full request bytes. The contract recomputes the hash and checks the request equals a public template plus the item plus the run nonce.

**Re-rolling isn't stopped.** The owner can sample each item N times and keep the best answer. The TEE doesn't count calls. Partial fixes: temperature 0, a run nonce from the chain, and listing this as a known limit on the certificate.

**Run abandonment.** The owner could drop a run whose challenge draw looks bad and start over. Make every commit permanent, add a bond, and show abandoned runs on the leaderboard.

**Narrative gap.** Only open-weight models run in the TEE. Contamination is most worrying for closed models (GPT, Claude), and those are only proxied. Frame it as "certified evals for TEE-served models," with the closed-model case as roadmap.

**Other gaps.**
- Revealing challenged items uses them up, so the set shrinks with each run.
- The block's random seed can be biased slightly by the block producer. That's acceptable on testnet.

**Demo.** As planned, it's abstract: Merkle trees and a leaderboard. It needs a headline number (see section 3).

**Feasibility: about 7 out of 10.** Risks:
- Signature format details (non-streaming, `x-no-aliasing`, canonical model id, EIP-191 prefix, the recovery byte).
- The NEAR AI service going down.

Only the challenged items need an on-chain signature check (about 0.3 Tgas each). Checking unrevealed signatures on-chain proves nothing.

**AI screeners.** Strong, if there's a replay mode: saved signed fixtures plus a deployed testnet contract, so `npm run verify` needs no NEAR AI key.

**Judge fit.**
- **Illia:** directly on his list.
- **Mert:** privacy.
- **Eddy:** data contamination is a lasting problem, so it will stick around.
- **Stepan:** ship it as a CLI or MCP tool so agents can request certificates.
- **Haseeb:** weakest fit.

## 3. Sharper variant: the "Contamination Delta"

Ship a result, not just infrastructure:
- Build about 300 private paraphrases of public math and reasoning questions (GSM8K-style), with multiple-choice or exact-match answers so the contract can re-grade on-chain.
- Run 2–3 TEE models (Qwen3.8, DeepSeek-V4.1-Flash, GLM-5.3-flash) on the public originals and the sealed versions.
- Certify the gap between the two scores.

The headline becomes: *"DeepSeek drops 11 points on unseen versions, certified on NEAR without revealing one hidden question."* Past winners won on numbers like that.

## 4. Final pick: Sealed Bench + Contamination Delta

**Tracks:** privacy (main), open, agents.

**MVP:**
1. **Set commit.** The owner commits a Merkle root over (item, answer) and posts a bond.
2. **Run start.** The contract creates a run nonce from the random seed. Every request must include it, so no response can come from before the commit.
3. **Run commit.** A runner calls the TEE models (non-streaming) and fetches each signature. It commits a root over (index, request hash, response hash, signature, grade) together with the claimed score.
4. **Challenge.** Using a later block's random seed, the contract picks k items to challenge.
5. **Reveal.** For each challenged item, the contract checks:
   - both Merkle proofs;
   - the request hash and that the request matches the template;
   - the signature, recovered against the allowed signer;
   - the grade, by re-grading.
6. **Result.** A certificate is issued, or the bond is slashed and the run is marked failed.
7. **Interfaces:** a leaderboard page, a `verify` CLI, a replay mode with fixtures, and a tamper script.

**Demo script (~75s):**
- **0–10s:** "Public benchmarks leak into training data. How do you prove a score without showing the test?"
- **10–25s:** Commit a 300-item sealed set; the root appears on the testnet explorer.
- **25–40s:** Run Qwen and DeepSeek. Signed responses stream in and the run root is committed.
- **40–55s:** The challenge is drawn on-chain and 15 cells light up. They're revealed and every on-chain check turns green. The certificate is minted.
- **55–70s:** Tamper: flip one grade and rerun. The contract rejects it on-chain. Then the leaderboard shows the public score next to the sealed one, with the delta.
- **70–80s:** "`git clone && npm run verify`: no API key needed."

**Threat model:**
- **Trust:** you trust NEAR AI's TEE key and the admin who registers the signer. Attestation is checked off-chain, and the model id is the gateway's claim, not proof of the weights.
- **Owner visibility:** the set is hidden from model vendors and the public, not from the owner.
- **Grading fraud:** caught with probability 1−(1−f)^k. Every run is permanent and bonded, so the owner can't quietly retry.
- **Re-rolling:** not prevented. It's reduced by temperature 0 and the run nonce, and disclosed on each certificate.
- **Lesser limits:** revealed items are used up, and the random seed can be slightly biased by block producers.


=== CODEX ROUND 1 ===
**My pick is BLINDSPOT, sharpened into a verifiable private review tool. SEALED BENCH has the higher ceiling, but its current certificate promises more than its protocol proves.** Rankings below prioritize winning with a credible two-day build.

1. **BLINDSPOT** — Best combination of useful product, achievable scope, and reproducibility. Needs measured review quality and a clear verification story to escape “API wrapper.”
2. **SEALED BENCH** — Strongest originality and Illia alignment; substantial unresolved trust gaps in score certification.
3. **VAULT HEIST** — Best immediate demo. Existing competitor and payout authorization semantics weaken differentiation.
4. **UNWIND** — Strong Haseeb hook and commercial problem. Credible dispute handling requires evidence rules, appeals, and merchant incentives beyond an AI verdict.
5. **ORACLE OF THE MEME** — Achievable and entertaining; weak reason for durable adoption or meaningful verification.
6. **SEALED SECOND OPINION** — Compelling privacy use case, but medical credibility and prompt-NFT royalties distract from the achievable core.
7. **QUIET LEDGER** — Useful, but direct competition leaves little differentiation.
8. **BASIS BUTLER** — Too many execution, funding, and integration risks for this window.

The hardest attack on **SEALED BENCH** is that it conflates authentic inference with an authentic benchmark score.

A valid EIP-191 signature establishes that a particular key signed a message containing a model identifier and two hashes. It does **not independently prove** which weights executed, that the inputs were confidential, that the grader was honest, or that every dataset item was evaluated. Recovering an address is insufficient unless the verifier authenticates that address’s authority. An attestation hash alone provides no such authentication. Your packet explicitly warns that preflight attestation plus a response signature leaves an incomplete chain.

The owner can select easy questions, fabricate answer keys, leak answers into prompts, retry until successful, omit failures, or invent grades. A Merkle root commits to a dataset; it does not establish dataset quality or enforce the evaluation procedure.

Challenge-reveal only helps if the dataset, grading rules, and **complete indexed transcript plus claimed grades** are fixed before challenge selection. Otherwise the owner can adapt. Even then, randomly revealing questions without checking deterministic grades proves little. `random_seed` needs a defined future selection step and analysis of retries, abandonment, and randomness influence.

Sampling is weaker than “95% stays secret” sounds. With five uniformly sampled checks and 10% corrupted entries, detection is only approximately **41%**. Detecting one bogus item among 100 requires revealing approximately 95 items for 95% detection. Salt commitments against dictionary attacks; revealed samples permanently lose privacy.

The model receives the questions. Confidential execution may protect them from an operator under stated assumptions; it cannot establish that benchmark content never influences model behavior. Model-version identity and cross-run comparability also need explicit limits.

The demo risks becoming hashes and a leaderboard whose headline score remains owner-controlled. Two days must cover byte-exact serialization, EIP-191 recovery, signer authentication, contract integration, challenge timing, scoring, and readable verification failures.

My read of the judges: Illia will recognize the requested idea immediately—and examine whether it actually solves it. Mert may appreciate confidentiality while questioning unsupported security claims. Haseeb and Eddy need an identifiable buyer and recurring workflow. AI screeners will reward executable verification and punish a README that says “certified score” when only inference receipts are verified.

Two sharper variants:

- **SEALED BENCH: sampled audit.** Deterministic exact-match tasks, salted dataset commitments, frozen transcripts, and on-chain checking of revealed samples. Publish an **owner-reported score with sampled audit results**, including sampling limits. Defensible, but substantially less ambitious.
- **BLINDSPOT: review before publish.** Private review with independently checkable inference receipts and a public benchmark of seeded security defects. Measure detection rate, false positives, latency, and cost. This supplies both product value and quantified evidence.

BLINDSPOT’s weakness remains: receipts cannot make a bad review good. Its differentiation must be useful findings, clear confidentiality boundaries, and verification that survives independent replay.

**Final pick: BLINDSPOT — privacy primary; business and agents secondary.**

MVP: one CLI accepting a local diff, one TEE-served model, attestation inspection, exact request/response preservation, signature verification against an explicitly authenticated or pinned signer, and a small NEAR testnet receipt registry. Store hashes publicly; keep source and review local by default. Ship a deterministic offline verifier with genuine recorded receipts and tampered fixtures, plus an optional live path requiring credits. Benchmark 15–20 small public fixtures with known defects; report actual results without promising improvement.

**75-second demo:**

- **0–15s:** Show a private diff containing a seeded authorization bug.
- **15–35s:** Run review; show the actionable finding and confidentiality assumptions.
- **35–50s:** Verify its receipt and open the testnet hash anchor.
- **50–65s:** Change one response byte; verification fails.
- **65–75s:** Show benchmark results and the single-command offline reproduction.

Honest threat model:

- Trusts the provider’s enclave, attestation system, signer provisioning, and stated model identity; disclose remaining binding gaps.
- Protects content only under those assumptions; endpoints, local files, and logs remain exposure points.
- Receipts establish signed-byte integrity, not review correctness or absence of vulnerabilities.
- Public anchoring establishes registration of a digest, not confidentiality or execution time; offline replay establishes neither freshness nor current service availability.

=== GROK ROUND 2 SYNTHESIS PROPOSAL ===
I think Codex's attack is correct on *naming and claims* and Claude's protocol answers most of the *mechanics*. Proposal: **SEALED BENCH as a "sampled audit", not a "certificate"**, with:
1. Naming/claims: "Audited score" = owner-reported score + on-chain sampled audit result + explicit detection bound 1-(1-f)^k printed on every result. Never say "certified model identity" or "proved weights".
2. Protocol (Claude's, tightened): owner commits salted Merkle root of (item, answer) + bond -> contract issues run nonce (from block after commit) that must appear in every request -> runner gets TEE-signed responses (temp 0, non-stream, canonical model id, x-no-aliasing) -> owner commits run root over (idx, req_hash, resp_hash, sig, grade) + claimed score BEFORE challenge -> contract draws k challenges from a later block's random_seed -> reveal: contract checks both Merkle proofs, recomputes req hash = public template + item + nonce, ecrecovers sig against a PINNED signer address (registered by admin after off-chain attestation check; attestation report hash + nonce stored on-chain; `verify` CLI re-checks attestation offline), and re-grades deterministically (exact-match / multiple choice) -> pass = audited result; fail = bond slashed, run marked failed; abandoned runs visible.
3. Headline result (Claude's Contamination Delta): ~200-300 private paraphrases of public reasoning items, run 2-3 TEE models on public vs sealed versions; publish audited delta.
4. Buyer story (Codex/Haseeb/Eddy concern): (a) agent marketplaces (market.near.ai, which pays agents per job) and agents choosing which model to hire — an agent-callable `get_audited_score(model, suite)` view + MCP-friendly CLI (Stepan); (b) enterprises testing vendors on private data; (c) model vendors wanting credible claims.
5. AI-screener path: deployed testnet contract + recorded genuine signed fixtures -> `npm run verify` and `npm run tamper` work with no API key; live path optional with key.
6. Honest threat model as Claude wrote, plus Codex's bullets (signature != correct grade beyond sampled items; re-rolls not prevented; set private from vendor/public not owner; revealed items burned).
Fallback if NEAR AI signatures are unavailable during build: keep recorded fixtures, mark live path degraded.

## Your task (round 2), under ~600 words:
1. Do you ACCEPT this synthesis as the single pick? If not, what exact change would make you accept, or why is your alternative strictly better for winning? (Be concrete; consensus is the goal.)
2. The 3 riskiest build items in 2 days and how to de-risk each.
3. Any cut list: what to drop from the MVP to make Friday noon safely.
4. Final pick line: "FINAL: <idea> / <tracks>".

## Claude Code
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

## Codex
**Yes—I accept SEALED BENCH as the single pick, with three concrete corrections.** The sampled-audit framing resolves my main objection. Its stronger differentiation now outweighs BLINDSPOT’s simpler build.

1. **Bind the headline score to the committed grades.** A transcript root plus a separately declared score does not establish that the score equals the grades’ sum. Simplest MVP: publish a complete, indexed grade vector; have the contract compute its total and require challenged leaves to match those grades. Questions and answers remain hidden outside revealed samples. Avoid adding a Merkle-sum tree.

2. **Call the experiment a “public-to-private variant gap.”** Paraphrasing can change difficulty, ambiguity, and answer validity. A measured drop does not isolate contamination. State that contamination is one possible explanation; publish paired results and describe how answer equivalence was checked. “Contamination Delta” as the headline still overclaims.

3. **Print the sampling assumptions alongside the bound.** The detection calculation concerns a fixed fraction of invalid entries under the specified random sampling procedure. It is not the probability that the score is correct, and it says nothing about benchmark quality or fabricated answer keys. Prefer: **“Owner-reported score: 72%; 20/20 sampled entries verified.”**

The **three riskiest build items** are:

1. **End-to-end receipt verification.** Exact request bytes, signed response serialization, signature recovery, signer authority, and deterministic answer extraction must agree. Make the first milestone one genuine response verified by the deployed contract, including grading from the response bytes whose hash was signed. Preserve that fixture immediately. Treat offline attestation verification as a separate capability that must actually work before claiming it.

2. **Challenge timing and run finalization.** “A later block” alone does not establish an ungameable draw. Specify who triggers selection, whether they can choose among blocks, and how challenges become immutable. Require distinct sampled indices, one challenge set per run, a reveal deadline, and terminal failure on timeout. Test premature reveals, duplicate indices, changed leaves, and abandoned runs. Visible abandonment improves accountability; it does not prevent cherry-picking successful runs.

3. **Producing a defensible experiment.** Hundreds of paraphrases across three models creates substantial generation, validation, inference, and debugging work. Start with **50–100 carefully checked pairs and one model**, then add a second only after the complete audit works. Publish the actual result even if the gap is small or reversed. Preselect the suite and reporting rule before seeing results.

**Cut list for Friday:**

- Three models, 300 pairs, MCP server, marketplace integration, NFTs, and elaborate leaderboard.
- Automated signer registration or rotation; use an explicitly pinned signer and disclose its trust basis.
- Production economic-security claims based on a testnet bond.
- Any guarantee that an arbitrary flipped grade gets caught. For the demo, alter a challenged entry and explain why rejection is guaranteed there.
- Multiple buyer narratives. Lead with **private evaluation teams publishing independently checkable sampled evidence**; agent consumption can be one CLI example.

Keep one contract, one minimal results page, one CLI, genuine recorded fixtures, and an optional live path. Recorded replay demonstrates verification, not current service availability.

**FINAL: SEALED BENCH — sampled private benchmark audit / privacy primary, open secondary, agents only if the CLI fits.**
**Result: consensus on Sealed Bench as a sampled audit.**
