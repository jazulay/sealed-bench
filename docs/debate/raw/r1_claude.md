I'm replying in text only, as the packet asks: no files and no commands.

## 1. Ranking

1. **Sealed Bench.** It's on Illia's list and nobody has taken it. It uses NEAR for something only a chain can do: public randomness and permanent commitments. It can also produce a number, which is how past winners won.
2. **Blindspot.** Easy to build and easy for the AI screeners to run, but it reads as "an API wrapper plus a receipt." The on-chain part does very little.
3. **Unwind.** Haseeb's chargeback argument is a real hook. But 34 escrow entries already exist, and the AI arbiter is the weakest, most subjective part.
4. **Vault Heist.** Best live demo, but Freysa clones and Bag Heist are already in. It will look derivative.
5. **Sealed Second Opinion.** It's a frontend for TEE inference. The prompt-NFT royalties feel bolted on.
6. **Oracle of the Meme.** Fun, but it's mostly the memecoins track and the "AI judge" part is shallow.
7. **Basis Butler.** It needs mainnet and real money in 2 days, and judges can't reproduce it. Drop it.
8. **Quiet Ledger.** Aftercall already exists. Drop it.

## 2. Attacking Sealed Bench

**What the signature proves.** Only this: a key that NEAR AI keeps in its TEE signed `MODEL:H(req):H(resp)`. It does **not** prove which model weights ran. The model string is the gateway's own claim. All instances of a model share one key, and the docs say this is not a full chain from model to response.

The contract can't check Intel TDX attestation itself. Someone registers the allowed signer address after checking attestation off-chain. Say that plainly in the README; if you claim more, a technical judge will catch it.

**The biggest hole: grading lies on hidden items.** The signature proves a response exists, not that it was graded correctly. The contract can't check items nobody reveals. Random challenges catch this, but only if the owner commits every per-item grade **before** the random seed exists. Detection is then measurable: if a fraction f of grades are false and k items are challenged, the lie escapes with probability (1−f)^k. With k=30 and f=10%, it's caught 96% of the time. Put that formula in the README; it's the strongest thing in the project.

**Requests can be swapped.** The owner could slip answer hints into the prompt. For every challenged item, reveal the full request bytes. The contract recomputes the hash and checks the request equals a public template plus the item plus the run nonce.

**Re-rolling isn't stopped.** The owner can sample each item N times and keep the best answer. The TEE doesn't count calls. Partial fixes: temperature 0, a run nonce from the chain, and listing this as a known limit on the certificate.

**Run abandonment.** The owner could drop a run whose challenge draw looks bad and start over. Make every commit permanent, add a bond, and show abandoned runs on the leaderboard.

**Narrative gap.** Only open-weight models run in the TEE. Contamination is most worrying for closed models (GPT, Claude), and those are only proxied. Frame it as "certified evals for TEE-served models," with the closed-model case as roadmap.

**Other gaps.**
- Revealing challenged items uses them up, so the set shrinks with each run.
- The block's random seed can be biased slightly by the block producer. That's acceptable on testnet.

**Demo.** As planned, it's abstract: Merkle trees and a leaderboard. It needs a headline number (see section 3).

**Feasibility: about 7 out of 10.** Risks:
- Signature format details (non-streaming, `x-no-aliasing`, canonical model id, EIP-191 prefix, the recovery byte).
- The NEAR AI service going down.

Only the challenged items need an on-chain signature check (about 0.3 Tgas each). Checking unrevealed signatures on-chain proves nothing.

**AI screeners.** Strong, if there's a replay mode: saved signed fixtures plus a deployed testnet contract, so `npm run verify` needs no NEAR AI key.

**Judge fit.**
- **Illia:** directly on his list.
- **Mert:** privacy.
- **Eddy:** data contamination is a lasting problem, so it will stick around.
- **Stepan:** ship it as a CLI or MCP tool so agents can request certificates.
- **Haseeb:** weakest fit.

## 3. Sharper variant: the "Contamination Delta"

Ship a result, not just infrastructure:
- Build about 300 private paraphrases of public math and reasoning questions (GSM8K-style), with multiple-choice or exact-match answers so the contract can re-grade on-chain.
- Run 2–3 TEE models (Qwen3.8, DeepSeek-V4.1-Flash, GLM-5.3-flash) on the public originals and the sealed versions.
- Certify the gap between the two scores.

The headline becomes: *"DeepSeek drops 11 points on unseen versions, certified on NEAR without revealing one hidden question."* Past winners won on numbers like that.

## 4. Final pick: Sealed Bench + Contamination Delta

**Tracks:** privacy (main), open, agents.

**MVP:**
1. **Set commit.** The owner commits a Merkle root over (item, answer) and posts a bond.
2. **Run start.** The contract creates a run nonce from the random seed. Every request must include it, so no response can come from before the commit.
3. **Run commit.** A runner calls the TEE models (non-streaming) and fetches each signature. It commits a root over (index, request hash, response hash, signature, grade) together with the claimed score.
4. **Challenge.** Using a later block's random seed, the contract picks k items to challenge.
5. **Reveal.** For each challenged item, the contract checks:
   - both Merkle proofs;
   - the request hash and that the request matches the template;
   - the signature, recovered against the allowed signer;
   - the grade, by re-grading.
6. **Result.** A certificate is issued, or the bond is slashed and the run is marked failed.
7. **Interfaces:** a leaderboard page, a `verify` CLI, a replay mode with fixtures, and a tamper script.

**Demo script (~75s):**
- **0–10s:** "Public benchmarks leak into training data. How do you prove a score without showing the test?"
- **10–25s:** Commit a 300-item sealed set; the root appears on the testnet explorer.
- **25–40s:** Run Qwen and DeepSeek. Signed responses stream in and the run root is committed.
- **40–55s:** The challenge is drawn on-chain and 15 cells light up. They're revealed and every on-chain check turns green. The certificate is minted.
- **55–70s:** Tamper: flip one grade and rerun. The contract rejects it on-chain. Then the leaderboard shows the public score next to the sealed one, with the delta.
- **70–80s:** "`git clone && npm run verify`: no API key needed."

**Threat model:**
- **Trust:** you trust NEAR AI's TEE key and the admin who registers the signer. Attestation is checked off-chain, and the model id is the gateway's claim, not proof of the weights.
- **Owner visibility:** the set is hidden from model vendors and the public, not from the owner.
- **Grading fraud:** caught with probability 1−(1−f)^k. Every run is permanent and bonded, so the owner can't quietly retry.
- **Re-rolling:** not prevented. It's reduced by temperature 0 and the run nonce, and disclosed on each certificate.
- **Lesser limits:** revealed items are used up, and the random seed can be slightly biased by block producers.
