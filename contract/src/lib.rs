//! Sealed Bench: sampled on-chain audits of private AI evaluations.
//!
//! Flow: commit_suite -> start_run (per model, chain nonce) -> commit_run (run root + full
//! grade vector, score computed on-chain) -> draw_challenge (permissionless, after a delay,
//! one shared sample for every run) -> reveal (owner, before deadline) -> AUDITED / FAILED.

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

pub mod verify;
use verify::*;

pub const MIN_BOND: NearToken = NearToken::from_millinear(100); // 0.1 NEAR (nominal, testnet)
pub const MAX_N: u32 = 4096;
pub const MAX_K: u32 = 64;
pub const MAX_REVEAL_BATCH: usize = 8;

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Suites,
    Runs,
    Signers,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum RunStatus {
    Started,
    Committed,
    Audited,
    Failed,
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
    pub models: Vec<String>,
    pub last_run_commit_height: u64,
    pub challenge: Option<Vec<u32>>,
    pub draw_height: Option<u64>,
    pub draw_seed: Option<String>,
    pub drawn_by: Option<AccountId>,
    pub reveal_deadline: Option<u64>,
    pub bond_returned: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Run {
    pub suite_id: String,
    pub model: String,
    pub nonce: String,
    pub start_height: u64,
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
    pub reveal_deadline: Option<u64>,
    pub fail_reason: Option<String>,
    pub claim: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealedBench {
    admin: AccountId,
    suites: IterableMap<String, Suite>,
    runs: LookupMap<String, Run>,
    signers: LookupMap<String, Vec<SignerPin>>,
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
        let pin = SignerPin {
            address: format!("0x{}", to_hex(&a)),
            attestation_sha256: attestation_sha256.to_lowercase(),
            pinned_height: env::block_height(),
            note,
        };
        let mut list = self.signers.get(&model).cloned().unwrap_or_default();
        if !list.iter().any(|p| p.address == pin.address) {
            list.push(pin);
        }
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
        note: String,
    ) {
        require!(!suite_id.is_empty() && suite_id.len() <= 64 && !suite_id.contains('|'), "bad suite id");
        require!(self.suites.get(&suite_id).is_none(), "suite exists (commitments are permanent)");
        require!(hex32(&root).is_ok(), "root must be 32-byte hex");
        require!(n >= 1 && n <= MAX_N, "bad n");
        require!(k >= 1 && k <= n && k <= MAX_K, "bad k");
        require!(
            request_template.contains("{MODEL}") && request_template.contains("{NONCE}") && request_template.contains("{QUESTION}"),
            "template needs {MODEL} {NONCE} {QUESTION}"
        );
        require!(challenge_delay_blocks >= 1 && reveal_window_blocks >= 10, "bad windows");
        let bond = env::attached_deposit();
        require!(bond >= MIN_BOND, "attach a bond of at least 0.1 NEAR");
        let suite = Suite {
            id: suite_id.clone(),
            owner: env::predecessor_account_id(),
            root: hex32(&root).map(|r| to_hex(&r)).unwrap(),
            n,
            k,
            request_template,
            note,
            bond,
            commit_height: env::block_height(),
            challenge_delay: challenge_delay_blocks,
            reveal_window: reveal_window_blocks,
            models: vec![],
            last_run_commit_height: 0,
            challenge: None,
            draw_height: None,
            draw_seed: None,
            drawn_by: None,
            reveal_deadline: None,
            bond_returned: false,
        };
        env::log_str(&format!("EVENT commit_suite {suite_id} root={} n={n} k={k}", suite.root));
        self.suites.insert(suite_id, suite);
    }

    /// Start a run: the contract derives a nonce from chain randomness that every request must embed,
    /// so no response can be produced before this point.
    pub fn start_run(&mut self, suite_id: String, model: String) -> String {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(env::predecessor_account_id() == suite.owner, "suite owner only");
        require!(suite.challenge.is_none(), "challenge already drawn; suite is closed");
        require!(valid_model_id(&model), "bad model id");
        require!(self.signers.get(&model).map_or(false, |l| !l.is_empty()), "no pinned signer for model");
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

    /// Permissionless. Allowed once every started run is committed and `challenge_delay` blocks have
    /// passed since the last run commit. First call wins; one sample shared by all runs.
    pub fn draw_challenge(&mut self, suite_id: String) -> Vec<u32> {
        let mut suite = self.suite_or_panic(&suite_id);
        require!(suite.challenge.is_none(), "already drawn");
        require!(!suite.models.is_empty(), "no runs");
        for m in &suite.models {
            let r = self.runs.get(&run_key(&suite_id, m)).unwrap();
            require!(r.status == RunStatus::Committed, "every started run must be committed first");
        }
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

        if env::block_height() > suite.reveal_deadline.unwrap() {
            run.status = RunStatus::Failed;
            run.fail_reason = Some("reveal deadline passed".into());
            self.runs.insert(key, run);
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

        // Return the nominal bond once every run in the suite is AUDITED.
        if !suite.bond_returned
            && suite.models.iter().all(|m| self.runs.get(&run_key(&suite_id, m)).map_or(false, |r| r.status == RunStatus::Audited))
        {
            suite.bond_returned = true;
            Promise::new(suite.owner.clone()).transfer(suite.bond).detach();
            self.suites.insert(suite_id, suite);
        }
        status
    }

    /// Permissionless: after the reveal deadline, any run not AUDITED becomes FAILED.
    pub fn expire(&mut self, suite_id: String) -> u32 {
        let suite = self.suite_or_panic(&suite_id);
        let deadline = suite.reveal_deadline.unwrap_or_else(|| env::panic_str("challenge not drawn"));
        require!(env::block_height() > deadline, "deadline not reached");
        let mut failed = 0;
        for m in &suite.models {
            let key = run_key(&suite_id, m);
            let mut r = self.runs.get(&key).cloned().unwrap();
            if r.status == RunStatus::Committed {
                r.status = RunStatus::Failed;
                r.fail_reason = Some("reveal deadline passed".into());
                self.runs.insert(key, r);
                failed += 1;
            }
        }
        failed
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

    pub fn list_suites(&self) -> Vec<String> {
        self.suites.keys().cloned().collect()
    }

    pub fn get_run(&self, suite_id: String, model: String) -> Option<Run> {
        self.runs.get(&run_key(&suite_id, &model)).cloned()
    }

    pub fn get_audit(&self, suite_id: String, model: String) -> AuditView {
        let suite = self.suite_or_panic(&suite_id);
        let run = self.runs.get(&run_key(&suite_id, &model)).cloned().unwrap_or_else(|| env::panic_str("no such run"));
        let claim = match run.status {
            RunStatus::Audited => format!(
                "Owner-reported score {}/{}; {}/{} sampled entries verified on NEAR. Not the probability the score is correct; says nothing about benchmark quality.",
                run.score.unwrap_or(0), suite.n, run.revealed.len(), suite.k
            ),
            RunStatus::Failed => format!("FAILED: {}", run.fail_reason.clone().unwrap_or_default()),
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
            reveal_deadline: suite.reveal_deadline,
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
        let pinned = self.signers.get(&run.model).cloned().unwrap_or_default();
        if !pinned.iter().any(|p| p.address == addr) {
            fail!("signature not from a pinned signer for {}", run.model);
        }
        // 6. deterministic re-grade from raw response bytes
        res.model_answer = extract_answer(&it.response);
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
