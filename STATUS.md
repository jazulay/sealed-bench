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
- GitHub: `gh auth status` says not logged in, so the repo isn't created or pushed. Local commits only.

## Blocked on the NEAR AI key (NEARAI_API_KEY via secret card)
1. Byte-exact spike: one real completion, then signature, then on-chain `check_reveal` passes. Confirm the Builders key supports /v1/signature with provider_tee.
2. Tune the request template: thinking off (Qwen3/GLM param), max_tokens, and make sure the last "ANSWER:" in the raw bytes is the content's answer, not reasoning text.
3. Real suites: gsm-sealed-v1 (100, random secret seed) and gsm-public-v1 (25). Run Qwen3.8-27B and GLM-5.3-flash, about 250 calls. Then commit, draw, reveal, and write fixtures/real/ plus the gap table.

## Next (to Fri Nov 13 noon CT)
- Thu AM: spike, then real runs once the key arrives. Point `npm run verify` default at fixtures/real/ and keep demo/ as the rehearsal.
- Thu PM: README numbers from the real runs, page refresh, demo video script, and an X post draft (Yossi posts).
- Thu night/Fri AM: GitHub repo (needs gh auth), final review, then Yossi submits.
