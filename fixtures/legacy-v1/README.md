# v1 fixtures (retired)

These are the Nov 11–12 runs on the v1 contract `sealedbench-hk26.testnet`: GSM8K-style real runs and the mock rehearsal.
v1 had the issues fixed in v2 (see "Changes in v2" in the top-level README). For example, a same-transaction draw+reveal
could re-roll the sample, and signer pins applied retroactively. These runs are therefore no longer cited. Every
published result is now on `sealedbench-v2-hk26.testnet`. They are kept for the record. To replay them offline, run
`npm run verify -- --offline --dir fixtures/legacy-v1/real`. On-chain mode refuses them because they belong to the
other contract.
