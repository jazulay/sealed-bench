# STATUS (Sealed Bench build log)
Times in America/Chicago (CT).

- 2026-11-11 2:10 PM CT: Started the build on the box. Installed toolchain: rustup 1.86.0 + wasm32, cargo-near 0.23, near-cli-rs 0.31.1. `gh` is NOT authenticated (GitHub blocker).
- NEAR AI signature format researched from docs.near.ai: ECDSA EIP-191 personal_sign over `MODEL:sha256(req):sha256(resp)`, a 65-byte r||s||v signature, and a 20-byte eth address. The model attestation report is public (no key needed). Qwen3.8-27B signer was 0x835ab53d20294ef795906dff21ae4c045336aa26 as of 2:12 PM CT.
- 2:14 PM CT: Contract written (contract/src/lib.rs, verify.rs, tests.rs). `cargo test`: 27/27 pass, including an ethers-generated EIP-191 vector and k256-signed full-lifecycle tests. Needed Rust 1.99.1 (near-sdk 5.30 requires >=1.95; pinned in rust-toolchain.toml) and the near-sdk `unstable` feature for env::ecrecover. Wasm built: 223.8 KB.
- Testnet accounts created via faucet sponsorship: sealedbench-hk26.testnet (contract + admin), sealedbench-owner-hk26.testnet (suite owner). Keys are in ~/.near-credentials on the box, not in the repo.
- 2:16 PM CT: Contract deployed to testnet `sealedbench-hk26.testnet` and initialized with admin = itself. Redeployed at 2:24 PM CT with a cosmetic fail-message fix (tx WvBeytTEXaD5ryffnZq47nkB92PhwcLaNbi19JpZrmL); state preserved.
- 2:18 PM CT: NEAR AI attestation verified with no key, using @phala/dcap-qvl: TCB UpToDate, report_data binds signer and nonce, MRCONFIGID matches app_compose, RTMR3 replay ok. Qwen3.8-27B signer 0x835ab53d…aa26 and GLM-5.3-flash signer 0x3b753b44…fa0c pinned on-chain with the report sha256. Raw reports are in fixtures/attestation/.
- 2:21 PM CT: Ran the DEV-ONLY mock rehearsal on testnet:
  - demo-mock-sealed-v1: 77/100, AUDITED.
  - demo-mock-public-v1: 24/25, AUDITED.
  - demo-mock-cheat-v2: inflated to 100/100, FAILED on re-grade.
  - The draw was called by a non-owner account. Reveal gas is about 7.9 Tgas per 5 items.
  - (demo-mock-cheat-v1 happened to have no wrong answers, so it AUDITED honestly; it's left on chain.)
- 2:24 PM CT: Added CLI (gen, attest, pin-signer, commit-suite, start-run, infer, commit-run, draw, reveal, status, verify, tamper, export-web), static page web/index.html, README, LICENSE, docs/debate. `npm run verify` passes, `npm run tamper` rejects 9/9 lies, and `npm test` passes 6/6.
- GitHub: the box gh is not logged in, so the Mac mini relays pushes (scripts/push-via-mac.md).
- 2:50 PM CT: Published https://github.com/jazulay/sealed-bench (public, MIT detected, topics near/nearhackathon/tee/ai-benchmark). Author: Joseph Azulay <35465299+jazulay@users.noreply.github.com>. gitleaks: no leaks (public attestation reports allowlisted).

- 2026-11-12, about 4:00 PM CT: Received the NEAR AI Cloud key ($10 NEAR Builders credits, claimed on yossiazulay.near). It is loaded from a mode-600 file on the box into env only, and is never committed or logged.
- 4:08 PM CT: Byte-exact spike passed for both models.
  - What matched: our `MODEL:sha256(req):sha256(resp)` equals NEAR AI's signed text exactly, and `signature_kind` is provider_tee.
  - Recovered signers: ecrecover gives exactly the pinned signers, Qwen 0x835ab53d…aa26 and GLM 0x3b753b44…fa0c, so no re-pin was needed.
  - Vectors are saved in fixtures/spike/ and replayed by 2 new contract tests.
- Finding: the responses carry `reasoning_content` after `content`, and that reasoning text repeats "ANSWER: <integer>".
  - GLM-5.3-flash cannot turn reasoning off.
  - Fix: the contract and CLI now grade only the raw `"content":"…"` JSON string value. If there is no content field and a reasoning field is present, the response fails closed.
  - The contract was redeployed with state preserved (tx FdqHexir9UEPwFpsuXQE2bryfJAWmzYDwnAHUBbVdsZo). Contract tests: 30/30; CLI tests: 7/7.
- Template tuned: `enable_thinking: false`, `max_tokens: 1024`, temperature 0, and an "end with ANSWER: <integer>" system prompt. All 250 responses finished with `stop` and had an ANSWER line in content.
- 4:12 to 4:21 PM CT: Real runs on testnet:
  - gsm-sealed-v1 (100 variants, secret seed): Qwen3.8-27B 100/100 AUDITED; GLM-5.3-flash 98/100 AUDITED.
  - gsm-public-v1 (25 originals): Qwen 25/25 AUDITED; GLM 25/25 AUDITED.
  - In both suites, 20/20 sampled entries were verified on-chain, and the draw was called by a non-owner.
  - Gap: Qwen 0.0 pts, GLM 2.0 pts. That is a ceiling result. GLM's 2 misses are lego-template literal readings, and neither was in the sample.
  - Credits used: about $0.06 of $10, estimated from usage tokens.
- 4:24 PM CT: `npm run verify` now defaults to fixtures/real (the mock rehearsal moved to `npm run verify:demo`). Tamper runs on the real sealed Qwen fixture and rejects 9/9 lies. README and page now show the real numbers.
- Payout / nearAddress for the submission: **yossiazulay.near** (mainnet).

## Next (to Fri Nov 13 noon CT)
- Demo video script and an X post draft (Yossi posts).
- Final critique pass (Claude/Codex review only), then Yossi submits with nearAddress yossiazulay.near.
