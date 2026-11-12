# Sealed Bench

Sealed Bench runs sampled on-chain audits for private AI evaluations on NEAR.

**Problem.** Public benchmarks leak into training data, so a high score on one can mean the model memorized it. A private test set avoids the leak, but then nobody can check the score. Sealed Bench lets an owner keep the test set private and still have the score audited publicly:

1. The owner commits the sealed test set on NEAR.
2. The owner runs models through NEAR AI Cloud. Those models run in TEEs, and every response is signed.
3. The owner commits every run together with its full grade vector. The contract computes the score from that vector.
4. NEAR randomness then picks 20 items that must be revealed.
5. For each revealed item the contract checks the Merkle proofs, rebuilds the exact request bytes, recovers the NEAR AI TEE signature, and re-grades the raw response.
6. The run ends **AUDITED** or **FAILED**, and the status is permanent.

This idea comes from Illia's NEAR HACKATHON list: *"AI benchmarking with private test sets… certified for given model and given hash of test set."*

Tracks: `privacy` (primary) and `open`.

## Results (real NEAR AI Cloud TEE runs, Thu Nov 12, 2026)

| Model (NEAR AI Cloud, TEE) | Public originals (25) | Sealed variants (100) | Gap | Audit, both suites |
| --- | --- | --- | --- | --- |
| `Qwen/Qwen3.8-27B` | 25/25 (100%) | 100/100 (100%) | 0.0 pts | **AUDITED**, 20/20 sampled entries verified |
| `z-ai/glm-5.3-flash` | 25/25 (100%) | 98/100 (98%) | 2.0 pts | **AUDITED**, 20/20 sampled entries verified |

- **What this shows:** no meaningful public-to-sealed variant gap for these two models. GSM8K is easy for both, so this is a ceiling result. We fixed the suites and the reporting rule before running, and we publish the result as it came out.
- **GLM's two misses:** both are variants of GSM8K #37 (the "lego" problem). GLM read "sell all his toys" literally and answered 0. Neither miss was in the 20-item sample.
- **Sample:** a single sample of 20 items is shared by both models, drawn by a non-owner account from NEAR `random_seed` after both runs were committed.
- **Signatures:** every sampled response carries a `provider_tee` ECDSA signature from NEAR AI's attested model signer, and the contract recovered it on-chain with `env::ecrecover`:
  - Qwen: `0x835ab53d…aa26`
  - GLM: `0x3b753b44…fa0c`
- **Cost:** about 250 inference calls, roughly $0.06 of NEAR AI Cloud credit (computed from the token counts in the signed responses).

**Byte-exact check (Nov 12):**
- For both models, `sha256(request bytes)` and `sha256(response bytes)` computed locally equal what NEAR AI signed (`MODEL:req:resp`).
- `ecrecover` returns exactly the pinned signers.
- The recorded vectors live in `fixtures/spike/` and are replayed by two contract unit tests.

The DEV-ONLY mock rehearsal suites from Nov 11 are kept further down. They use a publicly known key, are labeled `mock/DEV-ONLY-not-a-TEE`, and no claim cites them.

## Deployed (NEAR testnet)

| What | Id |
| --- | --- |
| Contract (also admin) | [`sealedbench-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-hk26.testnet) |
| Suite owner | [`sealedbench-owner-hk26.testnet`](https://testnet.nearblocks.io/address/sealedbench-owner-hk26.testnet) |
| Pinned signer `Qwen/Qwen3.8-27B` | `0x835ab53d20294ef795906dff21ae4c045336aa26` ([pin tx](https://testnet.nearblocks.io/txns/ArAfm58NWkrdjWPXvfBJ2PqWKGnucpsVcGKVPoaavN72)) |
| Pinned signer `z-ai/glm-5.3-flash` | `0x3b753b4406613c5e70ae640508632b600424fa0c` ([pin tx](https://testnet.nearblocks.io/txns/BGQ1Yy99GdxQbN3A5cbVirmoHKUoYCL685hb4ikk473S)) |
| DEV-ONLY mock signer | `0xa6c3a19d7bdf8743396362411554a92f74fe9fa3` ([pin tx](https://testnet.nearblocks.io/txns/F1AidK6P6qZaCsfK1AYtxbKgpj1fzJLXn51nVB8XX7go)) |

Real suites on testnet:

| Suite | Commit | Qwen3.8-27B | GLM-5.3-flash | Draw (non-owner) |
| --- | --- | --- | --- | --- |
| `gsm-sealed-v1`, 100 sealed variants, secret seed | [commit_suite](https://testnet.nearblocks.io/txns/3sLmbCT7k1oezuHvdx4CYtEWpWn5GJQM3ENBWs6EDqtC) | 100/100 AUDITED: [start](https://testnet.nearblocks.io/txns/5viv97ALBkSuUakjLdreo1aPTehnSQrmbRkKbUjhew2V) [commit](https://testnet.nearblocks.io/txns/DuYm5atLYBoffE7GPsNCxwrkD2s93tTXjh5Wgvd2GgNM) reveals [1](https://testnet.nearblocks.io/txns/J1jxeUVrhidgSRoCBjitTCyTy2upWmzaXwSLL9YwFiYP) [2](https://testnet.nearblocks.io/txns/FhuixR1dJaVxuchAvX6kW7LysBhEsHvtdhbBNLTtjQi1) [3](https://testnet.nearblocks.io/txns/EP4Rh15TCpHsuCQgtwG2L78TuYjaCvyCmQFmGV6eVUR2) [4](https://testnet.nearblocks.io/txns/AYp7CK5tWohrWNddcQrDTmGx79RTrP1EPK1PLvA5QKcq) | 98/100 AUDITED: [start](https://testnet.nearblocks.io/txns/Hmtcw4Fj9tezeLPd99AcXzZALPEGnwXBytC2hGz7Qnp2) [commit](https://testnet.nearblocks.io/txns/2kryJioRm1a5xMCjKf7NW2QYZd5tsdQTsC8en4pUEnQc) reveals [1](https://testnet.nearblocks.io/txns/3hWob8VRaf5H7SwtKmUxRUkQLcYdwKxYx8Rm2uETbeej) [2](https://testnet.nearblocks.io/txns/9SBYN8p5EfJQQHGv8fqsUAkJHWqbHkCzeNS1CMv5eKna) [3](https://testnet.nearblocks.io/txns/DnXsM6E54kVXLn6KDZNWaW7B2hRki1WuXtWgZeHV1P5Z) [4](https://testnet.nearblocks.io/txns/FQh7WrAqb5Ey6tLwbiXpVMeUHK8UKpbPS2JddBE3ZDfC) | [draw](https://testnet.nearblocks.io/txns/7E16QVernNhChGY1vDPJByCHjUYhWJPGnMqTZtx5E1nx) |
| `gsm-public-v1`, 25 GSM8K originals | [commit_suite](https://testnet.nearblocks.io/txns/BK1isLNNJCJekjkcctcCTBKQCGtt68E48KnSCfBwDSQC) | 25/25 AUDITED: [start](https://testnet.nearblocks.io/txns/CLwwsUvXkFKJhN7Cz3WnHA8ihuXWZGRjHMWFGSi8EhFU) [commit](https://testnet.nearblocks.io/txns/FFsNvhKaXqT7DoFWHP2BQu9QNqCrL5Cg4tCxQ7E96fGo) reveals [1](https://testnet.nearblocks.io/txns/2D4MZDNcgzWdySCtdm1JrM1QikmwYca8xtJwTb5bLqao) [2](https://testnet.nearblocks.io/txns/4QRJRf75DtFkyUwKLuhBY9NLqsH52rziuZdyLbZnMHg9) [3](https://testnet.nearblocks.io/txns/4ZryBqHYqx1WGZr6UeUWudnK5Sx9HzpDX3F3R19aqAyz) [4](https://testnet.nearblocks.io/txns/FZ6ejKbMRLD43afLoBTgq9sPp1ZLFobwxrZLUrfNgtze) | 25/25 AUDITED: [start](https://testnet.nearblocks.io/txns/8CC1kz9MnoDqWjU2AfotjcwtMzy4dXvDBWkNYcgCHh5K) [commit](https://testnet.nearblocks.io/txns/DNbSLgKGFpDLJ6N62HPfpCrgCxfXQawazz8gN2xsRDxk) reveals [1](https://testnet.nearblocks.io/txns/2Nzqua9aCzTNFoezNbHZMVoWPxs4kPxwpLZRJbFJxs58) [2](https://testnet.nearblocks.io/txns/CmiVzREEVcNze4BxCN4ziCBsxnwQWMw1uUT1Ksn3y9s7) [3](https://testnet.nearblocks.io/txns/HLssYAvgtx9YoAgAjrYLHvTFEFdqXxEywhQpFQUbpG4e) [4](https://testnet.nearblocks.io/txns/VnD6AY9RUa5wsxFJVMuBBFRDmem5A7uzThSzHuWT3Nd) | [draw](https://testnet.nearblocks.io/txns/5eAkJpHFnU4YJfFTXmisgHsxE6Q85yLAUssVoFYz8PRA) |

Both suites returned their bond once every run was AUDITED. The current contract code was deployed in tx [FdqHexir…](https://testnet.nearblocks.io/txns/FdqHexir9UEPwFpsuXQE2bryfJAWmzYDwnAHUBbVdsZo); that version adds content-only grading, and earlier state was kept.

Rehearsal suites on testnet (all mock, Nov 11):

| Suite | Result | Challenge draw | Reveal txs |
| --- | --- | --- | --- |
| `demo-mock-sealed-v1`, 100 sealed variants | 77/100, AUDITED, 20/20 verified | [draw](https://testnet.nearblocks.io/txns/4JBDqxxztMWd8oh3YxZ7K2gJgfEC83xL4LKUjUKaKs6e) (called by a non-owner) | [1](https://testnet.nearblocks.io/txns/9xjVEqm9rcfUQDobmHtCcGghFEPUczGg6Pi8acCL6WR6) [2](https://testnet.nearblocks.io/txns/CgP1C1gxxpmX6pTZMfCRNtFdmnCRJSBkKJJeLujcbEPa) [3](https://testnet.nearblocks.io/txns/83v9ggmxVYEFm5kumjhG31AQeR6kPvrgHtHA3JK4H7BF) [4](https://testnet.nearblocks.io/txns/6CgA72iWtAtSKYXDvTveEyQD3egXRQNJcySG4nHLi17o) |
| `demo-mock-public-v1`, 25 GSM8K originals | 24/25, AUDITED, 20/20 verified | [draw](https://testnet.nearblocks.io/txns/2u6c8txuRbEHZaTRVv3jQrzmYCgrqTcWjkbVd7ZFvFEW) | [1](https://testnet.nearblocks.io/txns/8AxyzZMWxQwPVU99kxHTNviBLeNTGe76Ue7fhzXB8VzP) [2](https://testnet.nearblocks.io/txns/4DbV7GZaUtwpXXc2gParjWQEZ3wN75ywT3djQ1DiSM2G) [3](https://testnet.nearblocks.io/txns/P6ZsupE1e62BJsSGetUE87Sptr3U6GLvS1dKtohPhMM) [4](https://testnet.nearblocks.io/txns/5EUFMqoq4nrApRsZ9FZudvfSbQESytqV9syRpdDVjwaf) |
| `demo-mock-cheat-v2`: the owner inflates grades to 100/100 | **FAILED** on the first wrong item | [draw](https://testnet.nearblocks.io/txns/2Ddwwjxk8HLSDXjfrpeBLP2Jbc6QJNP8sFEuaFj74QEf) | [reveal → FAILED](https://testnet.nearblocks.io/txns/HDJGCXKGsc6f6wfhRbEpe8hBKrtCRihihZtqBKzvTtmF) |

Gas: a reveal batch of 5 items burns about 8 to 9 Tgas, measured at 8.7 Tgas for 5 real Qwen responses.

## Try it: do X → see Y

Requirements: Node ≥ 22.18 (it runs the TypeScript directly) and network access to the NEAR testnet RPC. You need no NEAR account, no wallet, and no API key.

1. **Install.** Run `git clone https://github.com/jazulay/sealed-bench && cd sealed-bench && npm ci`.
   → You should see `added N packages` and no errors.

2. **Replay the real audits.** Run `npm run verify`.
   → You should see JSON with `"ok": true`, `"mode": "offline replay + on-chain views (testnet RPC, no key)"`, and 4 results: `gsm-sealed-v1` and `gsm-public-v1`, each for `Qwen/Qwen3.8-27B` and `z-ai/glm-5.3-flash`.

   In each result, every value in `checks` is `true`:
   - `challenge_rederived_from_chain_seed`
   - `all_challenged_revealed`
   - `all_reveals_pass_offline`
   - `onchain_suite_root_matches`
   - `onchain_challenge_matches`
   - `onchain_run_root_and_grades_match`
   - `onchain_signers_match`
   - `onchain_check_reveal_view_ok`

   You should also see `"onchain_status": "Audited"` and `"signers": ["0x835ab53d20294ef795906dff21ae4c045336aa26"]` for Qwen (`0x3b753b4406613c5e70ae640508632b600424fa0c` for GLM). The claims read:
   - `"Owner-reported score 100/100; 20/20 sampled entries verified."` (Qwen, sealed)
   - `"Owner-reported score 98/100; 20/20 sampled entries verified."` (GLM, sealed)

   To replay with no network at all, run `npm run verify -- --offline`, which reports `"mode": "offline replay only"`.
   The mock rehearsal replays with `npm run verify:demo`.

3. **Try to cheat on a real TEE-signed entry.** Run `npm run tamper`. It uses `fixtures/real/reveal.gsm-sealed-v1.Qwen_Qwen3.8-27B.json`, item 0.
   → You should see 10 cases. `honest` is `accepted` both offline and by the contract's `check_reveal` view. The other nine are all `rejected`, each with the contract's own reason:

   | Case | Rejected because |
   | --- | --- |
   | edit the response | `run Merkle proof does not match…` |
   | flip one byte | `run Merkle proof does not match…` |
   | change the answer key | `suite Merkle proof does not match committed root` |
   | swap the question | `suite Merkle proof does not match committed root` |
   | flip the grade | `run Merkle proof does not match…` |
   | borrow another item's NEAR AI signature | `run Merkle proof does not match…` |
   | self-sign with a consistent run root | `signature not from a pinned signer for Qwen/Qwen3.8-27B` |
   | stale nonce | `run Merkle proof does not match…` |
   | reveal an index that wasn't drawn | `index not in challenge set` |

   The last line is `"summary": "9/9 lies rejected; honest reveal accepted=true"`.

4. **See a real on-chain FAILED.** Run `npm run verify -- --dir fixtures/demo-fail`.
   → You should see `"ok": false`, `"all_reveals_pass_offline": false`, and `"onchain_status": "Failed"`. The owner claimed 100/100, and the contract stored `re-grade mismatch: model answered … key 24, committed grade 1` permanently.

5. **Open the results page.** Open `web/index.html` in a browser (it is static, with no server); run `npm run web` first to refresh `web/data.js` from fixtures and chain.
   → You should see:
   - the public-to-sealed gap table (Qwen 100.0% vs 100.0%; GLM 100.0% vs 98.0%);
   - two real suite cards with four AUDITED runs, each listing its revealed items with the recovered NEAR AI signer and an explorer link for every reveal transaction;
   - a separate "Protocol rehearsal (DEV-ONLY mock signer)" section with the three mock suites, including the FAILED cheat.

6. **Check that NEAR AI's TEE signer is genuine (no key).** Run `node cli/src/cli.ts attest --model Qwen/Qwen3.8-27B`.
   → You should see `"signing_address": "0x835ab53d…aa26"` and these checks:
   - `"dcap_tcb_status": "UpToDate"`
   - `report_data_binds_signer_and_nonce: ok`
   - `mrconfigid_matches_app_compose: ok`
   - `rtmr3_replay: ok`

   The report bytes are saved to `fixtures/attestation/`; that file's sha256 is the `attestation_sha256` pinned on-chain, which you can confirm with `near contract call-function as-read-only sealedbench-hk26.testnet get_signers json-args '{"model":"Qwen/Qwen3.8-27B"}' network-config testnet now`.
   The signer address can change if NEAR AI rotates keys, and the pinned snapshot is in `fixtures/attestation/*.report.raw.json`.

7. **Regenerate the demo suite from its published seed.** Run `node cli/src/cli.ts gen --suite demo-mock-sealed-v1 --seed 6ab8130a44e0c527100a75bf383df99d9282f6f5518f9556a9dc528646ee8a18 --dir /tmp/sb`, using the seed from [`fixtures/demo/SEED.md`](fixtures/demo/SEED.md).
   → You should see `"root": "2445da5762846ec77ba1c90c4c310ef18bb81e4756f227299dbb1fa032e9dfcb"`, which is the same root as `get_suite` on-chain. Real sealed suites use a random secret seed instead.

8. **Run the contract unit tests.** Run `cd contract && cargo test`; it needs Rust 1.99, pinned in `rust-toolchain.toml`.
   → You should see `test result: ok. 30 passed`. The tests include:
   - an ethers.js-generated EIP-191 vector recovered with `env::ecrecover`;
   - **two real NEAR AI Cloud signature vectors** (`fixtures/spike/`) recovered to the pinned Qwen and GLM signers;
   - content-only answer extraction;
   - k256-signed lifecycle tests: honest → AUDITED with the bond returned, tampered response, question, or answer → FAILED, a wrong signer, inflated grades, a stale nonce, a draw that comes too early, an uncommitted run, a deadline timeout, and `expire`.

9. **Run the CLI unit tests.** Run `npm test`.
   → You should see `pass 7`. These check that the JS mirror of the contract matches: the same EIP-191 vector, Merkle proofs for odd sizes, answer extraction (including content-only grading), and all 25 templates yielding positive integer answers over 200 seeds.

10. **Rehearse the whole protocol on your own testnet accounts (optional, free).**
    1. Create two accounts with the faucet: `near account create-account sponsor-by-faucet-service <you>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`.
    2. Deploy `contract/target/near/sealed_bench.wasm` with `new {"admin":"<you>.testnet"}`.
    3. Run the following:
    ```sh
    export SB_CONTRACT=<you>.testnet SB_ADMIN=<you>.testnet SB_OWNER=<owner>.testnet
    node cli/src/cli.ts pin-signer --mock
    node cli/src/cli.ts gen --suite my-suite
    node cli/src/cli.ts commit-suite --suite my-suite --k 20 --delay 15
    node cli/src/cli.ts start-run --suite my-suite --mock
    node cli/src/cli.ts infer --suite my-suite --mock
    node cli/src/cli.ts commit-run --suite my-suite --mock
    node cli/src/cli.ts draw --suite my-suite          # anyone, after 15 blocks
    node cli/src/cli.ts reveal --suite my-suite --mock
    node cli/src/cli.ts status --suite my-suite
    ```
    → Every command prints a JSON object with `tx` and `explorer` links. `status` shows `"status": "Audited"`. Add `--cheat-inflate` to `commit-run` and `reveal` returns `"status": "Failed"`.

11. **Live inference (requires a NEAR AI Cloud key, owner only).** Run `NEARAI_API_KEY=… node cli/src/cli.ts infer --suite <s> --model Qwen/Qwen3.8-27B --concurrency 5`, which is how the real runs were made. It:
    - checks the request bytes against the contract's `build_request_for` view before spending anything;
    - posts the exact bytes with `x-no-aliasing: true` and `Accept-Encoding: identity`;
    - keeps the raw response bytes;
    - fetches `GET /v1/signature/<chat_id>?signing_algo=ecdsa`;
    - requires `signature_kind == provider_tee` and the signed text `MODEL:sha256(req):sha256(resp)`;
    - recovers the EIP-191 signer.

    The key is read from the environment only and is never written to disk.

## How it works

```
owner                         NEAR contract (sealedbench-hk26.testnet)              anyone
-----                         ----------------------------------------              ------
gen 100 sealed items  ──►  commit_suite(root, n, k, request_template) + 0.1 NEAR bond
                           start_run(model) ──► nonce = sha256(random_seed‖suite‖model‖height)
NEAR AI Cloud (TEE) ◄── request = template{MODEL, NONCE, QUESTION}
   signed: MODEL:sha256(req):sha256(resp)
commit_run(run_root, grades "0110…") ──► score computed on-chain
                           draw_challenge  ◄────────────────────────────────── anyone, ≥ delay blocks
                           after the last run commit; one k=20 sample shared by every run
reveal(items, batch ≤ 8) ──► per item:
   1 suite Merkle proof (idx, salt, answer, question)
   2 rebuild request bytes from template + question + nonce → sha256
   3 run Merkle proof (idx, req_hash, resp_hash, signature, grade)
   4 grade == committed grade vector[idx]
   5 env::ecrecover(EIP-191(MODEL:req:resp)) ∈ pinned signers(model)
   6 last "ANSWER: <int>" inside the raw `"content":"…"` value == answer ⇔ grade == 1
     (reasoning_content is never read: reasoning models repeat "ANSWER:" there)
   any failure → FAILED (permanent);  all k pass → AUDITED, bond returned
                           expire() ◄──────────────────────────────────────── anyone, after the deadline
```

- **Leaves:**
  - Suite leaf: `sha256(0x00‖"sb-item-v1\n{idx}\n{salt}\n{answer}\n{question}")`.
  - Run leaf: `sha256(0x00‖"sb-run-v1\n{idx}\n{req_hash}\n{resp_hash}\n{sig}\n{grade}")`.
  - Interior nodes: `sha256(0x01‖l‖r)`, and an odd last node is paired with itself.
- **Draw:** `sha256("sb-draw-v1"‖seed‖suite_id‖ctr_le64) mod n`, deduplicated and sorted. Anyone can re-derive the indices from the `draw_seed` stored in the suite.
- **Mirror:** the contract code is `contract/src/verify.rs` and `lib.rs`, and the byte-for-byte JS mirror is `cli/src/lib.ts`.
- **Free view:** `check_reveal` runs every check without changing state. That's how `verify` and `tamper` hit the contract with no account.

## Sample data

- **Public set:** `data/public-gsm8k-25.json` holds 25 original problems from the GSM8K test split ([openai/grade-school-math](https://github.com/openai/grade-school-math), MIT).
- **Request template (public, part of each suite commitment):** `temperature: 0`, `max_tokens: 1024`, `chat_template_kwargs.enable_thinking: false` (Qwen3 honours it; GLM still emits a short `reasoning_content`, which grading ignores). The system prompt asks for a final line `ANSWER: <integer>` and embeds the run nonce. All 250 responses finished with `stop`.
- **Sealed set:** `cli/src/templates.ts` holds one code template per public problem. The generator draws new numbers, code computes the answer, and the default is 4 variants per template, so 100 sealed items. Answers are correct by construction.
- **Headline:** the public-to-sealed variant gap. Contamination is one possible explanation for a gap, not a proven one.
- **Deviation from plan:** the design doc mentions about 100 public originals, but we ship the 25 originals the templates come from.
- **Fixtures:**
  - `fixtures/real/`: published reveals for the four real AUDITED runs (`npm run verify` default).
  - `fixtures/spike/`: the byte-exact signature vectors.
  - `fixtures/demo/`: published reveals for the AUDITED mock runs.
  - `fixtures/demo-fail/`: the FAILED cheat run.
  - `fixtures/attestation/`: verified NEAR AI attestation reports.
- **Secrets:** working directories under `runs/` hold answer keys and salts, so they're gitignored.

## Claim wording (fixed in advance)

"Owner-reported score X; 20/20 sampled entries verified on NEAR. Under uniform sampling, if ≥10% of the 100 entries were invalid, this audit would catch it with probability ≥87.8% (with-replacement bound 1−(1−f)^k; exact for 20 distinct indices from 100 ≈ 90.5%). The bound applies per run. It is not the probability that the score is correct, and it says nothing about benchmark quality."

## Threat model

- **What you trust:**
  - NEAR AI Cloud's TEE signing key for each model.
  - The admin (`sealedbench-hk26.testnet`), who pins a signer only after verifying its attestation off-chain: DCAP quote, report data binding signer and nonce, MRCONFIGID = app_compose, and RTMR3 replay. The attestation report's sha256 is stored with the pin.
  - The model id is the gateway's claim, not proof of which weights ran.
  - Instances of the same model share one signing key, so a matching signer does not identify the serving instance.
- **What it proves:**
  - The revealed items were fixed before the run.
  - Each revealed response was produced for this run's nonce and signed by the pinned TEE key.
  - The committed grades match a deterministic re-grade of the raw bytes.
  - The score equals the sum of the committed grade vector.
- **What it doesn't prove:**
  - **Unsampled entries.** They are only checked probabilistically, under the bound above.
  - **Re-rolls.** These aren't prevented: an owner could query many times and commit the best response. Temperature 0 and the per-run nonce reduce this, and we disclose it.
  - **Owner visibility.** The owner sees and grades the set. It is hidden from model vendors and the public, not from the owner.
- **Ceiling effect:** GSM8K-style variants are too easy for these two models to show a gap, since both score 98–100%. A harder sealed set would be needed for a contamination signal, and this demo does not claim one.
- **Revealed items are spent:** each reveal removes 20 items from the sealed set.
- **Randomness:** block producers can slightly bias `random_seed`, which is acceptable on testnet. A production version would use commit-reveal or VRF randomness.
- **Replay:** recorded replay proves the verification logic and the on-chain state. It does not prove the live NEAR AI service is up.
- **The mock signer:** it is a DEV-ONLY key that anyone can use, which is why its model id is `mock/DEV-ONLY-not-a-TEE`. No real claim may cite a mock run.
- **Bond:** 0.1 NEAR, nominal. Slashing and bond economics are out of scope.

## NEAR technology used

- **NEAR Protocol testnet:** one Rust smart contract.
- **near-sdk-rs 5.30:**
  - `env::random_seed` for the run nonce and the challenge draw;
  - `env::ecrecover` for secp256k1 recovery of NEAR AI signatures (this needs the `unstable` feature);
  - `env::keccak256_array` for EIP-191 hashing and the Ethereum address;
  - `env::sha256_array` for the Merkle trees and request/response hashes;
  - `Promise::transfer` to return the bond;
  - `store::IterableMap` and `store::LookupMap` for storage.
- **NEAR AI Cloud:**
  - TEE (Intel TDX + NVIDIA) private inference, OpenAI-compatible, used for live runs;
  - response signatures (`/v1/signature`, ECDSA, EIP-191, `provider_tee`);
  - public model attestation reports (`/v1/attestation/report`).
- **Tooling:**
  - `cargo-near` 0.23 for the build and ABI;
  - `near-cli-rs` 0.31 for faucet-sponsored account creation and deploy;
  - `near-api-js` 7.5 in the CLI for calls and views;
  - FastNEAR testnet RPC;
  - NearBlocks testnet explorer.
- **Not used:** NEAR Intents, Chain Signatures, Shade Agents. They don't fit this design.

## Libraries

| Area | Libraries |
| --- | --- |
| Rust | near-sdk 5.30 (MIT/Apache-2.0); dev-only: k256 0.13, sha3 0.10, sha2 0.10, hex 0.4 |
| Node | near-api-js 7.5.3, ethers 6.17 (EIP-191 recover/sign), @phala/dcap-qvl 0.7 (Intel DCAP quote verification) |
| Data | GSM8K test split (MIT) |

All code was written during the hackathon window.

## Repository layout

```
contract/        Rust NEAR contract (lib.rs state+methods, verify.rs pure checks, tests.rs 27 unit tests)
cli/src/         cli.ts (commands), lib.ts (JS mirror of verify.rs), nearai.ts (NEAR AI client + attestation),
                 near.ts (testnet calls), templates.ts (25 generators), replay.ts (verify / tamper / export-web)
cli/test/        node:test unit tests
config/          testnet.json (contract + account ids, RPC, explorer)
data/            25 public GSM8K originals
fixtures/        demo/ demo-fail/ (published reveals), attestation/ (verified NEAR AI reports)
web/             static results page (index.html + data.js)
docs/debate/     design decision and the three-round critique transcripts
```

## How this was built

Grok Bot wrote all the code. Claude Code and Codex acted only as read-only design critics in a three-round debate: they wrote no code, edited no files, and touched no chain. The transcripts and the final decision are in [`docs/debate/`](docs/debate/).

## License

MIT, see [LICENSE](LICENSE).
