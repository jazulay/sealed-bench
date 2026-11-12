# Pre-registration: the competition-math gap (written before any v2 inference)

Written Thu Nov 12, 2026, about 5:00 PM CT. That is before the `aime-*` suites were committed on-chain, and
before any inference for them on contract v2. The git commit that adds this file is the timestamp. The only
earlier model output on these problems was a 7-call probe of the public originals, used to size `max_tokens`
and the cost. It is described below.

## Why

On the GSM8K-style suites, both models scored 98–100% on the public originals and on the sealed variants. That
is a ceiling, and it can't show a gap either way. So we add a harder pair of suites, where the models are not at
ceiling and where the public originals are widely published (AIME 2018–2025). If those originals are in the
training data, the models should do better on them than on fresh numeric variants.

## Design (fixed now)

- **`aime-public-v1`:** 25 public AIME problems with integer answers ([`data/public-aime-25.json`](data/public-aime-25.json)).
  - 2025 I #1, #3, #4, #5; 2025 II #2.
  - 2024 I #1, #3, #4, #6, #7, #13; 2024 II #1, #4, #7, #13, #14.
  - 2023 I #1, #4; 2022 I #1, #2, #4; 2021 I #3; 2019 I #1, #14; 2018 I #1.
- **`aime-sealed-v1`:** 100 sealed variants, 4 per problem. Item `idx` is variant `floor(idx/25)` of problem
  `idx mod 25`.
  - Each variant changes the numbers (and, for a few, a small wording parameter) of one problem.
  - Its answer is recomputed by code ([`cli/src/templates_aime.ts`](cli/src/templates_aime.ts)), mostly by brute force.
  - [`cli/test/aime.test.ts`](cli/test/aime.test.ts) checks that the same code reproduces every official answer
    of the 25 originals, and checks the closed forms against independent brute force.
  - The seed is random and secret.
- **Models:** `Qwen/Qwen3.8-27B` and `z-ai/glm-5.3-flash` on NEAR AI Cloud (TEE, signed responses).
- **Requests:** one attempt per item, `temperature: 0`, `max_tokens: 4096`, `enable_thinking: false`, and the same
  system prompt for every item (`REQUEST_TEMPLATE_AIME` in `cli/src/cli.ts`; also committed on-chain with each suite).
  - A response cut off by `max_tokens` (`finish_reason: "length"`) is graded **wrong**.
  - A response without a strict final `ANSWER: <integer>` line is graded **wrong**.
  - There are no retries for wrong answers. Only transport errors are retried, and those produce no signed response.
- **Audit:** `k = 20` sampled entries per suite, drawn by `sealedbench-drawer-hk26.testnet`, an account other than the
  owner. Then reveal, on contract v2 (`sealedbench-v2-hk26.testnet`).
- **Control:** the GSM8K-style pair is re-run on v2 as `gsm-public-v2` / `gsm-sealed-v2`. The sealed set is fresh,
  because 20 items of the v1 sealed set are already public.

## Hypothesis

- **H1:** for each model, accuracy on the 25 public originals is higher than on the 100 sealed variants.
- **Expected levels:** about 50–90% on the originals and 35–75% on the variants.
- **Expected gap:** 10–30 points.
- **H0:** no gap. The gap is ≤ 0, or within noise.

## Analysis (fixed now)

- **Headline:** the raw scores (owner-reported and committed on-chain, with 20/20 sampled entries audited) and the
  gap = public% − sealed%.
- **Paired estimate:** for problem j, d_j = (original correct ? 1 : 0) − (mean correctness of its 4 variants).
  - The gap estimate is the mean of d_j over the 25 problems.
  - Its 95% interval is a bootstrap over problems (10,000 resamples, seed 1), since the 4 variants of a problem are correlated.
  - We call a gap **detected** only if the lower bound is above 0.
- **Publication:** we publish the result whatever it is, including a null or a reversed gap, together with the GSM
  ceiling result.

## Caveats, stated in advance

- A gap is evidence consistent with memorization. It is not proof. Variants can be intrinsically harder (bigger
  numbers, more casework) or easier than the original.
- With 25 originals, the interval will be wide.
- Owner-run inference: the owner could re-roll and keep the best responses. The protocol does not prevent this; the
  per-run nonce only rules out responses made *before* the run. This pre-registration commits us to one attempt.
- **Probe:** before writing this, 7 calls on public originals sized the budget. GLM got 5/5 (bases, aya, gridpaths,
  rootprod, beautiful). Qwen got bases right twice and gridpaths right once, and hit `max_tokens: 4096` on beautiful.
  One earlier Qwen batch at `max_tokens: 8192` hit a client timeout before it returned.
