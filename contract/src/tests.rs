//! Unit tests: verification primitives (incl. an ethers.js-generated EIP-191 vector) and the full
//! commit -> run -> draw -> reveal lifecycle with real secp256k1 signatures (k256).


use super::*;
use k256::ecdsa::SigningKey;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;
use sha3::{Digest, Keccak256};

const MODEL: &str = "Qwen/Qwen3.8-27B";
const TEMPLATE: &str = r#"{"model":"{MODEL}","messages":[{"role":"system","content":"Solve the problem. End with a final line ANSWER: <integer>. Run nonce: {NONCE}"},{"role":"user","content":{QUESTION}}],"temperature":0,"max_tokens":400,"stream":false}"#;

// ---------- primitive tests ----------

#[test]
fn ethers_eip191_vector() {
    // Generated with ethers v6: new Wallet("0x11..11").signMessage(text); verifyMessage() == address.
    let text = "Qwen/Qwen3.8-27B:cde2b0f878a1c163140d450d852af84c0ca78be279fd6b031b33cd24126543e9:6a1033610c680d0a2df88bcb8861cff3c23ed0214b4a590817c984171dce3da8";
    let sig = "0x1cb355ee5f72491f733a87afa53e61caec695d32ccab05f0fca782e0758ebfa63663fd263c0494ba535f76388d2674b9a8af18af4c2d9f6e4e8f1da6ff52b3841c";
    let addr = recover_eth_address(text, sig).unwrap();
    assert_eq!(format!("0x{}", to_hex(&addr)), "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a");
    // the signed text is exactly MODEL:sha256(req):sha256(resp)
    let req = r#"{"model":"Qwen/Qwen3.8-27B"}"#;
    let resp = r#"{"id":"chatcmpl-1","choices":[{"message":{"content":"ANSWER: 42"}}]}"#;
    assert_eq!(signed_text(MODEL, &to_hex(&sha256(req.as_bytes())), &to_hex(&sha256(resp.as_bytes()))), text);
    // one flipped byte of the text recovers a different address
    let other = recover_eth_address(&text.replace("Qwen/", "qwen/"), sig).unwrap();
    assert_ne!(other, addr);
}

#[test]
fn bad_signatures_rejected() {
    assert!(recover_eth_address("x", "0x1234").is_err());
    let mut s = "ab".repeat(64);
    s.push_str("05");
    assert!(recover_eth_address("x", &s).is_err());
}

#[test]
fn extract_answer_cases() {
    assert_eq!(extract_answer("so ANSWER: 42"), Some(42));
    assert_eq!(extract_answer("ANSWER: 1 then ANSWER: 7"), Some(7));
    assert_eq!(extract_answer("ANSWER: **$1,234**"), Some(1234));
    assert_eq!(extract_answer("ANSWER: -5"), Some(-5));
    assert_eq!(extract_answer("ANSWER: 12,\n"), Some(12));
    assert_eq!(extract_answer("ANSWER: none"), None);
    assert_eq!(extract_answer("no marker 42"), None);
    assert_eq!(extract_answer("ANSWER: 1234567890123456789"), None);
}

#[test]
fn json_string_matches_js() {
    assert_eq!(json_string("a\"b\\c\nd\u{1}é"), "\"a\\\"b\\\\c\\nd\\u0001é\"");
}

#[test]
fn draw_is_distinct_sorted_and_deterministic() {
    let a = draw_indices(&[7u8; 32], "s", 100, 20);
    assert_eq!(a.len(), 20);
    assert!(a.windows(2).all(|w| w[0] < w[1]));
    assert!(a.iter().all(|i| *i < 100));
    assert_eq!(a, draw_indices(&[7u8; 32], "s", 100, 20));
    assert_ne!(a, draw_indices(&[8u8; 32], "s", 100, 20));
    assert_eq!(draw_indices(&[1u8; 32], "s", 5, 5), vec![0, 1, 2, 3, 4]);
}

// ---------- test harness ----------

fn build_tree(leaves: &[[u8; 32]]) -> Vec<Vec<[u8; 32]>> {
    let mut levels = vec![leaves.to_vec()];
    while levels.last().unwrap().len() > 1 {
        let cur = levels.last().unwrap();
        let mut next = vec![];
        for i in (0..cur.len()).step_by(2) {
            let l = cur[i];
            let r = if i + 1 < cur.len() { cur[i + 1] } else { cur[i] };
            next.push(node(&l, &r));
        }
        levels.push(next);
    }
    levels
}

fn proof(levels: &[Vec<[u8; 32]>], mut idx: usize) -> Vec<String> {
    let mut p = vec![];
    for lvl in &levels[..levels.len() - 1] {
        let sib = if idx % 2 == 0 { (idx + 1).min(lvl.len() - 1) } else { idx - 1 };
        p.push(to_hex(&lvl[sib]));
        idx /= 2;
    }
    p
}

fn eth_address(sk: &SigningKey) -> String {
    let pk = sk.verifying_key().to_encoded_point(false);
    let h = Keccak256::digest(&pk.as_bytes()[1..]);
    format!("0x{}", to_hex(&h[12..]))
}

fn sign_eip191(sk: &SigningKey, text: &str) -> String {
    let mut buf = format!("\x19Ethereum Signed Message:\n{}", text.len()).into_bytes();
    buf.extend_from_slice(text.as_bytes());
    let digest = Keccak256::new_with_prefix(&buf);
    let (sig, rid) = sk.sign_digest_recoverable(digest).unwrap();
    let mut out = sig.to_bytes().to_vec();
    out.push(27 + rid.to_byte());
    format!("0x{}", to_hex(&out))
}

struct Item {
    salt: String,
    answer: i64,
    question: String,
}

struct Fx {
    c: SealedBench,
    items: Vec<Item>,
    suite_levels: Vec<Vec<[u8; 32]>>,
    height: u64,
    key: SigningKey,
}

fn ctx(pred: usize, height: u64, deposit: NearToken, seed: u8) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(accounts(pred))
        .signer_account_id(accounts(pred))
        .block_height(height)
        .attached_deposit(deposit)
        .random_seed([seed; 32]);
    testing_env!(b.build());
}

const N: u32 = 10;
const K: u32 = 4;

fn setup() -> Fx {
    ctx(0, 100, NearToken::from_near(0), 1);
    let mut c = SealedBench::new(accounts(0));
    let key = SigningKey::from_slice(&[0x42u8; 32]).unwrap();
    c.pin_signer(MODEL.into(), eth_address(&key), "ab".repeat(32), "test signer".into());
    let items: Vec<Item> = (0..N)
        .map(|i| Item { salt: format!("{:064x}", i as u64 * 7919 + 1), answer: (i as i64) * 3 + 1, question: format!("What is {} * 3 + 1?\nShow work.", i) })
        .collect();
    let leaves: Vec<_> = items.iter().enumerate().map(|(i, it)| item_leaf(i as u32, &it.salt, it.answer, &it.question)).collect();
    let suite_levels = build_tree(&leaves);
    let root = to_hex(&suite_levels.last().unwrap()[0]);
    ctx(1, 101, NearToken::from_millinear(100), 2);
    c.commit_suite("s1".into(), root, N, K, TEMPLATE.into(), 5, 50, "unit".into());
    Fx { c, items, suite_levels, height: 101, key }
}

struct RunArt {
    responses: Vec<String>,
    sigs: Vec<String>,
    grades: Vec<u8>,
    levels: Vec<Vec<[u8; 32]>>,
}

/// Simulate a model run: correct on even indices, wrong on odd ones. Signs each response like NEAR AI.
fn do_run(fx: &mut Fx, model: &str, key: &SigningKey) -> RunArt {
    fx.height += 1;
    ctx(1, fx.height, NearToken::from_near(0), 3);
    let nonce = fx.c.start_run("s1".into(), model.into());
    let mut responses = vec![];
    let mut sigs = vec![];
    let mut grades = vec![];
    let mut leaves = vec![];
    for (i, it) in fx.items.iter().enumerate() {
        let req = build_request(TEMPLATE, model, &nonce, &it.question);
        let ans = if i % 2 == 0 { it.answer } else { it.answer + 1 };
        let resp = format!(r#"{{"id":"chatcmpl-{i}","choices":[{{"message":{{"content":"work...\nANSWER: {ans}"}}}}]}}"#);
        let rh = to_hex(&sha256(req.as_bytes()));
        let sh = to_hex(&sha256(resp.as_bytes()));
        let sig = sign_eip191(key, &signed_text(model, &rh, &sh));
        let g = if extract_answer(&resp) == Some(it.answer) { 1 } else { 0 };
        leaves.push(run_leaf(i as u32, &rh, &sh, &sig, g));
        responses.push(resp);
        sigs.push(sig);
        grades.push(g);
    }
    let levels = build_tree(&leaves);
    let root = to_hex(&levels.last().unwrap()[0]);
    let gs: String = grades.iter().map(|g| if *g == 1 { '1' } else { '0' }).collect();
    let score = fx.c.commit_run("s1".into(), model.into(), root, gs);
    assert_eq!(score, (N + 1) / 2);
    RunArt { responses, sigs, grades, levels }
}

fn reveal_item(fx: &Fx, ra: &RunArt, idx: u32) -> RevealItem {
    let it = &fx.items[idx as usize];
    RevealItem {
        idx,
        salt: it.salt.clone(),
        answer: it.answer,
        question: it.question.clone(),
        response: ra.responses[idx as usize].clone(),
        signature: ra.sigs[idx as usize].clone(),
        grade: ra.grades[idx as usize],
        suite_proof: proof(&fx.suite_levels, idx as usize),
        run_proof: proof(&ra.levels, idx as usize),
    }
}

fn draw(fx: &mut Fx) -> Vec<u32> {
    fx.height += 10;
    ctx(3, fx.height, NearToken::from_near(0), 9);
    fx.c.draw_challenge("s1".into())
}

// ---------- lifecycle tests ----------

#[test]
fn honest_run_is_audited_and_bond_returned() {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    assert_eq!(ch.len(), K as usize);
    fx.height += 1;
    ctx(1, fx.height, NearToken::from_near(0), 4);
    // free view check first
    let r = fx.c.check_reveal("s1".into(), MODEL.into(), reveal_item(&fx, &ra, ch[0]));
    assert!(r.ok, "{}", r.reason);
    assert_eq!(r.recovered_signer.unwrap(), eth_address(&key));
    let items: Vec<_> = ch.iter().map(|i| reveal_item(&fx, &ra, *i)).collect();
    let st = fx.c.reveal("s1".into(), MODEL.into(), items);
    assert_eq!(st, RunStatus::Audited);
    let a = fx.c.get_audit("s1".into(), MODEL.into());
    assert_eq!(a.revealed, K);
    assert!(a.claim.contains("sampled entries verified"));
    assert!(fx.c.get_suite("s1".into()).unwrap().bond_returned);
}

#[test]
fn reveal_in_batches() {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), vec![reveal_item(&fx, &ra, ch[0]), reveal_item(&fx, &ra, ch[1])]), RunStatus::Committed);
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), vec![reveal_item(&fx, &ra, ch[2]), reveal_item(&fx, &ra, ch[3])]), RunStatus::Audited);
}

fn expect_fail(mutate: impl Fn(&mut RevealItem), needle: &str) {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    let mut it = reveal_item(&fx, &ra, ch[0]);
    mutate(&mut it);
    let view = fx.c.check_reveal("s1".into(), MODEL.into(), it.clone());
    assert!(!view.ok);
    assert!(view.reason.contains(needle), "reason was: {}", view.reason);
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), vec![it]), RunStatus::Failed);
    let run = fx.c.get_run("s1".into(), MODEL.into()).unwrap();
    assert!(run.fail_reason.unwrap().contains(needle));
    assert!(!fx.c.get_suite("s1".into()).unwrap().bond_returned);
}

#[test]
fn tampered_response_fails() {
    expect_fail(|it| it.response = it.response.replace("ANSWER:", "ANSWER: 9"), "run Merkle proof");
}

#[test]
fn tampered_question_fails() {
    expect_fail(|it| it.question.push(' '), "suite Merkle proof");
}

#[test]
fn tampered_answer_key_fails() {
    expect_fail(|it| it.answer += 1, "suite Merkle proof");
}

#[test]
fn flipped_grade_fails() {
    expect_fail(|it| it.grade ^= 1, "run Merkle proof");
}

#[test]
fn garbage_signature_fails() {
    expect_fail(|it| it.signature = format!("0x{}1b", "00".repeat(64)), "run Merkle proof");
}

#[test]
fn wrong_signer_fails_even_with_consistent_commitments() {
    // Owner signs with their own key instead of the NEAR AI TEE key; all Merkle data is consistent.
    let mut fx = setup();
    let rogue = SigningKey::from_slice(&[0x07u8; 32]).unwrap();
    let ra = do_run(&mut fx, MODEL, &rogue);
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    let it = reveal_item(&fx, &ra, ch[0]);
    let v = fx.c.check_reveal("s1".into(), MODEL.into(), it.clone());
    assert!(v.reason.contains("not from a pinned signer"), "{}", v.reason);
    assert_eq!(v.recovered_signer.unwrap(), eth_address(&rogue));
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), vec![it]), RunStatus::Failed);
}

#[test]
fn inflated_grade_vector_fails_regrade() {
    // Owner commits grade=1 for a wrong answer (consistent run leaf, real signature): re-grade catches it.
    let mut fx = setup();
    let key = fx.key.clone();
    fx.height += 1;
    ctx(1, fx.height, NearToken::from_near(0), 3);
    let nonce = fx.c.start_run("s1".into(), MODEL.into());
    let mut responses = vec![];
    let mut sigs = vec![];
    let mut leaves = vec![];
    for (i, it) in fx.items.iter().enumerate() {
        let req = build_request(TEMPLATE, MODEL, &nonce, &it.question);
        let resp = format!("ANSWER: {}", it.answer + 100); // always wrong
        let rh = to_hex(&sha256(req.as_bytes()));
        let sh = to_hex(&sha256(resp.as_bytes()));
        let sig = sign_eip191(&key, &signed_text(MODEL, &rh, &sh));
        leaves.push(run_leaf(i as u32, &rh, &sh, &sig, 1));
        responses.push(resp);
        sigs.push(sig);
    }
    let levels = build_tree(&leaves);
    fx.c.commit_run("s1".into(), MODEL.into(), to_hex(&levels.last().unwrap()[0]), "1".repeat(N as usize));
    let ra = RunArt { responses, sigs, grades: vec![1; N as usize], levels };
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    let v = fx.c.check_reveal("s1".into(), MODEL.into(), reveal_item(&fx, &ra, ch[0]));
    assert!(v.reason.contains("re-grade mismatch"), "{}", v.reason);
}

#[test]
fn stale_nonce_response_fails() {
    // A response produced for a different nonce (e.g. cached before start_run) does not match the rebuilt request.
    let mut fx = setup();
    let key = fx.key.clone();
    fx.height += 1;
    ctx(1, fx.height, NearToken::from_near(0), 3);
    let _nonce = fx.c.start_run("s1".into(), MODEL.into());
    let fake_nonce = "00".repeat(32);
    let mut responses = vec![];
    let mut sigs = vec![];
    let mut leaves = vec![];
    let mut grades = vec![];
    for (i, it) in fx.items.iter().enumerate() {
        let req = build_request(TEMPLATE, MODEL, &fake_nonce, &it.question);
        let resp = format!("ANSWER: {}", it.answer);
        let rh = to_hex(&sha256(req.as_bytes()));
        let sh = to_hex(&sha256(resp.as_bytes()));
        let sig = sign_eip191(&key, &signed_text(MODEL, &rh, &sh));
        leaves.push(run_leaf(i as u32, &rh, &sh, &sig, 1));
        responses.push(resp);
        sigs.push(sig);
        grades.push(1);
    }
    let levels = build_tree(&leaves);
    fx.c.commit_run("s1".into(), MODEL.into(), to_hex(&levels.last().unwrap()[0]), "1".repeat(N as usize));
    let ra = RunArt { responses, sigs, grades, levels };
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    let v = fx.c.check_reveal("s1".into(), MODEL.into(), reveal_item(&fx, &ra, ch[0]));
    assert!(v.reason.contains("run Merkle proof"), "{}", v.reason);
}

#[test]
fn shared_sample_across_runs() {
    let mut fx = setup();
    let key = fx.key.clone();
    let m2 = "z-ai/glm-5.3-flash";
    ctx(0, fx.height, NearToken::from_near(0), 1);
    fx.c.pin_signer(m2.into(), eth_address(&key), "cd".repeat(32), "".into());
    let ra1 = do_run(&mut fx, MODEL, &key);
    let ra2 = do_run(&mut fx, m2, &key);
    let ch = draw(&mut fx);
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    let i1: Vec<_> = ch.iter().map(|i| reveal_item(&fx, &ra1, *i)).collect();
    let i2: Vec<_> = ch.iter().map(|i| reveal_item(&fx, &ra2, *i)).collect();
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), i1), RunStatus::Audited);
    assert!(!fx.c.get_suite("s1".into()).unwrap().bond_returned);
    assert_eq!(fx.c.reveal("s1".into(), m2.into(), i2), RunStatus::Audited);
    assert!(fx.c.get_suite("s1".into()).unwrap().bond_returned);
}

#[test]
#[should_panic(expected = "too early")]
fn draw_too_early_panics() {
    let mut fx = setup();
    let key = fx.key.clone();
    do_run(&mut fx, MODEL, &key);
    ctx(3, fx.height + 2, NearToken::from_near(0), 9);
    fx.c.draw_challenge("s1".into());
}

#[test]
#[should_panic(expected = "every started run must be committed")]
fn draw_with_uncommitted_run_panics() {
    let mut fx = setup();
    ctx(1, 102, NearToken::from_near(0), 3);
    fx.c.start_run("s1".into(), MODEL.into());
    ctx(3, 500, NearToken::from_near(0), 9);
    fx.c.draw_challenge("s1".into());
}

#[test]
#[should_panic(expected = "challenge already drawn")]
fn no_new_runs_after_draw() {
    let mut fx = setup();
    let key = fx.key.clone();
    do_run(&mut fx, MODEL, &key);
    draw(&mut fx);
    ctx(0, fx.height, NearToken::from_near(0), 1);
    fx.c.pin_signer("z-ai/glm-5.3-flash".into(), eth_address(&key), "cd".repeat(32), "".into());
    ctx(1, fx.height + 1, NearToken::from_near(0), 3);
    fx.c.start_run("s1".into(), "z-ai/glm-5.3-flash".into());
}

#[test]
#[should_panic(expected = "no pinned signer")]
fn unpinned_model_rejected() {
    let mut fx = setup();
    ctx(1, 102, NearToken::from_near(0), 3);
    fx.c.start_run("s1".into(), "some/other-model".into());
}

#[test]
#[should_panic(expected = "suite owner only")]
fn only_owner_reveals() {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    ctx(3, fx.height + 1, NearToken::from_near(0), 4);
    fx.c.reveal("s1".into(), MODEL.into(), vec![reveal_item(&fx, &ra, ch[0])]);
}

#[test]
#[should_panic(expected = "not in challenge set")]
fn non_challenged_index_rejected() {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    let other = (0..N).find(|i| !ch.contains(i)).unwrap();
    ctx(1, fx.height + 1, NearToken::from_near(0), 4);
    fx.c.reveal("s1".into(), MODEL.into(), vec![reveal_item(&fx, &ra, other)]);
}

#[test]
fn reveal_deadline_timeout_fails() {
    let mut fx = setup();
    let key = fx.key.clone();
    let ra = do_run(&mut fx, MODEL, &key);
    let ch = draw(&mut fx);
    let deadline = fx.c.get_suite("s1".into()).unwrap().reveal_deadline.unwrap();
    // late reveal -> FAILED
    ctx(1, deadline + 1, NearToken::from_near(0), 4);
    assert_eq!(fx.c.reveal("s1".into(), MODEL.into(), vec![reveal_item(&fx, &ra, ch[0])]), RunStatus::Failed);
}

#[test]
fn expire_marks_unrevealed_runs_failed() {
    let mut fx = setup();
    let key = fx.key.clone();
    do_run(&mut fx, MODEL, &key);
    draw(&mut fx);
    let deadline = fx.c.get_suite("s1".into()).unwrap().reveal_deadline.unwrap();
    ctx(4, deadline + 1, NearToken::from_near(0), 4);
    assert_eq!(fx.c.expire("s1".into()), 1);
    let r = fx.c.get_run("s1".into(), MODEL.into()).unwrap();
    assert_eq!(r.status, RunStatus::Failed);
    assert_eq!(r.fail_reason.unwrap(), "reveal deadline passed");
}

#[test]
#[should_panic(expected = "suite exists")]
fn suite_is_permanent() {
    let mut fx = setup();
    ctx(1, 200, NearToken::from_millinear(100), 2);
    fx.c.commit_suite("s1".into(), "00".repeat(32), N, K, TEMPLATE.into(), 5, 50, "".into());
}

#[test]
#[should_panic(expected = "bond")]
fn bond_required() {
    let mut fx = setup();
    ctx(1, 200, NearToken::from_millinear(1), 2);
    fx.c.commit_suite("s2".into(), "00".repeat(32), N, K, TEMPLATE.into(), 5, 50, "".into());
}

#[test]
fn build_request_view_matches_local() {
    let mut fx = setup();
    ctx(1, 102, NearToken::from_near(0), 3);
    let nonce = fx.c.start_run("s1".into(), MODEL.into());
    let q = "He said \"hi\"\nthen left.";
    assert_eq!(fx.c.build_request_for("s1".into(), MODEL.into(), q.into()), build_request(TEMPLATE, MODEL, &nonce, q));
}
