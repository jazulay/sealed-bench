# Sealed Bench site

Marketing page and live audit explorer for Sealed Bench. Static Vite + TypeScript, no framework, no backend.

- Live data: the browser reads `sealedbench-hk26.testnet` with public NEAR RPC view calls (`list_suites`, `get_suite`, `get_run`, `get_audit`, `get_signers`) and runs `check_reveal` on revealed entries and on the tamper lab. No keys.
- Fallback: `public/data/snapshot.json` (contract state + revealed entry payloads exported from `../fixtures`). When RPC is unreachable the page says so and shows the snapshot.
- Refresh the snapshot after new runs: `npm run sync` (reads `../fixtures/{real,demo,demo-fail}` and the chain).
- Images: `node scripts/make-images.mjs` renders `og.png` and icons (needs `playwright-core` and Chrome).

```
npm ci && npm run build && npm start   # serves dist/ on $PORT (default 3000)
```

Deployed on Railway from this folder (root directory `site/`, see `railway.json`).
