**Yes—I accept SEALED BENCH as the single pick, with three concrete corrections.** The sampled-audit framing resolves my main objection. Its stronger differentiation now outweighs BLINDSPOT’s simpler build.

1. **Bind the headline score to the committed grades.** A transcript root plus a separately declared score does not establish that the score equals the grades’ sum. Simplest MVP: publish a complete, indexed grade vector; have the contract compute its total and require challenged leaves to match those grades. Questions and answers remain hidden outside revealed samples. Avoid adding a Merkle-sum tree.

2. **Call the experiment a “public-to-private variant gap.”** Paraphrasing can change difficulty, ambiguity, and answer validity. A measured drop does not isolate contamination. State that contamination is one possible explanation; publish paired results and describe how answer equivalence was checked. “Contamination Delta” as the headline still overclaims.

3. **Print the sampling assumptions alongside the bound.** The detection calculation concerns a fixed fraction of invalid entries under the specified random sampling procedure. It is not the probability that the score is correct, and it says nothing about benchmark quality or fabricated answer keys. Prefer: **“Owner-reported score: 72%; 20/20 sampled entries verified.”**

The **three riskiest build items** are:

1. **End-to-end receipt verification.** Exact request bytes, signed response serialization, signature recovery, signer authority, and deterministic answer extraction must agree. Make the first milestone one genuine response verified by the deployed contract, including grading from the response bytes whose hash was signed. Preserve that fixture immediately. Treat offline attestation verification as a separate capability that must actually work before claiming it.

2. **Challenge timing and run finalization.** “A later block” alone does not establish an ungameable draw. Specify who triggers selection, whether they can choose among blocks, and how challenges become immutable. Require distinct sampled indices, one challenge set per run, a reveal deadline, and terminal failure on timeout. Test premature reveals, duplicate indices, changed leaves, and abandoned runs. Visible abandonment improves accountability; it does not prevent cherry-picking successful runs.

3. **Producing a defensible experiment.** Hundreds of paraphrases across three models creates substantial generation, validation, inference, and debugging work. Start with **50–100 carefully checked pairs and one model**, then add a second only after the complete audit works. Publish the actual result even if the gap is small or reversed. Preselect the suite and reporting rule before seeing results.

**Cut list for Friday:**

- Three models, 300 pairs, MCP server, marketplace integration, NFTs, and elaborate leaderboard.
- Automated signer registration or rotation; use an explicitly pinned signer and disclose its trust basis.
- Production economic-security claims based on a testnet bond.
- Any guarantee that an arbitrary flipped grade gets caught. For the demo, alter a challenged entry and explain why rejection is guaranteed there.
- Multiple buyer narratives. Lead with **private evaluation teams publishing independently checkable sampled evidence**; agent consumption can be one CLI example.

Keep one contract, one minimal results page, one CLI, genuine recorded fixtures, and an optional live path. Recorded replay demonstrates verification, not current service availability.

**FINAL: SEALED BENCH — sampled private benchmark audit / privacy primary, open secondary, agents only if the CLI fits.**