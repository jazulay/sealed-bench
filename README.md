# Sealed Bench

Sealed Bench runs **sampled, on-chain spot checks** of private AI evaluations on NEAR.

**Pre-registered:** the hypothesis and analysis for the harder competition-math suites are in [PREREGISTRATION.md](PREREGISTRATION.md). It was pushed to GitHub at 4:54 PM CT on Nov 12, before any of those runs.

**Live site and audit explorer: https://sealed-bench.up.railway.app**. It reads the testnet contract in your browser over public RPC, with no keys and no backend.

**Demo video (X post, built at NEAR HACKATHON): https://x.com/josephstayhappy/status/2121062471309898192**. 84 seconds: commit, a non-owner draw, the reveal checked against NEAR AI TEE signatures, the explorer re-checking 20/20, the tamper lab, the AIME-style result and `npm run verify`.

**Problem.** Published benchmarks can end up in training data, so a high score may come from memorization. A private test set avoids that, and outsiders then have only the owner's number. Sealed Bench keeps the set private and spot-checks the score on-chain:

1. The owner commits a Merkle root of the sealed test set on NEAR.
2. The owner runs models through NEAR AI Cloud. The sealed questions are sent there: the models run in TEEs, and every response is signed by the model's TEE key.
3. The owner commits every run and its full grade vector. The contract computes the score from that vector.
4. After every run is committed, **anyone** can call the draw. NEAR randomness picks 20 items that must be revealed.
5. Starting in a later block, the owner reveals those items. For each one, the contract:
   - checks the Merkle proofs;
   - rebuilds the exact request bytes;
   - recovers the NEAR AI TEE signature;
   - re-grades the raw response.
6. The run ends **AUDITED** or **FAILED**. A run that is never committed becomes **Abandoned**. The status cannot be changed through any contract method, but the contract account can still be upgraded (see [Trust and limits](#trust-and-limits)).

AUDITED means 20 random entries matched TEE-signed responses and re-graded correctly. It is a spot check, not a proof that all 100 entries are honest.

The idea is from Illia's NEAR HACKATHON list: *"AI benchmarking with private test sets… certified for given model and given hash of test set."*

Tracks: `privacy` (primary) and `open`.

## Results (contract v2, real NEAR AI Cloud TEE runs, Thu Nov 12, 2026)

All 8 runs below are on contract v2 ([`sealedbench-v2-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-v2-hk26.testnet)). Each one is **AUDITED** with 20/20 sampled entries verified on-chain. Every draw was called by [`sealedbench-drawer-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-drawer-hk26.testnet). That account is not the suite owner, but the same operator controls it, so it shows the draw is permissionless; it is not an independent third party.

### Harder set: AIME-style competition math (integer answers)

| Model (NEAR AI Cloud, TEE) | Public originals (25) | Sealed variants (100) | Raw gap | Paired gap, 95% CI | Gap detected? |
| --- | --- | --- | --- | --- | --- |
| `Qwen/Qwen3.8-27B` | 18/25 (72%) | 83/100 (83%) | −11 pts | −11.0 [−29.0, +5.0] | no (sealed was *higher*) |
| `z-ai/glm-5.3-flash` | 22/25 (88%) | 77/100 (77%) | +11 pts | +11.0 [−5.0, +26.0] | no (CI includes 0) |

- **Outcome against the pre-registration:**
  - H1 predicted public > sealed by 10–30 points for each model.
  - GLM's point estimate (+11) falls inside that range, but its interval includes 0, so by our own rule no gap is detected.
  - Qwen went the other way.
  - The pre-registered verdict is **no detected gap for either model**. With 25 originals the intervals are wide, as we said they would be.
- **Truncation:** `max_tokens` is 4096, and a truncated answer (`finish_reason: length`) is graded wrong, as the contract requires.
  - Qwen: 3/25 public and 15/100 sealed answers were truncated.
  - GLM: 1/25 public and 18/100 sealed answers were truncated.
  - Most misses are truncations: 15 of Qwen's 17 sealed misses and 18 of GLM's 23.
  - Exploratory, not pre-registered: the gap partly measures how long each problem's working runs, not only memorization.
- **Where the misses are:**
  - Hardest for both models: `beautiful` (2024 II 14) failed on all 4 variants for both models.
  - Also hard: `perm22`, `p2n4`, `nines`, `oddprime` and `pow2diff`.
  - Per-problem differences d_j are printed by `npm run gap`.
- **How the sealed set was made:** each of the 25 public problems (AIME 1983–2025, from public HF mirrors) has a code template in [`cli/src/templates_aime.ts`](cli/src/templates_aime.ts).
  - The template perturbs the numbers and recomputes the answer in code.
  - `npm test` checks that every template reproduces the official answer on the original numbers, and brute-forces several families.
  - The answers are integers.
- **Change after pre-registration (disclosed):** while generating the suite, `base9` could not produce 4 distinct variants. We widened its base range from 5–12 to 5–20 and made `gen` redraw duplicate questions. Nothing else changed. Both changes came before inference.

### Control: GSM8K-style grade-school math

| Model | Public originals (25) | Sealed variants (100) | Raw gap | Paired gap, 95% CI |
| --- | --- | --- | --- | --- |
| `Qwen/Qwen3.8-27B` | 25/25 (100%) | 100/100 (100%) | 0 pts | 0.0 [0.0, 0.0] |
| `z-ai/glm-5.3-flash` | 24/25 (96%) | 100/100 (100%) | −4 pts | −4.0 [−12.0, 0.0] |

This is a ceiling result: GSM8K is easy for both models. The sealed set is fresh, because 20 items of the v1 sealed set were already revealed. GLM's one public miss is GSM8K test #37 (the "lego" problem), where it read "sell all his toys" literally and answered 0, as in v1. The v1 runs gave the same picture (Qwen 25/25 vs 100/100; GLM 25/25 vs 98/100); they are kept in [`fixtures/legacy-v1/`](fixtures/legacy-v1/) and are no longer cited.

### What the signatures and draws show

- **Signers:** every sampled response carries a `provider_tee` ECDSA signature. The contract recovered it with `env::ecrecover` and checked it against the signer set that was **snapshotted for that run at `start_run`**:
  - Qwen: `0x835ab53d20294ef795906dff21ae4c045336aa26`
  - GLM: `0x3b753b4406613c5e70ae640508632b600424fa0c`
- **What a signature proves:** NEAR AI's TEE gateway produced that response for that request. The model id is the gateway's claim. The signature does not prove which weights ran.
- **Cost:** about $0.50 of NEAR AI Cloud credit for the 500 v2 inference calls, computed from the token counts in the signed responses:
  - AIME: $0.44;
  - GSM: $0.06.
  - On top of that came about $0.06 for v1 and under $0.07 for the probe.

## Deployed (NEAR testnet)

| What | Id |
| --- | --- |
| Contract v2 | [`sealedbench-v2-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-v2-hk26.testnet), deployed and initialized in [6nsbAo6Q…](https://testnet.nearblocks.io/txns/6nsbAo6QUQcnrDSLWQr4QqNFtnH1CQ3P7GDzq6VWHrxV) |
| Wasm sha256 | `599d76f8409002222fe22912655aacb66671ab9a209e5a93a4a77ef60d48140f` ([`contract/release/sealed_bench_v2.wasm`](contract/release/)); `npm run verify` compares it with the on-chain `code_hash` |
| Admin (pins signers) | [`sealedbench-admin-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-admin-hk26.testnet) |
| Suite owner | [`sealedbench-owner-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-owner-hk26.testnet) |
| Drawer | [`sealedbench-drawer-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-drawer-hk26.testnet), same operator, not the owner |
| Pinned signer `Qwen/Qwen3.8-27B` | `0x835ab53d…aa26` ([pin tx](https://testnet.nearblocks.io/txns/2WKhYheZDzvrot5ChP1hBJ9EABPPCgYTjCeVfUuHj4RA)) |
| Pinned signer `z-ai/glm-5.3-flash` | `0x3b753b44…fa0c` ([pin tx](https://testnet.nearblocks.io/txns/HYbP8AeiW91b3mHSdXdw4cmxsuMdAH7a4YLBF9eYJoQY)) |
| DEV-ONLY mock signer | `0xa6c3a19d…fa3` ([pin tx](https://testnet.nearblocks.io/txns/AvbyiCSyPCD3rpPEg5Eq2ggwLgBf1gbZpfcQFD8PYh6m)) |
| v1 (retired) | [`sealedbench-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-hk26.testnet): left as it was; it has the P0 issues listed in [Changes in v2](#changes-in-v2) |

Every transaction:

| Suite | Commit | Qwen3.8-27B | GLM-5.3-flash | Draw (by `sealedbench-drawer-hk26.testnet`) |
| --- | --- | --- | --- | --- |
| `aime-sealed-v1`, 100 sealed AIME-style variants, secret seed | [commit_suite](https://testnet.nearblocks.io/txns/5EuGLqjpTHKhHGbk87tGQhGMvWgjZ2LnrmrtATY6v8t) | 83/100 AUDITED: [start](https://testnet.nearblocks.io/txns/6rvUuEGRxkSqECTLVxt4cSogRGXbaYrPhMWKkXB3tVPV) [commit](https://testnet.nearblocks.io/txns/DCDLc28LzUhZXdbnRxSomBSh9uGUdnG5pcqzgrYjHbTX) reveals [1](https://testnet.nearblocks.io/txns/4DzzaE1s8yXvLbMi5FvTsXwEPa5U7mqUagJEJQNHayTU) [2](https://testnet.nearblocks.io/txns/61qNj6SaEYH313pCZadzhnGyPXxPWJ9So5FicbAChNwe) [3](https://testnet.nearblocks.io/txns/4S8jQkkHUrEm9FAuYSNuoRVDbqmCVDoXXs9XsFWEpi8p) [4](https://testnet.nearblocks.io/txns/FEm2K4ZSo8xeUftBfsb8PFUtLTVjTtn8nEw8By5E2U9p) [5](https://testnet.nearblocks.io/txns/6txh5Y2waxg73grsnUQ6Sk1qRoah1ih8rdnUkcuDtx6n) | 77/100 AUDITED: [start](https://testnet.nearblocks.io/txns/7HrBWHi3FMdCfXYPsEZp4Dxnz8HWWn5jP7WfjSm7wxZX) [commit](https://testnet.nearblocks.io/txns/6psfg8eyzJdKJyzu4ddWbvu19E4xJdPLWfrTT46d7ZZf) reveals [1](https://testnet.nearblocks.io/txns/FD2Pkj6kepCv8Ai9MhNDDecyKK9UvDt2ztrfDGRTcHfZ) [2](https://testnet.nearblocks.io/txns/7VcoZXtwXSfMXZe95udZJAZFspmQJRpWf5sHBn89HhTo) [3](https://testnet.nearblocks.io/txns/8K24NVHPum5bwTHGXikFrruYvSLUteoDi21zW3CAvLKn) [4](https://testnet.nearblocks.io/txns/4FhDPbW7455bfpo7sk9buPC2ngCzvpB1RUqbbDHp5FR4) [5](https://testnet.nearblocks.io/txns/AZ6H5p9nP35TvTEFmaM3Uz1tXM1jcT2L2nkquMq56iyx) | [draw](https://testnet.nearblocks.io/txns/EGuRb6jaUGbSxsJKoQPsUJjaFdRPKWmfyJdSivibzid2) |
| `aime-public-v1`, 25 public AIME originals | [commit_suite](https://testnet.nearblocks.io/txns/mASF6Bm58scP8VtxULFegbV5jM57keuJYLyCYUbhrrf) | 18/25 AUDITED: [start](https://testnet.nearblocks.io/txns/DhvFmHb8NtPAZ9vEbdmPHwFyfUrx9tV1Xrt9dJa4vUh7) [commit](https://testnet.nearblocks.io/txns/E2a6vPhZihXwhLJvp5bFY11ogrGg2cC1jmh9fgxxY9Wn) reveals [1](https://testnet.nearblocks.io/txns/4FtkTR8CzeDAtFBhUCMTDSLeZhSGWjWonyPraXJhc5tk) [2](https://testnet.nearblocks.io/txns/AySJwmPAZM9hn7PHuVfXpAa5NkeqSBkhmt7NJs3NMh83) [3](https://testnet.nearblocks.io/txns/Wp7aTY6JhhFk9CCzqqu895SWTcfLmvJWDwNTT8E48Gn) [4](https://testnet.nearblocks.io/txns/3y25qYULccPUVMLbHfR6YpMPSzc5bYTM7sg4GjgRZ59s) [5](https://testnet.nearblocks.io/txns/AtEqtaALDDbf5gaTxb5fKPV2a1cSit2U4q76qf6qtc94) | 22/25 AUDITED: [start](https://testnet.nearblocks.io/txns/HvbvsGVwBsiokizK4fEKGGKMY2eUvW1oUYTY22QvDVbh) [commit](https://testnet.nearblocks.io/txns/2c1LDps8ueHZTqCv4JqLCUVRasBzvue9WEKdihEyFqiY) reveals [1](https://testnet.nearblocks.io/txns/2oybPotaxQAs4t7LKB6M61VZsqihBc7VLWDUHTkPAxVC) [2](https://testnet.nearblocks.io/txns/2MGpeVUNXcAreuKYN7rHfbsCR62Znhrktrhwty8RF2dq) [3](https://testnet.nearblocks.io/txns/J5U6h994XpBGi2bsFmo4JNDAV8Uk4DzTGXYsZphTdZMA) [4](https://testnet.nearblocks.io/txns/Dr6sDZUR14gM8Gx8bdHRQx6VAQadtbMZrTAuTJFK9WMC) [5](https://testnet.nearblocks.io/txns/B7kB8sBiyb4Lc6W5PEr2LqxmcXKMdkcGeUVfaz98EijM) | [draw](https://testnet.nearblocks.io/txns/2qyvJpJs4bGw7eYKrSuAmi8WBQwXuXem2yN7ovuQcLZg) |
| `gsm-sealed-v2`, 100 sealed GSM8K-style variants, fresh secret seed | [commit_suite](https://testnet.nearblocks.io/txns/2wczxcKQzKznmqo3hxtzCczR6cj72uVSKc9jMsGHM23p) | 100/100 AUDITED: [start](https://testnet.nearblocks.io/txns/41bVHQqfzAUUDPeeqTMTLbhPJX5DZZ45BEiPjeopUoXB) [commit](https://testnet.nearblocks.io/txns/Fta438roEgLP24FUCARmiHPe5iNGprrtqjJvYWBFjwCq) reveals [1](https://testnet.nearblocks.io/txns/BD4rxb9PBcEAAPqfSXqWpu1iB4z95AfxcjMY2pp15atJ) [2](https://testnet.nearblocks.io/txns/AJrTRgJYVsV4HEtANJRxwW7CaZ8ycvx2EQAmAB6ZscTL) [3](https://testnet.nearblocks.io/txns/41mAmJLv2r8eo8tDxCtWBS5iKUShx5e2qPFft3EV4My7) [4](https://testnet.nearblocks.io/txns/7f6HBMaUCJs1vYCFEHYyfKdwD5QFTiDhgDKFvFoqp21q) | 100/100 AUDITED: [start](https://testnet.nearblocks.io/txns/AudQxvhnreNSVhzX4YCwHcgaJEpdgvdnK6HL5Ya4hDuj) [commit](https://testnet.nearblocks.io/txns/8Pe19z1tvwge8vH1DB4eA9gspWi5esyWNQAeg4nDxSKC) reveals [1](https://testnet.nearblocks.io/txns/CsJgcAxkufnDCSK3uiL1ttqnVxN6RCLhrLsCx9CFjdV5) [2](https://testnet.nearblocks.io/txns/zL4JkwRoLkJx6BA2XLdkwkkRSSBD9PPc1zLXoaHy5Ww) [3](https://testnet.nearblocks.io/txns/AJzGCH44sX7zeurTQ6BGSzSVJAAL3H6VVycvCy3ENaZ5) [4](https://testnet.nearblocks.io/txns/3B1WD67Xemkibfv2Q9aKYavDaEFoftSTBZi6Q71kXhqY) | [draw](https://testnet.nearblocks.io/txns/D3X25uvJEaF8Gy9man9VA4UQxuBb6zjDW1samQUsRoLq) |
| `gsm-public-v2`, 25 public GSM8K originals | [commit_suite](https://testnet.nearblocks.io/txns/Ci5CnM82roMMzbyBpX1bLB8CTJmHL6j798VpKFgKEoyU) | 25/25 AUDITED: [start](https://testnet.nearblocks.io/txns/8e8ko7K3isagU19rGcvCe2HaSPMNcZ9JXoxGJ8QQY4mo) [commit](https://testnet.nearblocks.io/txns/6651rJVE5TytbSWqSTCVzWBmWpnCr77v1KKJZtGmJCov) reveals [1](https://testnet.nearblocks.io/txns/5iUyn7TQH4KdbMNZFHukDByn7bgfhGHLAH7Pd7AMjJWE) [2](https://testnet.nearblocks.io/txns/9V1LMzoZJfxmMXhzLad9Dy2SZ3neDGJMUS3vJEjbVSqE) [3](https://testnet.nearblocks.io/txns/doGFtgkvuDXkT8g68cSFGTN9bfSp9rdvo3KK2UVqe3K) [4](https://testnet.nearblocks.io/txns/CQnAR1cNox1ntK3Pq1i5Es4Ees92Jj4u6tMwvAgJ15cX) | 24/25 AUDITED: [start](https://testnet.nearblocks.io/txns/EYyN1NX3iLPs6Gw5Szq2WXQLxHGhwpn5vERKtNQp1Nf1) [commit](https://testnet.nearblocks.io/txns/12v39QXnmzERR4jvgK88PFpUJZYkbQxiNEeAJwykTkjH) reveals [1](https://testnet.nearblocks.io/txns/413mKFDAjRXM91xXty9sogk3es58b6ncQWuyqKsgc3Bz) [2](https://testnet.nearblocks.io/txns/9VtJFvKf4wfzVvbCLTHkH4zV345BAzmFTxKUx8rndD9j) [3](https://testnet.nearblocks.io/txns/GZukZUNLqhg1R9tyqJCXM2w5EPPpfY2GiERu9mp7oZK5) [4](https://testnet.nearblocks.io/txns/Gbza3ZuVZbivLfMf94uSTgDLsLjXpCJVbXNdvAD2Sm6J) | [draw](https://testnet.nearblocks.io/txns/CzBbktFkQdtk1f6tDp2N4NTj2yj1DnS5hSUf2GiRi1Ks) |
Every suite carried a 0.1 NEAR bond, which went back to the owner once all its runs were AUDITED. All tx ids are also in [`fixtures/lifecycle-v2.json`](fixtures/lifecycle-v2.json).

Protocol rehearsal with the DEV-ONLY mock signer on v2. Its key is public and it is not a TEE, so no claim cites these runs:

| Suite | Result | Commit | Draw (by the drawer account) | Reveal txs |
| --- | --- | --- | --- | --- |
| `demo-mock-sealed-v3`: honest mock run | 74/100 claimed, **AUDITED**, 20/20 verified | [commit_suite](https://testnet.nearblocks.io/txns/4evbJH4UTPnwkptD71zo1G3JKzgsgeL1ZtoNfUV2CcuC) [start](https://testnet.nearblocks.io/txns/2nkX43p4Y4tqpCaPpWUeB5SR1ffRCL7KKApdRixUjZFJ) [commit](https://testnet.nearblocks.io/txns/4UsitudCxyx7GsPhAJVc8cGvBCq1WHfUEcg8SvAj8kfC) | [draw](https://testnet.nearblocks.io/txns/8WD3m8UXojybguCwSDN39ALNQ6UvKTRyp5y5ptnSthcH) | [1](https://testnet.nearblocks.io/txns/GtSFJWdMtTFDxFoiLqfxk8uc5kLnweuXx3SR81q3BpwR) [2](https://testnet.nearblocks.io/txns/AfupYCFr6SMen39iu51BY8cfgGxsk3r88b42vTuK9wwN) [3](https://testnet.nearblocks.io/txns/2eP45pV5XVW3DouUFooQNqtGMdsdD6ptRQ8h1WmiNFde) [4](https://testnet.nearblocks.io/txns/C85eVhwjLEtnSAzyP1TtUGaF15Ee6SSrJVSHJ71fVTPc) |
| `demo-mock-cheat-v3`: the owner inflates grades to 100/100 | 100/100 claimed, **FAILED**, bond paid to the drawer | [commit_suite](https://testnet.nearblocks.io/txns/7c6axPZ2mKk4Vy2agW3LWZkpBQSFGKjbiJcauzZU7Gbr) [start](https://testnet.nearblocks.io/txns/D4yW4VaFxZJg3GkDLpQntnXnPfpjhBgnzLxx2DCRadAE) [commit](https://testnet.nearblocks.io/txns/CA6BzXY5KTFYd94ZxYmuxLMXs9tknAWeRtsB8xsvJW2n) | [draw](https://testnet.nearblocks.io/txns/6YiWUnCy53TCiWebSgfnRkDUX9akmsc4g5zLNKpCKphf) | [1](https://testnet.nearblocks.io/txns/2sPyDK2rRgJJquiw2GXmCfuKiBLWbshPonFnNSDpBsJG) |
The cheat run failed on its first revealed wrong item, and the contract stored `idx 14: re-grade mismatch: model answered 49, key 42, committed grade 1`. Its bond went to the account that called the draw.

## Try it: do X → see Y

Requirements:
- Node ≥ 22.18 (it runs the TypeScript directly).
- Network access to the NEAR testnet RPC.

You need no NEAR account, no wallet and no API key. Each step takes about 2 minutes or less.

1. **Install.** Run `git clone https://github.com/jazulay/sealed-bench && cd sealed-bench && npm ci`.

2. **Re-check the 8 real audits against the chain.** Run `npm run verify`.
   → You should see `"ok": true` and the following:
   - `mode` names the final block that every read was pinned to.
   - `deployed_code_matches_release_wasm: true`, which means the deployed `code_hash` equals the committed wasm's sha256.
   - 8 results. In each, every value in `checks` is `true`:
     - `fixture_matches_chain`
     - `onchain_status_audited`
     - `onchain_revealed_set_is_the_challenge`
     - `onchain_check_reveal_all_k` (all 20 items re-checked by the contract's own `check_reveal` view)
     - `drawn_by_non_owner`
     - `signer_pinned_with_repo_attestation`
     - `challenge_rederived_from_seed`
     - `revealed_exactly_the_challenge`
     - `all_k_replay_locally`

   The suite root, template, nonce, grade vector and signer set are read **from the chain**. The fixture supplies only the revealed bytes.
   - `npm run verify -- --offline` replays the files only and says so.
   - An empty or missing folder is an error.
   - A broken RPC client is an error. It does not silently fall back to offline mode.

3. **Try to cheat on a real TEE-signed entry.** Run `npm run tamper`. It uses `fixtures/real/reveal.aime-sealed-v1.Qwen_Qwen3.8-27B.json`.
   → `"ok": true` and the summary `13/13 lies rejected (8 by the live contract view, 2 offline what-if, 3 by contract rules with unit tests); honest reveal accepted; 3 known limits still succeed and are listed.` Each row says how it was tested:

   | Case | How it is tested | Result |
   | --- | --- | --- |
   | edit the response, add one space, change the answer key, swap the question, flip the grade, borrow another item's signature, reveal an undrawn index | the contract's `check_reveal` view, run live | rejected (Merkle proof) |
   | non-hex salt (P0-4) | live view | rejected: `salt must be 32-byte lowercase hex` |
   | self-sign with a consistent run root | offline what-if (the attacker would have to re-commit) | rejected: signer not pinned for this run |
   | stale nonce with a consistent run root | offline what-if | rejected: signer not pinned (the request bytes differ) |
   | draw and reveal in one transaction (P0-1), pin a signer after start (P0-2), late commit or duplicate root (P0-3) | contract rule, named unit test | rejected |
   | **inflate 2 of 100 grades** | math | **still passes 64% of the time** |
   | **best-of-N re-roll under one nonce** | protocol | **still accepted** |
   | **abandon a bad run and retry** | protocol | **possible, but public (Abandoned) and the bond is forfeited** |

   RPC errors are reported as `INCONCLUSIVE`, not as rejections.

4. **See a real on-chain FAILED.** Run `npm run verify -- --dir fixtures/demo-fail`.
   → It exits nonzero (this is expected) with `"ok": false`, `onchain.status: "Failed"` and the stored reason above.

5. **Recompute the gap from public chain data.** Run `npm run gap` (AIME) or `npm run gap:gsm`.
   → It shows the table above, computed only from the on-chain grade vectors. The sealed index is `variant × 25 + problem`.

6. **Open the live site.** Go to https://sealed-bench.up.railway.app. It reads `sealedbench-v2-hk26.testnet` over public RPC. The site source is in [`site/`](site/).

7. **Open the static results page.** Run `npm run web`, then open `web/index.html`. It is a static snapshot (`web/data.js`) built from the fixtures plus testnet views, with the pre-registered gap table first.

8. **Check NEAR AI's TEE signer (no key).** Run `node cli/src/cli.ts attest --model Qwen/Qwen3.8-27B`.
   → It prints `signing_address` and these checks:
   - `dcap_tcb_status: UpToDate` (any other status is refused unless you pass `--allow-status`);
   - `report_data_binds_signer_and_nonce: ok`;
   - `mrconfigid_matches_app_compose: ok`;
   - `rtmr3_replay: ok`.

   The fresh report goes to `/tmp/sealed-bench-attest/`, so your clone stays clean. To re-verify the exact report that was pinned, whose sha256 equals the on-chain `attestation_sha256`, run `node cli/src/cli.ts attest --model Qwen/Qwen3.8-27B --offline`.
   → `matches_a_pin: true`.

   DCAP collateral is still fetched from Intel/Phala.

9. **Contract unit tests.** Run `cd contract && cargo test`. This needs Rust 1.99 (pinned in `rust-toolchain.toml`, so rustup installs it on first use).
   → `test result: ok. 41 passed`. They include:
   - real NEAR AI signature vectors;
   - the shared parser table [`fixtures/parser-cases.json`](fixtures/parser-cases.json);
   - k256-signed lifecycle tests;
   - one regression test per P0 contract fix.

10. **CLI unit tests.** Run `npm test`.
    → `pass 9`. These cover:
    - the same parser table (so the JS and Rust graders agree);
    - EIP-191 and Merkle vectors;
    - the GSM templates;
    - the AIME templates (official answers on the originals, brute-force cross-checks).

11. **Build and deploy your own copy (optional, free).**
    1. Install `cargo-near` 0.23 (`cargo install cargo-near`) and `near-cli-rs` 0.31.
    2. `cd contract && cargo near build non-reproducible-wasm` writes `target/near/sealed_bench.wasm`. Docker was not available here, so this build is not reproducible. That is why the deployed binary's sha256 is published and checked against `code_hash`, rather than rebuilt.
    3. Create accounts with `near account create-account sponsor-by-faucet-service <you>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`.
    4. Deploy with init `new {"admin":"<admin>.testnet"}`.
    5. Run the following:
    ```sh
    export SB_CONTRACT=<you>.testnet SB_ADMIN=<admin>.testnet SB_OWNER=<owner>.testnet
    node cli/src/cli.ts pin-signer --mock
    node cli/src/cli.ts gen --suite my-suite                 # --set aime for the competition-math set
    node cli/src/cli.ts commit-suite --suite my-suite --delay 15
    node cli/src/cli.ts start-run --suite my-suite --mock
    node cli/src/cli.ts infer --suite my-suite --mock
    node cli/src/cli.ts commit-run --suite my-suite --mock     # add --cheat-inflate to see FAILED
    node cli/src/cli.ts draw --suite my-suite --as <any other account>
    node cli/src/cli.ts reveal --suite my-suite --mock
    ```

12. **Live inference (owner only; needs a NEAR AI Cloud key).** Run `NEARAI_API_KEY=… node cli/src/cli.ts infer --suite <s> --model Qwen/Qwen3.8-27B`. It:
    - checks every request against the contract's `build_request_for` view before spending anything;
    - posts the exact bytes (`x-no-aliasing: true`, `Accept-Encoding: identity`);
    - keeps the raw response bytes;
    - fetches `GET /v1/signature/<chat_id>?signing_algo=ecdsa`;
    - requires `signature_kind == provider_tee`.

    The key is read from the environment only.

## How it works

```
owner                         NEAR contract (sealedbench-v2-hk26.testnet)           anyone
-----                         -------------------------------------------           ------
gen 100 sealed items  ──►  commit_suite(root, n, k, template, delay, window, commit_window) + bond
                           (duplicate roots rejected; template must have temperature 0, stream false, no n/best_of/seed)
                           start_run(model) ──► nonce = sha256(random_seed‖…); signer set SNAPSHOTTED; commit deadline set
NEAR AI Cloud (TEE) ◄── request = template{MODEL, NONCE, QUESTION}   (the TEE sees the sealed question)
   signed: MODEL:sha256(req):sha256(resp)
commit_run(run_root, grades "0110…") ──► score computed on-chain
                           draw_challenge  ◄──────────────────────────────────── anyone, ≥ delay blocks after the
                           last commit; runs past their commit deadline become Abandoned; one k=20 sample per suite
reveal(items) — only in a LATER block than the draw ──► per item:
   salt is 32-byte hex; suite Merkle proof (idx, salt, answer, question)
   rebuild request bytes from template + question + nonce → sha256
   run Merkle proof (idx, req_hash, resp_hash, signature, grade); grade == grades[idx]
   env::ecrecover(EIP-191(MODEL:req:resp)) ∈ this run's signer snapshot
   choices[0].message.content (finish_reason must be "stop"), last "ANSWER: <integer>" == key ⇔ grade == 1
   any failure → FAILED;  all k pass → AUDITED
                           expire() ◄───────────────────────────────────────────── anyone, after a deadline
bond: all AUDITED → owner; otherwise → the drawer (else the expire caller); claim_bond retries a failed transfer
```

- **Grader (P0-5):**
  - The body is parsed as JSON, and only `choices[0].message.content` is read, never `reasoning_content`.
  - A truncated response (`finish_reason` other than `stop`) grades 0.
  - The last `ANSWER:` must be followed by an exact integer, optionally with `-`, `$`, `**` or 3-digit comma groups, and then only whitespace, `*`, `$` or `.`.
  - `4.9`, `4/5`, `4 or 9`, `1e3`, `04` and a missing marker all grade 0.
  - |answer| < 10^15 in both Rust and JS.
- **Leaves:**
  - Suite leaf: `sha256(0x00‖"sb-item-v1\n{idx}\n{salt}\n{answer}\n{question}")`. The salt is 64 hex characters, so the encoding is unambiguous.
  - Run leaf: `sha256(0x00‖"sb-run-v1\n{idx}\n{req_hash}\n{resp_hash}\n{sig}\n{grade}")`.
  - Interior nodes: `sha256(0x01‖l‖r)`.
- **Draw:** `sha256("sb-draw-v1"‖seed‖suite_id‖ctr_le64) mod n`, deduplicated and sorted. It can be re-derived from `draw_seed`.
- **Mirror:**
  - The contract code is in `contract/src/verify.rs` and `lib.rs`. The JS mirror is `cli/src/lib.ts`.
  - Both are tested against one shared case table.
  - `check_reveal` is a free view that runs every check without changing state.

## Detection math (what a spot check catches)

If an owner flips m wrong items to right in a 100-item run and 20 are sampled, the chance of being caught is 1 − C(100−m, 20)/C(100, 20):

| m | 1 | 2 | 5 | 10 |
| --- | --- | --- | --- | --- |
| caught | 20% | 36% | 68% | 90.5% |

So inflating 98 to 100 passes about 64% of the time. If 10 items are inflated, one audit passes 9.5% of the time. Ten fresh, re-salted suites give at least one pass 63% of the time. Duplicate roots are rejected, and `owner_record(owner)` lists every suite and every FAILED or Abandoned run, so that shopping is visible, though not prevented. On a 25-item public suite, sampling 20 catches a single flipped item 80% of the time.

## Trust and limits

- **What you trust:**
  - NEAR AI Cloud's TEE signing key per model, and NEAR AI's gateway for the model-id claim.
  - The admin (`sealedbench-admin-hk26.testnet`), who pins a signer after verifying its attestation off-chain. That means the DCAP status UpToDate, `report_data` binding the signer and nonce, MRCONFIGID equal to app_compose, and an RTMR3 replay.
  - The admin is the same operator as the owner. A pin added after a run starts doesn't count for that run, and pins can be revoked for future runs. The DCAP check is not done on-chain.
- **Upgrade authority:** the contract account still holds a full-access key (testnet), so the same operator could redeploy it.
  - "Permanent" status therefore means permanent unless the code is replaced.
  - `npm run verify` prints the live `code_hash` and fails if it differs from the published wasm sha256.
  - Deleting the key (locking the account) is the next step and has not been done yet.
- **What the inference provider sees:** NEAR AI sees the sealed questions, inside its TEE. The owner sees everything. The set is hidden from the public and the model vendors, not from the owner or the provider. The 20 sampled items of each suite are public after the reveal.
- **What AUDITED shows:**
  - The revealed items were fixed before the run.
  - Each revealed response was signed by the run's snapshotted TEE signer, for a request carrying this run's nonce.
  - The committed grade re-grades correctly.
  - The score is the sum of the committed vector.
- **What it doesn't show:**
  - **Unsampled entries.** See the table above.
  - **Re-rolls within a run.** The nonce only rules out responses made *before* `start_run`. The owner can still query several times under one nonce and keep the best response. Temperature 0 makes re-rolls mostly identical, but it does not forbid them. We commit to one attempt in PREREGISTRATION.md.
  - **Which weights ran.** The model id comes from the gateway.
  - **Benchmark quality.**
- **Bond:** 0.1 NEAR, nominal. If a run FAILS or is abandoned, the bond goes to whoever drew (or expired) the suite. It is not scaled by n.
- **Randomness:** block producers can slightly bias `random_seed`. Because reveal must come in a later block than the draw, the owner cannot re-roll the sample by reverting a draw.
- **Minimum windows:** the challenge delay is at least 1 block, and the reveal and commit windows are at least 10 blocks. These runs used a delay of 20 blocks, a reveal window of 7,200 and a commit window of 14,400.
- **The mock signer** is a DEV-ONLY public key (`mock/DEV-ONLY-not-a-TEE`). Its runs only rehearse the protocol.

## Changes in v2

After the v1 runs, two external reviewers (Claude Code and Codex, as read-only critics) wrote a merged fix list. v2 was deployed to a fresh account. Fixed, by review id:

- **P0-1:** reveal must be in a later block than the draw (no same-transaction draw+reveal re-roll).
- **P0-2:** signer set snapshotted per run at `start_run`; `revoke_signer`; signers shown in `get_audit`.
- **P0-3:**
  - a commit deadline, after which the run gets the public status `Abandoned`;
  - `expire` works before the draw;
  - duplicate suite roots are rejected.
- **P0-4:** the salt must be 32-byte hex, checked in Rust and JS.
- **P0-5:** the strict JSON-path integer grader described above, with a shared Rust/JS case table.
- **P0-6:** the template is capped at 4 KB and the note at 512 B; at most 8 models per suite.
- **P0-7 and P0-8:** this README:
  - who draws;
  - what the TEE sees;
  - re-rolls;
  - what a signature proves;
  - the detection math;
  - "about 2 min" per step;
  - the bond;
  - the upgrade authority;
  - the wasm hash;
  - the non-reproducible build.
- **P0-9:** `attest` writes to `/tmp` by default; `--offline` re-verifies the pinned report.
- **P0-10:** `verify` is fail-closed. It:
  - errors on empty input;
  - runs offline only on request;
  - checks all k items on-chain;
  - takes its context from the chain;
  - pins every read to one block;
  - checks the code hash.
- **P0-11:** `tamper` rows are labeled by how they were tested. It:
  - rebuilds `stale_nonce` with a consistent root;
  - reports RPC errors as inconclusive;
  - has rows for P0-1 and P0-4;
  - lists the attacks that still succeed.
- **P1, done:**
  - **P1-1:** the bond goes to the drawer or expire caller, and `claim_bond` retries.
  - **P1-2 (part):** `list_suites` is paginated.
  - **P1-3:** duplicate roots are rejected, and `owner_record` is added.
  - **P1-4:** the template policy.
  - **P1-5:** pre-registered harder set.
  - **P1-6:** draws come from a non-owner account.
  - **P1-7:** the same integer range in Rust and JS.
  - **P1-8:** `provider_tee` and DCAP UpToDate are required.
  - **P1-11:** build steps.
  - **P1-12:** `call()` throws on a failed transaction.
- **Not done:**
  - P1-2 storage charging;
  - P1-10 locking the contract (key deletion) and a reproducible build;
  - P1-5's deliberately contaminated control;
  - P2 items other than P2-3 (`draw` now requires `--as`).

## Sample data

- **AIME set:** [`data/public-aime-25.json`](data/public-aime-25.json) holds 25 problems from AIME 1983–2025, with each source listed. The texts come from public Hugging Face mirrors: `gneubig/aime-1983-2024`, `Maxwell-Jia/AIME_2024` and `opencompass/AIME2025`. We normalized whitespace and fixed one broken `\frac`.
- **GSM set:** [`data/public-gsm8k-25.json`](data/public-gsm8k-25.json) holds 25 problems from the GSM8K test split ([openai/grade-school-math](https://github.com/openai/grade-school-math), MIT).
- **Request templates:** public, and part of each suite commitment.
  - Both use temperature 0, `stream: false`, `enable_thinking: false`, and a system prompt asking for a final line `ANSWER: <integer>` that embeds the run nonce.
  - `max_tokens` is 4096 for AIME and 1024 for GSM.
  - GLM still emits a short `reasoning_content`, which the grader never reads.
- **Fixtures:**
  - [`fixtures/real/`](fixtures/real/): the 8 v2 reveals (`npm run verify`).
  - `fixtures/demo/` and `fixtures/demo-fail/`: the v2 mock rehearsal.
  - `fixtures/legacy-v1/`: the v1 runs, kept for the record.
  - `fixtures/attestation/`: the pinned NEAR AI reports.
  - `fixtures/spike/`: the byte-exact signature vectors.
  - `fixtures/parser-cases.json`: the shared grader table.
- **Secrets:** `runs/` holds the answer keys and salts and is gitignored.

## NEAR technology used

- **NEAR Protocol testnet:** one Rust smart contract.
- **near-sdk-rs 5.30:**
  - `env::random_seed` for the nonce and the draw;
  - `env::ecrecover` (needs the `unstable` feature);
  - `env::keccak256_array`;
  - `env::sha256_array`;
  - `Promise::transfer` with a callback for the bond;
  - `store::IterableMap` and `store::LookupMap`.
- **NEAR AI Cloud:**
  - TEE (Intel TDX + NVIDIA) inference, OpenAI-compatible;
  - response signatures (`/v1/signature`, ECDSA, EIP-191, `provider_tee`);
  - public attestation reports (`/v1/attestation/report`).
- **Tooling:**
  - cargo-near 0.23;
  - near-cli-rs 0.31;
  - near-api-js 7.5;
  - FastNEAR RPC;
  - NearBlocks.
- **Not used:** NEAR Intents, Chain Signatures and Shade Agents. The design does not need them.

## Libraries

| Area | Libraries |
| --- | --- |
| Rust | near-sdk 5.30 (MIT/Apache-2.0); dev-only: k256 0.13, sha3 0.10, sha2 0.10, hex 0.4 |
| Node | near-api-js 7.5.3, ethers 6.17 (EIP-191), @phala/dcap-qvl 0.7 (Intel DCAP) |
| Data | GSM8K test split (MIT); AIME problems (public competition problems, via the HF mirrors above) |

All code was written during the hackathon window.

## Repository layout

```
contract/        Rust contract (lib.rs state+methods, verify.rs pure checks, tests.rs 41 tests), release/ wasm + sha256
cli/src/         cli.ts (commands), lib.ts (JS mirror of verify.rs), nearai.ts (NEAR AI client + attestation),
                 near.ts (testnet calls), templates.ts (GSM), templates_aime.ts (AIME), replay.ts (verify/tamper/web), gap.ts
cli/test/        node:test unit tests
config/          testnet.json (contract + account ids, RPC, explorer, wasm sha256)
data/            25 public GSM8K and 25 public AIME originals
fixtures/        real/ demo/ demo-fail/ (v2 reveals), legacy-v1/, attestation/, spike/, parser-cases.json, lifecycle-v2.json
site/            live site (separate workstream; reads the contract live)
web/             static snapshot page (index.html + data.js)
docs/debate/     design decision and critique transcripts
```

## How this was built

Grok Bot wrote all the code. Claude Code and Codex were read-only critics in the design debate, the v1 review and the site copy review. They wrote no code, edited no files and sent no transactions. The transcripts are in [`docs/debate/`](docs/debate/).

## License

MIT, see [LICENSE](LICENSE).
