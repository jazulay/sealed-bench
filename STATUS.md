# STATUS (Sealed Bench changelog)

Times are in America/Chicago (CT). Grok Bot wrote all the code. Claude Code and Codex reviewed only: they wrote no
code, edited no files and touched no chain.

## 2026-11-11

- Contract v1, CLI, static page and README written. The contract was deployed to `sealedbench-hk26.testnet`.
- NEAR AI attestation verified with no key (DCAP UpToDate, report_data binding, MRCONFIGID = app_compose, RTMR3
  replay). The Qwen3.8-27B and GLM-5.3-flash TEE signers were pinned.
- DEV-ONLY mock rehearsal on testnet: two runs AUDITED and the inflated cheat run FAILED.
- Published https://github.com/jazulay/sealed-bench (MIT).

## 2026-11-12

- About 4:08 PM: the byte-exact NEAR AI signature spike passed for both models (vectors in `fixtures/spike/`).
- 4:12–4:21 PM: real GSM8K v1 runs, all AUDITED:
  - Qwen: 25/25 public, 100/100 sealed.
  - GLM: 25/25 public, 98/100 sealed.
  - About $0.06 of credit.
- 4:44 PM: the external review (`FIXES.md`) arrived. On-chain work stopped until the P0 fixes were in contract v2.
- v2 written. It covers P0-1 to P0-6 plus P1-1, 1-3, 1-4, 1-7, 1-8 and 1-12. Tests: 41 contract tests, 9 CLI tests.
- v2 deployed to a fresh account, `sealedbench-v2-hk26.testnet`. Wasm sha256 `599d76f8…140f`. The admin is
  `sealedbench-admin-hk26.testnet`. Signers re-pinned from fresh UpToDate attestations.
- 4:54 PM: PREREGISTRATION.md pushed, before any AIME inference:
  - H1: public > sealed by 10–30 points.
  - Paired bootstrap; a gap counts as detected only if the CI lower bound is above 0.
- After pre-registration:
  - `base9` could not produce 4 distinct variants, so its base range was widened to 5–20.
  - `gen` now redraws duplicate questions.
  - Both changes came before inference.
- 4:55–5:20 PM: every published run redone on v2 through the full protocol. All draws were called by
  `sealedbench-drawer-hk26.testnet`, a non-owner account run by the same operator. Results:
  - aime-public-v1 / aime-sealed-v1:
    - Qwen 18/25 vs 83/100, gap −11 [−29, +5].
    - GLM 22/25 vs 77/100, gap +11 [−5, +26].
    - No detected gap for either model (pre-registered rule).
    - Truncations at 4096 tokens are graded wrong: Qwen 3 public, 15 sealed; GLM 1 public, 18 sealed.
  - gsm-public-v2 / gsm-sealed-v2:
    - Qwen 25/25 vs 100/100.
    - GLM 24/25 vs 100/100.
    - A ceiling result.
  - Mock rehearsal on v2: `demo-mock-sealed-v3` AUDITED. `demo-mock-cheat-v3` FAILED, with the bond paid to the drawer.
  - Credits: about $0.50 for v2 (AIME $0.44, GSM $0.06). About $0.62 in total, including v1 and the probe.
- `verify` and `tamper` rewritten to be fail-closed (P0-10, P0-11). `attest` no longer writes into fixtures (P0-9).
  README honesty pass done (P0-7, P0-8).
- The site config now points at the v2 contract.
- Payout account for the submission: **yossiazulay.near** (mainnet), chosen by Yossi.

## Open

- P1-10: lock the contract by deleting its full-access key, and make a reproducible build. Docker is not available
  here.
- P1-2: storage charging.
- Optional: a deliberately contaminated control.
- Demo video and X post draft. Yossi posts and submits.
