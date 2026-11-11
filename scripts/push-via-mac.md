# Publishing updates (box → Mac mini → GitHub)

All code is written and committed on the box. The Mac mini acts only as a push relay because it holds Yossi's GitHub auth (`gh`, account `jazulay`). Never edit code on the Mac.

Commit identity on the box (repo-local):

    git config user.name "Joseph Azulay"
    git config user.email "35465299+jazulay@users.noreply.github.com"

## 1. Box: pre-publish checks

    cd /workspace/near-hackathon/sealed-bench
    /tmp/gitleaks git --no-banner .           # expect "no leaks found" (.gitleaks.toml allowlists public attestation reports)
    git ls-files | rg -i 'runs/|secret|credential|\.env' || echo ok   # expect ok
    (cd contract && cargo test) && npm test && npm run verify && npm run tamper

## 2. Box: bundle all branches

    git bundle create /workspace/near-hackathon/sealed-bench.bundle --all
    git bundle verify /workspace/near-hackathon/sealed-bench.bundle

## 3. Copy the bundle to the Mac

Copy it to `~/Projects/sealed-bench.bundle` on Mac machine `7fe7434d-15a5-463e-a91f-2976f7a5d56d`, using CopyFromBox (overwrite).

## 4. Mac: fast-forward and push (no edits)

    cd ~/Projects/sealed-bench
    git fetch ~/Projects/sealed-bench.bundle 'refs/heads/*:refs/remotes/bundle/*'
    git merge --ff-only bundle/main          # must fast-forward; if not, stop and rebase on the box instead
    git push origin main
    git log -1 --format='%H %an <%ae>'

If history was rewritten on the box (avoid this after publishing), a force push needs Yossi's explicit OK first.

First-time setup, already done on Wed Nov 11, 2026:

    git clone ~/Projects/sealed-bench.bundle ~/Projects/sealed-bench
    cd ~/Projects/sealed-bench && git remote remove origin
    gh repo create jazulay/sealed-bench --public --source . --remote origin --push \
      --description "Sampled on-chain audits of private AI evals on NEAR, checked against NEAR AI Cloud TEE signatures"
