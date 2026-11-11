# Round 1: independent ranking and critique
_Wed Nov 11, 2026, ~2:00 PM CT. Claude Code 2.1.316 (`claude -p --permission-mode plan`, Edit/Write/Bash disallowed) and Codex CLI 0.166.0-alpha.6 (`codex exec --sandbox read-only`), run on the Mac mini as critics only._

## Prompt packet
# NEAR HACKATHON 2026 — Idea debate packet (round 0)
You are a CRITIC / IDEA REVIEWER ONLY. Do not write project code, do not edit or create files, do not run commands that modify anything, do not touch any blockchain. Reply in text only.

## Context
- Builder: Yossi (solo) + one AI coding agent. Build window ~2 days. Ship target Fri Nov 13 noon CT; hard deadline Nov 14 23:59 UTC.
- Prize: $55K grand prize overall + per track $10K/$3K/$2K. 13 tracks.
- Judges (human, decide): Illia Polosukhin (NEAR), Mert Mumtaz (Helius; "privacy is security", uses Zcash+NEAR Intents daily), Haseeb Qureshi (Dragonfly; "every app becomes agent-first"; stablecoins need chargebacks/disputes to beat interchange; agentic bank runs), Eddy Lazzarin (a16z crypto; durability/"will it stick around"), Avichal Garg (Electric; PMF/revenue, distributed inference), Kain Warwick (agent harness power user, shipping), Stepan Gershuni (cyber.Fund; AI-native companies, "if an agent can't use it don't ship it").
- AI judges: Claude Code & Codex SCREEN first: clone repo, check it runs and does what README says ("do X -> see Y" steps), structured report + prelim score. Humans decide. Past criteria: technical implementation, design, impact, originality, sustainability.
- Past NEAR hackathon winners won on quantified benchmark results (Postt, DiligenceAI) and privacy-first TEE use cases (Cure Me Baby, Best Overall BUIDL AI 2025).
- Submission: public repo + X demo post with video + form (one shot). Testnet-only OK in all tracks.

## Tracks and current submission counts (498 total, Nov 11; projects can list several)
security 238 (saturated: ~88 "agent spending-limit vault" clones, 27 prompt-injection guards, 34 escrow), agents 226, realworld 106, open 97, business 92, privacy 89, defi 83, social 46, swarms 46, nfts 43, thesis 40 (~19 identical "thesis dashboards"), games 34, memecoins 29.
Illia's idea list already taken by others: AI tamagotchi (Petri, verifies TEE sig on-chain), universal checkout (Kite, ~13), AI encyclopedia+prediction markets (Credence, Priced In), private OTC, never-get-liquidated (Levee), Kickback events (ShowUp, Pull Up), cap table (Undiluted), private copy-trading viewing keys (NOVA), private meeting notes (Aftercall), Swarm-for-Hire (~14). UNTAKEN from Illia's list: "AI benchmarking with private test sets — results certified for given model and given hash of test set, without revealing any data"; "fully private code review agent"; "delta neutral anything"; "private medical second opinion" (only near-pattern: private DNA reading).

## Tech facts / blockers
- NEAR AI Cloud (OpenAI-compatible, cloud-api.near.ai/v1). TEE-served models (owned_by nearai): Qwen3.8-27B ($0.04/$1.35 per M tok), GLM-5.3-flash, DeepSeek-V4.1-Flash, whisper, embeddings. Anthropic/OpenAI/Google models are proxied (no TEE claim). Per-response signature: GET /v1/signature/<chat_id> -> ECDSA EIP-191 over "MODEL:sha256(request_bytes):sha256(response_bytes)" (provider_tee kind; needs canonical model id + x-no-aliasing, non-stream). Attestation report with nonce at /v1/attestation/report; docs warn preflight + one signature do not form a complete model->gateway->response chain; same model instances share one signing key. NEAR contracts can ecrecover secp256k1 (env::ecrecover).
- NEAR AI Cloud REQUIRES an account + credits (paid), or free $10 key by joining NEAR Builders. NEAR AI suffered an SGLang-based infra attack Nov 8 (fixed).
- NEAR Intents / 1Click: no testnet; mainnet only with tiny real funds, or dry:true quotes. No-JWT fee 0.2-0.25%.
- Chain Signatures: testnet v1.signer-prod.testnet live.
- Shade Agents framework: DEPRECATED (Apr 2026). OutLayer = Intel TDX enclaves for Rust/WASM with secrets/VRF (alternative TEE compute, unverified pricing).
- Function-call keys, meta-tx (NEP-366), NEAR Auth social login, testnet faucet all free.

## The 8 candidate ideas (Grok's draft scores: J=human judge appeal, T=NEAR tech depth, D=demo, F=feasibility 2 days, A=AI-judge reproducibility, N=novelty)
1. SEALED BENCH (privacy, open, agents) — certified AI benchmarks on private test sets. Owner commits Merkle root of test set on NEAR; runner sends each item to NEAR AI TEE model; each response's TEE signature verified ON-CHAIN via ecrecover; contract uses env::random_seed to challenge k random items which owner must reveal vs Merkle root (anti cherry-picking) while ~95% stays secret; contract issues certificate (model id + root + score + attestation hash); leaderboard; replay mode for judges; tamper test. Honest limit: grader runs at owner, so set is private from model vendor & public, not from owner. J9 T9 D8 F7 A9 N10 = 52.
2. BLINDSPOT (privacy, business, agents) — private code review in TEE: CLI/GitHub Action verifies attestation before sending diff, posts review + receipt anchored on NEAR; `verify` command recomputes hashes & recovers TEE signer. Risk: "API wrapper" feel. J8 T6 D8 F9 A10 N8 = 49.
3. VAULT HEIST (games, security, privacy) — Freysa-style prompt-injection game; guard system prompt hash committed on-chain; each reply TEE-signed; contract verifies sig before payout; prompt revealed after round so anyone re-verifies transcripts; any-chain entry via 1Click (dry for judges). A "BAG HEIST" entry exists. J7 T8 D10 F7 A8 N7 = 47.
4. UNWIND (realworld, agents) — refunds/disputes for stablecoin & agent payments: escrow window, merchant bonds, TEE AI arbiter verdict verified on-chain, consumer-biased default. x402 has no refund verb; Haseeb's chargeback argument. J8 T7 D8 F7 A8 N7 = 45.
5. SEALED SECOND OPINION (privacy, nfts, realworld) — encrypted labs to attested TEE, specialist prompt NFTs earn royalties. J7 T7 D8 F7 A8 N6 = 43.
6. BASIS BUTLER (defi) — delta-neutral via Intents + Hyperliquid; mainnet-only, real money. J8 T9 D6 F4 A5 N8 = 40.
7. ORACLE OF THE MEME (memecoins, games) — daily meme contest judged by TEE model; contract mints/burns only after verifying AI signature. J5 T7 D8 F8 A8 N6 = 42.
8. QUIET LEDGER (privacy, business) — private Granola; Aftercall exists. 36.
Grok's current top pick: SEALED BENCH.

## Your task (round 1)
1. Rank the 8 ideas (brief reason each).
2. Attack the top pick hard: crypto soundness (what does the TEE signature actually prove? can the owner fake/cherry-pick? does the challenge-reveal hold up? what about grader honesty and model identity?), demo wow factor, 2-day feasibility, appeal to Illia/Mert/Haseeb/a16z and to AI-judge screeners.
3. Propose sharper variants of the best ideas or one better idea (must fit the constraints: 2 days, 1 AI agent, testnet ok, no Shade Agents).
4. State your single final pick with: track(s), concrete MVP scope, 60-90s demo script, honest threat model in 3-5 bullets.
Keep it under ~900 words. Text only.

## Claude Code
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

## Codex
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
## Grok
Pick: Sealed Bench (see ../research/brief.md).

**Result: split.** Claude and Grok picked Sealed Bench; Codex picked Blindspot.
