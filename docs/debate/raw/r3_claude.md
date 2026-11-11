**ACCEPT WITH one change: fix the number in the claim.**

The claim says "≥88%" and cites 1-(1-f)^k. With f = 0.10 and k = 20 that formula gives 1 − 0.9²⁰ ≈ 0.878. So "≥88%" is false as written; it rounds up past a lower bound. This sentence is the honesty statement of the whole project, so a judge who checks it would wrongly read the error as overclaiming.

Replace it with:

> "...if ≥10% of the N=100 entries were invalid, this audit catches it with probability ≥87.8% (with-replacement bound 1−(1−f)^k; exact without-replacement value for 20 distinct indices from 100 ≈ 90%)."

Your protocol draws k=20 *distinct* indices, which is sampling without replacement. That gives a hypergeometric miss probability of C(90,20)/C(100,20) ≈ 0.095, so a catch rate of about 90%. Either state the conservative 87.8% bound, or compute the exact value in `npm run verify` and print that. Don't mix the formula from one with the number from the other.

Also, not blocking: if there are two committed runs, state that the bound applies **per run**. Otherwise readers may combine the two into one bigger sample.

Everything else is sound enough to lock:
- The run nonce comes after commit_suite, so answers can't be precomputed.
- The contract computes the score from the public grade vector.
- The challenge is drawn after all runs are committed, and the index set is shared across runs.
- A failed or late reveal is a permanent FAIL.
- The threat model already lists the honest residual risks: re-rolls, how much trust rests on the TEE key, and bias in the block randomness.

The Wednesday byte-exact signature spike is the right risk to tackle first.
