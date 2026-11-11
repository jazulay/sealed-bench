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
