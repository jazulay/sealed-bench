//! Sealed Bench v2: sampled on-chain audits of private AI evaluations.
//!
//! Flow: commit_suite -> start_run (per model, chain nonce, signer set snapshotted) -> commit_run
//! (run root + full grade vector before a commit deadline, score computed on-chain) -> draw_challenge
//! (permissionless, after a delay, one shared sample for every run; uncommitted runs past their
//! deadline become ABANDONED, publicly) -> reveal (owner, in a LATER block than the draw, before the
//! reveal deadline) -> AUDITED / FAILED. The bond goes back to the owner only if every run is AUDITED;
//! otherwise it goes to whoever drew the challenge (or called `expire`).

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};

pub mod verify;
use verify::*;

pub const MIN_BOND: NearToken = NearToken::from_millinear(100); // 0.1 NEAR (nominal, testnet)
pub const MAX_N: u32 = 4096;
pub const MAX_K: u32 = 64;
pub const MAX_REVEAL_BATCH: usize = 8;
pub const MAX_TEMPLATE_BYTES: usize = 4096;
pub const MAX_NOTE_BYTES: usize = 512;
pub const MAX_MODELS_PER_SUITE: usize = 8;
pub const MIN_COMMIT_WINDOW: u64 = 10;
pub const VERSION: &str = "sealed-bench-v2";

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Suites,
    Runs,
    Signers,
    Roots,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum RunStatus {
    Started,
    Committed,
    Audited,
    Failed,
    /// Started but not committed before its commit deadline. Public and permanent.
    Abandoned,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SignerPin {
    /// 0x-prefixed lowercase 20-byte Ethereum address from a NEAR AI model attestation report.
    pub address: String,
    /// sha256 of the raw attestation report JSON that was checked off-chain before pinning.
    pub attestation_sha256: String,
    pub pinned_height: u64,
    pub note: String,
    /// Set by `revoke_signer`. A revoked pin is left out of every run started afterwards.
    pub revoked_height: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Suite {
    pub id: String,
    pub owner: AccountId,
    pub root: String,
    pub n: u32,
    pub k: u32,
    pub request_template: String,
    pub note: String,
    pub bond: NearToken,
    pub commit_height: u64,
    pub challenge_delay: u64,
    pub reveal_window: u64,
    /// A run must be committed within this many blocks of its start_run, or it becomes ABANDONED.
    pub commit_window: u64,
    pub models: Vec<String>,
    pub last_run_commit_height: u64,
    pub challenge: Option<Vec<u32>>,
    pub draw_height: Option<u64>,
    pub draw_seed: Option<String>,
    pub drawn_by: Option<AccountId>,
    pub reveal_deadline: Option<u64>,
    /// Who the bond is owed to once the suite is settled: the owner if every run is AUDITED,
    /// otherwise whoever drew the challenge (or called `expire`).
    pub bond_payee: Option<AccountId>,
    pub bond_paid: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Run {
    pub suite_id: String,
    pub model: String,
    pub nonce: String,
    pub start_height: u64,
    pub commit_deadline: u64,
    /// Snapshot of the model's non-revoked pinned signer addresses at start_run. Only these count.
    pub signers: Vec<String>,
    pub run_root: Option<String>,
    pub grades: Option<String>,
    pub score: Option<u32>,
    pub commit_height: Option<u64>,
    pub revealed: Vec<u32>,
    pub sample_correct: u32,
    pub status: RunStatus,
    pub fail_reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RevealItem {
    pub idx: u32,
    pub salt: String,
    pub answer: i64,
    pub question: String,
    /// Exact raw response body bytes (UTF-8) returned by NEAR AI Cloud.
    pub response: String,
    /// 65-byte r||s||v hex from GET /v1/signature/<chat_id>?signing_algo=ecdsa
    pub signature: String,
    pub grade: u8,
    pub suite_proof: Vec<String>,
    pub run_proof: Vec<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CheckResult {
    pub ok: bool,
    pub reason: String,
    pub request_sha256: String,
    pub response_sha256: String,
    pub signed_text: String,
    pub recovered_signer: Option<String>,
    pub model_answer: Option<i64>,
    pub correct: bool,
}

#[near(serializers = [json])]
pub struct AuditView {
    pub suite_id: String,
    pub model: String,
    pub status: RunStatus,
    pub score: Option<u32>,
    pub n: u32,
    pub k: u32,
    pub revealed: u32,
    pub sample_correct: u32,
    pub challenge: Option<Vec<u32>>,
    pub draw_height: Option<u64>,
    pub drawn_by: Option<AccountId>,
    pub reveal_deadline: Option<u64>,
    pub signers: Vec<String>,
    pub fail_reason: Option<String>,
    pub claim: String,
}

#[near(serializers = [json])]
pub struct OwnerRecordEntry {
    pub suite_id: String,
    pub root: String,
    pub model: String,
    pub status: RunStatus,
    pub score: Option<u32>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealedBench {
    admin: AccountId,
    suites: IterableMap<String, Suite>,
    runs: LookupMap<String, Run>,
    signers: LookupMap<String, Vec<SignerPin>>,
    /// suite root -> suite id. The same committed set cannot be reused in a second suite.
    roots: LookupMap<String, String>,
}

fn run_key(suite_id: &str, model: &str) -> String {
    format!("{suite_id}|{model}")
}

#[near]
impl SealedBench {
    #[init]
    pub fn new(admin: AccountId) -> Self {
        Self {
            admin,
            suites: IterableMap::new(Key::Suites),
            runs: LookupMap::new(Key::Runs),
            signers: LookupMap::new(Key::Signers),
            roots: LookupMap::new(Key::Roots),
        }
    }

    // ---------------- admin: signer pinning ----------------

    /// Pin a NEAR AI model signing address after checking its attestation report off-chain.
    /// This is the trust root of the system and is disclosed as such.
    pub fn pin_signer(&mut self, model: String, address: String, attestation_sha256: String, note: String) {
        require!(env::predecessor_account_id() == self.admin, "admin only");
        require!(valid_model_id(&model), "bad model id");
        let a = from_hex(&address).unwrap_or_default();
        require!(a.len() == 20, "address must be 20 bytes");
        require!(hex32(&attestation_sha256).is_ok(), "attestation_sha256 must be 32-byte hex");
        require!(note.len() <= MAX_NOTE_BYTES, "note too long");
        let pin = SignerPin {
            address: format!("0x{}", to_hex(&a)),
            attestation_sha256: attestation_sha256.to_lowercase(),
            pinned_height: env::block_height(),
            note,
            revoked_height: None,
        };
        let mut list = self.signers.get(&model).cloned().unwrap_or_default();
        require!(!list.iter().any(|p| p.address == pin.address), "address already pinned for this model (revoked pins stay revoked)");
        require!(list.len() < 16, "too many pins for this model");
        env::log_str(&format!("EVENT pin_signer {model} {}", pin.address));
        list.push(pin);
        self.signers.insert(model, list);
    }

    /// Revoke a pin. Runs already started keep their snapshot; later runs do not get this address.
    pub fn revoke_signer(&mut self, model: String, address: String) {
        require!(env::predecessor_account_id() == self.admin, "admin only");
        let addr = format!("0x{}", to_hex(&from_hex(&address).unwrap_or_default()));
        let mut list = self.signers.get(&model).cloned().unwrap_or_default();
        let p = list.iter_mut().find(|p| p.address == addr).unwrap_or_else(|| env::panic_str("no such pin"));
        require!(p.revoked_height.is_none(), "already revoked");
        p.revoked_height = Some(env::block_height());
        env::log_str(&format!("EVENT revoke_signer {model} {addr}"));
        self.signers.insert(model, list);
    }

    // ---------------- owner: suite + runs ----------------

    #[payable]
    pub fn commit_suite(
        &mut self,
        suite_id: String,
        root: String,
        n: u32,
        k: u32,
        request_template: String,
        challenge_delay_blocks: u64,
        reveal_window_blocks: u64,
        commit_window_blocks: u64,
        note: String,
    ) {
        require!(!suite_id.is_empty() && suite_id.len() <= 64 && !suite_id.contains('|'), "bad suite id");
        require!(self.suites.get(&suite_id).is_none(), "suite exists (commitments are permanent)");
        require!(hex32(&root).is_ok(), "root must be 32-byte hex");
        let root_hex = to_hex(&hex32(&root).unwrap());
        require!(self.roots.get(&root_hex).is_none(), "root already committed in another suite");
        require!(n >= 1 && n <= MAX_N, "bad n");
        require!(k >= 1 && k <= n && k <= MAX_K, "bad k");
        require!(
            request_template.contains("{MODEL}") && request_template.contains("{NONCE}") && request_template.contains("{QUESTION}"),
            "template needs {MODEL} {NONCE} {QUESTION}"
        );
        require!(request_template.len() <= MAX_TEMPLATE_BYTES, "request_template over 4096 bytes");
        if let Err(e) = template_policy(&request_template) {
            env::panic_str(&e);
        }
        require!(note.len() <= MAX_NOTE_BYTES, "note over 512 bytes");
        require!(challenge_delay_blocks >= 1 && reveal_window_blocks >= 10, "bad windows");
        require!(commit_window_blocks >= MIN_COMMIT_WINDOW, "commit window must be at least 10 blocks");
        let bond = env::attached_deposit();
        require!(bond >= MIN_BOND, "attach a bond of at least 0.1 NEAR");
        let suite = Suite {
            id: suite_id.clone(),
            owner: env::predecessor_account_id(),
            root: root_hex.clone(),
            n,
            k,
            request_template,
            note,
            bond,
            commit_height: env::block_height(),
            challenge_delay: challenge_delay_blocks,
            reveal_window: reveal_window_blocks,
            commit_window: commit_window_blocks,
            models: vec![],
            last_run_commit_height: 0,
            challenge: None,
            draw_height: None,
            draw_seed: None,
            drawn_by: None,
            reveal_deadline: None,
            bond_payee: None,
            bond_paid: false,
        };
        env::log_str(&format!("EVENT commit_suite {suite_id} root={} n={n} k={k}", suite.root));
        self.roots.insert(root_hex, suite_id.clone());
        self.suites.insert(suite_id, suite);
    }

    /// Start a run: the contract derives a nonce from chain randomness that every request must embed,
    /// so no response can be produced before this point.
    pub fn start_run(&mut self, suite_id: String, model: String) -> String {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(env::predecessor_account_id() == suite.owner, "suite owner only");
        require!(suite.challenge.is_none(), "challenge already drawn; suite is closed");
        require!(valid_model_id(&model), "bad model id");
        let signers: Vec<String> = self.signers.get(&model).map_or(vec![], |l| l.iter().filter(|p| p.revoked_height.is_none()).map(|p| p.address.clone()).collect());
        require!(!signers.is_empty(), "no pinned signer for model");
        require!(suite.models.len() < MAX_MODELS_PER_SUITE, "too many models in this suite");
        let key = run_key(&suite_id, &model);
        require!(self.runs.get(&key).is_none(), "run exists (runs are permanent)");
        let mut seed = env::random_seed();
        seed.extend_from_slice(suite_id.as_bytes());
        seed.push(b'|');
        seed.extend_from_slice(model.as_bytes());
        seed.extend_from_slice(&env::block_height().to_le_bytes());
        let nonce = to_hex(&sha256(&seed));
        suite.models.push(model.clone());
        let run = Run {
            suite_id: suite_id.clone(),
            model: model.clone(),
            nonce: nonce.clone(),
            start_height: env::block_height(),
            commit_deadline: env::block_height() + suite.commit_window,
            signers,
            run_root: None,
            grades: None,
            score: None,
            commit_height: None,
            revealed: vec![],
            sample_correct: 0,
            status: RunStatus::Started,
            fail_reason: None,
        };
        env::log_str(&format!("EVENT start_run {suite_id} {model} nonce={nonce}"));
        self.runs.insert(key, run);
        self.suites.insert(suite_id, suite);
        nonce
    }

    /// Commit the run root and the FULL grade vector ("0"/"1" per item). The score is computed here.
    pub fn commit_run(&mut self, suite_id: String, model: String, run_root: String, grades: String) -> u32 {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(env::predecessor_account_id() == suite.owner, "suite owner only");
        require!(suite.challenge.is_none(), "challenge already drawn");
        let key = run_key(&suite_id, &model);
        let mut run = self.runs.get(&key).cloned().unwrap_or_else(|| env::panic_str("no such run"));
        require!(run.status == RunStatus::Started, "run not in Started state");
        require!(env::block_height() <= run.commit_deadline, "commit deadline passed (run is abandoned)");
        require!(hex32(&run_root).is_ok(), "run_root must be 32-byte hex");
        require!(grades.len() == suite.n as usize && grades.bytes().all(|b| b == b'0' || b == b'1'), "grades must be n chars of 0/1");
        let score = grades.bytes().filter(|b| *b == b'1').count() as u32;
        run.run_root = Some(to_hex(&hex32(&run_root).unwrap()));
        run.grades = Some(grades);
        run.score = Some(score);
        run.commit_height = Some(env::block_height());
        run.status = RunStatus::Committed;
        suite.last_run_commit_height = env::block_height();
        env::log_str(&format!("EVENT commit_run {suite_id} {model} score={score}/{}", suite.n));
        self.runs.insert(key, run);
        self.suites.insert(suite_id, suite);
        score
    }

    // ---------------- anyone: challenge ----------------

    /// Permissionless. Allowed once every started run is committed or past its commit deadline
    /// (those become ABANDONED here), and `challenge_delay` blocks have passed since the last run
    /// commit. First call wins; one sample shared by all runs.
    pub fn draw_challenge(&mut self, suite_id: String) -> Vec<u32> {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(suite.challenge.is_none(), "already drawn");
        require!(!suite.models.is_empty(), "no runs");
        let mut committed = 0;
        for m in &suite.models {
            let key = run_key(&suite_id, m);
            let mut r = self.runs.get(&key).cloned().unwrap();
            if r.status == RunStatus::Started {
                require!(env::block_height() > r.commit_deadline, "every started run must be committed (or past its commit deadline) first");
                r.status = RunStatus::Abandoned;
                r.fail_reason = Some("not committed before the commit deadline".into());
                env::log_str(&format!("EVENT abandoned {suite_id} {m}"));
                self.runs.insert(key, r);
            } else if r.status == RunStatus::Committed {
                committed += 1;
            }
        }
        require!(committed > 0, "no committed runs");
        let earliest = suite.last_run_commit_height + suite.challenge_delay;
        require!(env::block_height() >= earliest, format!("too early: draw allowed from block {earliest}"));
        let seed = env::random_seed();
        let idx = draw_indices(&seed, &suite_id, suite.n, suite.k);
        suite.challenge = Some(idx.clone());
        suite.draw_height = Some(env::block_height());
        suite.draw_seed = Some(to_hex(&seed));
        suite.drawn_by = Some(env::predecessor_account_id());
        suite.reveal_deadline = Some(env::block_height() + suite.reveal_window);
        env::log_str(&format!("EVENT draw_challenge {suite_id} indices={idx:?}"));
        self.suites.insert(suite_id, suite);
        idx
    }

    // ---------------- owner: reveal ----------------

    /// Reveal challenged items for one run. Any failed check marks the run FAILED permanently.
    pub fn reveal(&mut self, suite_id: String, model: String, items: Vec<RevealItem>) -> RunStatus {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(env::predecessor_account_id() == suite.owner, "suite owner only");
        require!(!items.is_empty() && items.len() <= MAX_REVEAL_BATCH, "1..=8 items per call");
        let challenge = suite.challenge.clone().unwrap_or_else(|| env::panic_str("challenge not drawn"));
        let key = run_key(&suite_id, &model);
        let mut run = self.runs.get(&key).cloned().unwrap_or_else(|| env::panic_str("no such run"));
        require!(run.status == RunStatus::Committed, "run is not awaiting reveal");
        // A reveal in the draw's own block (e.g. batched with draw_challenge in one transaction)
        // could revert the draw whenever it hits a bad index, which would let the owner re-roll it.
        require!(env::block_height() > suite.draw_height.unwrap(), "reveal must be in a later block than the draw");

        if env::block_height() > suite.reveal_deadline.unwrap() {
            run.status = RunStatus::Failed;
            run.fail_reason = Some("reveal deadline passed".into());
            self.runs.insert(key, run);
            self.settle(&mut suite, None);
            self.suites.insert(suite_id, suite);
            return RunStatus::Failed;
        }

        for it in &items {
            if !challenge.contains(&it.idx) || run.revealed.contains(&it.idx) {
                env::panic_str("index not in challenge set or already revealed");
            }
            let res = self.check_inner(&suite, &run, it);
            if !res.ok {
                env::log_str(&format!("EVENT reveal_failed {suite_id} {model} idx={} reason={}", it.idx, res.reason));
                run.status = RunStatus::Failed;
                run.fail_reason = Some(format!("idx {}: {}", it.idx, res.reason));
                self.runs.insert(key, run);
                self.settle(&mut suite, None);
                self.suites.insert(suite_id, suite);
                return RunStatus::Failed;
            }
            run.revealed.push(it.idx);
            if res.correct {
                run.sample_correct += 1;
            }
            env::log_str(&format!("EVENT reveal_ok {suite_id} {model} idx={} correct={}", it.idx, res.correct));
        }

        if run.revealed.len() == challenge.len() {
            run.status = RunStatus::Audited;
            env::log_str(&format!("EVENT audited {suite_id} {model} {}/{} sampled entries verified", run.revealed.len(), challenge.len()));
        }
        let status = run.status.clone();
        self.runs.insert(key, run);
        self.settle(&mut suite, None);
        self.suites.insert(suite_id, suite);
        status
    }

    /// Permissionless. Before the draw: runs past their commit deadline become ABANDONED. After the
    /// reveal deadline: runs not AUDITED become FAILED. Returns how many runs changed. If that settles
    /// the suite with a forfeited bond and nobody drew, the caller is the payee.
    pub fn expire(&mut self, suite_id: String) -> u32 {
        let mut suite = self.suite_or_panic(&suite_id);
        let h = env::block_height();
        let mut changed = 0;
        for m in &suite.models {
            let key = run_key(&suite_id, m);
            let mut r = self.runs.get(&key).cloned().unwrap();
            if r.status == RunStatus::Started && h > r.commit_deadline {
                r.status = RunStatus::Abandoned;
                r.fail_reason = Some("not committed before the commit deadline".into());
            } else if r.status == RunStatus::Committed && suite.reveal_deadline.map_or(false, |d| h > d) {
                r.status = RunStatus::Failed;
                r.fail_reason = Some("reveal deadline passed".into());
            } else {
                continue;
            }
            env::log_str(&format!("EVENT expired {suite_id} {m} {:?}", r.status));
            self.runs.insert(key, r);
            changed += 1;
        }
        self.settle(&mut suite, Some(env::predecessor_account_id()));
        self.suites.insert(suite_id, suite);
        changed
    }

    /// Anyone can retry paying a settled bond (e.g. after a failed transfer).
    pub fn claim_bond(&mut self, suite_id: String) {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(suite.bond_payee.is_some(), "suite not settled");
        require!(!suite.bond_paid, "bond already paid");
        self.pay_bond(&mut suite);
        self.suites.insert(suite_id, suite);
    }

    #[private]
    pub fn on_bond_paid(&mut self, suite_id: String) -> bool {
        let ok = env::promise_result_checked(0, 64).is_ok();
        if !ok {
            let mut suite = self.suite_or_panic(&suite_id);
            suite.bond_paid = false; // keep it claimable
            env::log_str(&format!("EVENT bond_transfer_failed {suite_id}"));
            self.suites.insert(suite_id, suite);
        }
        ok
    }

    // ---------------- views ----------------

    pub fn get_admin(&self) -> AccountId {
        self.admin.clone()
    }

    pub fn get_signers(&self, model: String) -> Vec<SignerPin> {
        self.signers.get(&model).cloned().unwrap_or_default()
    }

    pub fn get_suite(&self, suite_id: String) -> Option<Suite> {
        self.suites.get(&suite_id).cloned()
    }

    pub fn version(&self) -> String {
        VERSION.into()
    }

    pub fn list_suites(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<String> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(100).min(100) as usize;
        self.suites.keys().skip(from).take(lim).cloned().collect()
    }

    /// Every run in every suite this owner committed (including FAILED and ABANDONED ones), so suite
    /// shopping is visible. Paginated over suites.
    pub fn owner_record(&self, owner: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<OwnerRecordEntry> {
        let from = from_index.unwrap_or(0) as usize;
        let lim = limit.unwrap_or(100).min(100) as usize;
        let mut out = vec![];
        for (id, s) in self.suites.iter().skip(from).take(lim) {
            if s.owner != owner {
                continue;
            }
            for m in &s.models {
                let r = self.runs.get(&run_key(id, m)).unwrap();
                out.push(OwnerRecordEntry { suite_id: id.clone(), root: s.root.clone(), model: m.clone(), status: r.status.clone(), score: r.score });
            }
        }
        out
    }

    pub fn get_run(&self, suite_id: String, model: String) -> Option<Run> {
        self.runs.get(&run_key(&suite_id, &model)).cloned()
    }

    pub fn get_audit(&self, suite_id: String, model: String) -> AuditView {
        let suite = self.suite_or_panic(&suite_id);
        let run = self.runs.get(&run_key(&suite_id, &model)).cloned().unwrap_or_else(|| env::panic_str("no such run"));
        let claim = match run.status {
            RunStatus::Audited => format!(
                "Owner-reported score {}/{}; {}/{} randomly sampled entries matched TEE-signed responses and re-graded on NEAR. A spot check, not a proof: unsampled entries are unchecked. Says nothing about benchmark quality.",
                run.score.unwrap_or(0), suite.n, run.revealed.len(), suite.k
            ),
            RunStatus::Failed => format!("FAILED: {}", run.fail_reason.clone().unwrap_or_default()),
            RunStatus::Abandoned => "ABANDONED: the owner started this run but never committed it".into(),
            _ => "Audit in progress".into(),
        };
        AuditView {
            suite_id,
            model,
            status: run.status,
            score: run.score,
            n: suite.n,
            k: suite.k,
            revealed: run.revealed.len() as u32,
            sample_correct: run.sample_correct,
            challenge: suite.challenge,
            draw_height: suite.draw_height,
            drawn_by: suite.drawn_by,
            reveal_deadline: suite.reveal_deadline,
            signers: run.signers,
            fail_reason: run.fail_reason,
            claim,
        }
    }

    /// Exact request bytes the runner must send for (suite, model, question).
    pub fn build_request_for(&self, suite_id: String, model: String, question: String) -> String {
        let suite = self.suite_or_panic(&suite_id);
        let run = self.runs.get(&run_key(&suite_id, &model)).unwrap_or_else(|| env::panic_str("no such run"));
        build_request(&suite.request_template, &model, &run.nonce, &question)
    }

    /// Run every reveal check without changing state (free RPC view; used by `npm run verify/tamper`).
    pub fn check_reveal(&self, suite_id: String, model: String, item: RevealItem) -> CheckResult {
        let suite = self.suite_or_panic(&suite_id);
        let run = self.runs.get(&run_key(&suite_id, &model)).cloned().unwrap_or_else(|| env::panic_str("no such run"));
        self.check_inner(&suite, &run, &item)
    }
}

impl SealedBench {
    fn suite_or_panic(&self, id: &str) -> Suite {
        self.suites.get(id).cloned().unwrap_or_else(|| env::panic_str("no such suite"))
    }

    /// Once every run is terminal, decide who the bond is owed to and pay it.
    fn settle(&mut self, suite: &mut Suite, caller: Option<AccountId>) {
        if suite.bond_payee.is_some() {
            return;
        }
        let statuses: Vec<RunStatus> = suite.models.iter().map(|m| self.runs.get(&run_key(&suite.id, m)).unwrap().status.clone()).collect();
        if statuses.is_empty() || statuses.iter().any(|s| *s == RunStatus::Started || *s == RunStatus::Committed) {
            return;
        }
        let payee = if statuses.iter().all(|s| *s == RunStatus::Audited) {
            suite.owner.clone()
        } else {
            suite.drawn_by.clone().or(caller).unwrap_or_else(|| suite.owner.clone())
        };
        env::log_str(&format!("EVENT settled {} bond_to={payee}", suite.id));
        suite.bond_payee = Some(payee);
        self.pay_bond(suite);
    }

    fn pay_bond(&mut self, suite: &mut Suite) {
        suite.bond_paid = true;
        let to = suite.bond_payee.clone().unwrap();
        Promise::new(to)
            .transfer(suite.bond)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_bond_paid".to_string(),
                format!("{{\"suite_id\":{}}}", json_string(&suite.id)).into_bytes(),
                NearToken::from_near(0),
                Gas::from_tgas(5),
            ))
            .detach();
    }

    fn check_inner(&self, suite: &Suite, run: &Run, it: &RevealItem) -> CheckResult {
        let mut res = CheckResult {
            ok: false,
            reason: String::new(),
            request_sha256: String::new(),
            response_sha256: String::new(),
            signed_text: String::new(),
            recovered_signer: None,
            model_answer: None,
            correct: false,
        };
        macro_rules! fail {
            ($($t:tt)*) => {{ res.reason = format!($($t)*); return res; }};
        }
        if it.idx >= suite.n {
            fail!("idx out of range");
        }
        // 1. suite Merkle proof over (idx, salt, answer, question)
        if it.suite_proof.len() != tree_depth(suite.n) {
            fail!("suite proof has wrong length");
        }
        if !is_salt(&it.salt) {
            fail!("salt must be 32-byte lowercase hex (64 chars)");
        }
        if it.answer.unsigned_abs() >= MAX_ANSWER_ABS {
            fail!("answer key out of range");
        }
        let leaf = item_leaf(it.idx, &it.salt, it.answer, &it.question);
        match merkle_root_from_proof(leaf, it.idx, &it.suite_proof) {
            Ok(r) if to_hex(&r) == suite.root => {}
            Ok(_) => fail!("suite Merkle proof does not match committed root"),
            Err(e) => fail!("suite proof: {e}"),
        }
        // 2. request bytes are rebuilt here from the public template + item + run nonce
        let request = build_request(&suite.request_template, &run.model, &run.nonce, &it.question);
        res.request_sha256 = to_hex(&sha256(request.as_bytes()));
        res.response_sha256 = to_hex(&sha256(it.response.as_bytes()));
        // 3. run Merkle proof over (idx, req_hash, resp_hash, sig, grade)
        let run_root = match &run.run_root {
            Some(r) => r.clone(),
            None => fail!("run not committed"),
        };
        if it.grade > 1 {
            fail!("grade must be 0 or 1");
        }
        if it.run_proof.len() != tree_depth(suite.n) {
            fail!("run proof has wrong length");
        }
        let rleaf = run_leaf(it.idx, &res.request_sha256, &res.response_sha256, &it.signature, it.grade);
        match merkle_root_from_proof(rleaf, it.idx, &it.run_proof) {
            Ok(r) if to_hex(&r) == run_root => {}
            Ok(_) => fail!("run Merkle proof does not match committed run root (request, response, signature or grade changed)"),
            Err(e) => fail!("run proof: {e}"),
        }
        // 4. grade must equal the committed grade vector entry
        let committed = run.grades.as_ref().map(|g| g.as_bytes()[it.idx as usize] - b'0');
        if committed != Some(it.grade) {
            fail!("grade differs from committed grade vector");
        }
        // 5. NEAR AI Cloud TEE signature (EIP-191 ECDSA) by a pinned signer for this model
        res.signed_text = signed_text(&run.model, &res.request_sha256, &res.response_sha256);
        let addr = match recover_eth_address(&res.signed_text, &it.signature) {
            Ok(a) => format!("0x{}", to_hex(&a)),
            Err(e) => fail!("signature: {e}"),
        };
        res.recovered_signer = Some(addr.clone());
        if !run.signers.iter().any(|p| *p == addr) {
            fail!("signature not from a signer pinned for {} when this run started", run.model);
        }
        // 6. deterministic re-grade: choices[0].message.content of a finished (stop) response, strict integer
        res.model_answer = response_answer(&it.response);
        res.correct = res.model_answer == Some(it.answer);
        if (res.correct as u8) != it.grade {
            let got = res.model_answer.map_or("none".to_string(), |a| a.to_string());
            fail!("re-grade mismatch: model answered {}, key {}, committed grade {}", got, it.answer, it.grade);
        }
        res.ok = true;
        res.reason = "all checks passed".into();
        res
    }
}

#[cfg(test)]
mod tests;
