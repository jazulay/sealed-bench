//! Pure verification helpers: leaf encodings, Merkle proofs, request building,
//! NEAR AI Cloud ECDSA (EIP-191) signature recovery, and answer extraction.
//! The CLI (cli/src/lib.ts) mirrors every function byte-for-byte.

use near_sdk::env;

pub const ITEM_LEAF_TAG: &str = "sb-item-v1";
pub const RUN_LEAF_TAG: &str = "sb-run-v1";

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0xf) as usize] as char);
    }
    s
}

pub fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    let s = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")).unwrap_or(s);
    if s.len() % 2 != 0 {
        return Err("odd-length hex".into());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let b = s.as_bytes();
    for i in (0..b.len()).step_by(2) {
        let hi = (b[i] as char).to_digit(16).ok_or("bad hex")?;
        let lo = (b[i + 1] as char).to_digit(16).ok_or("bad hex")?;
        out.push((hi * 16 + lo) as u8);
    }
    Ok(out)
}

pub fn hex32(s: &str) -> Result<[u8; 32], String> {
    let v = from_hex(s)?;
    v.try_into().map_err(|_| "expected 32-byte hex".to_string())
}

pub fn sha256(data: &[u8]) -> [u8; 32] {
    env::sha256_array(data)
}

/// leaf = sha256(0x00 || "sb-item-v1\n{idx}\n{salt}\n{answer}\n{question}")
pub fn item_leaf(idx: u32, salt_hex: &str, answer: i64, question: &str) -> [u8; 32] {
    let mut buf = vec![0u8];
    buf.extend_from_slice(
        format!("{ITEM_LEAF_TAG}\n{idx}\n{}\n{answer}\n{question}", salt_hex.to_lowercase()).as_bytes(),
    );
    sha256(&buf)
}

/// leaf = sha256(0x00 || "sb-run-v1\n{idx}\n{req_hash}\n{resp_hash}\n{sig}\n{grade}")
pub fn run_leaf(idx: u32, req_hash_hex: &str, resp_hash_hex: &str, sig_hex: &str, grade: u8) -> [u8; 32] {
    let sig = sig_hex.strip_prefix("0x").unwrap_or(sig_hex).to_lowercase();
    let mut buf = vec![0u8];
    buf.extend_from_slice(
        format!("{RUN_LEAF_TAG}\n{idx}\n{req_hash_hex}\n{resp_hash_hex}\n{sig}\n{grade}").as_bytes(),
    );
    sha256(&buf)
}

pub fn node(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut buf = Vec::with_capacity(65);
    buf.push(1u8);
    buf.extend_from_slice(left);
    buf.extend_from_slice(right);
    sha256(&buf)
}

/// Positional Merkle proof. At each level the bit of `idx` says whether the
/// current node is a right child. Odd levels duplicate the last node.
pub fn merkle_root_from_proof(leaf: [u8; 32], idx: u32, proof: &[String]) -> Result<[u8; 32], String> {
    let mut cur = leaf;
    let mut i = idx;
    for sib_hex in proof {
        let sib = hex32(sib_hex)?;
        cur = if i & 1 == 0 { node(&cur, &sib) } else { node(&sib, &cur) };
        i >>= 1;
    }
    Ok(cur)
}

/// Depth of a tree with n leaves (number of proof elements).
pub fn tree_depth(n: u32) -> usize {
    let mut d = 0;
    let mut w = n.max(1);
    while w > 1 {
        w = (w + 1) / 2;
        d += 1;
    }
    d
}

/// Minimal JSON string encoder (RFC 8259) matching JavaScript JSON.stringify.
pub fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn valid_model_id(m: &str) -> bool {
    !m.is_empty() && m.len() <= 128 && m.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-/:".contains(&b))
}

/// Substitute {MODEL}, {NONCE} and {QUESTION} (JSON-quoted) into the suite template.
pub fn build_request(template: &str, model: &str, nonce_hex: &str, question: &str) -> String {
    template
        .replace("{MODEL}", model)
        .replace("{NONCE}", nonce_hex)
        .replace("{QUESTION}", &json_string(question))
}

/// EIP-191 personal_sign digest: keccak256("\x19Ethereum Signed Message:\n" + len + msg).
pub fn eip191_hash(msg: &[u8]) -> [u8; 32] {
    let mut buf = format!("\x19Ethereum Signed Message:\n{}", msg.len()).into_bytes();
    buf.extend_from_slice(msg);
    env::keccak256_array(&buf)
}

/// Recover the 20-byte Ethereum address that signed `text` (EIP-191) with a 65-byte r||s||v signature.
pub fn recover_eth_address(text: &str, sig_hex: &str) -> Result<[u8; 20], String> {
    let sig = from_hex(sig_hex)?;
    if sig.len() != 65 {
        return Err(format!("signature must be 65 bytes, got {}", sig.len()));
    }
    let v = match sig[64] {
        27 | 28 => sig[64] - 27,
        0 | 1 => sig[64],
        other => return Err(format!("bad recovery id {other}")),
    };
    let hash = eip191_hash(text.as_bytes());
    let pk = env::ecrecover(&hash, &sig[..64], v, false).ok_or("ecrecover failed")?;
    let h = env::keccak256_array(&pk);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&h[12..]);
    Ok(addr)
}

/// NEAR AI Cloud provider_tee signed text: "{model}:{sha256(req)}:{sha256(resp)}".
pub fn signed_text(model: &str, req_hash_hex: &str, resp_hash_hex: &str) -> String {
    format!("{model}:{req_hash_hex}:{resp_hash_hex}")
}

/// Answers (keys and model answers) must satisfy |x| < 10^15, so JavaScript numbers hold them exactly.
pub const MAX_ANSWER_ABS: u64 = 1_000_000_000_000_000;

/// A salt is exactly 64 lowercase hex chars (32 bytes). This keeps the newline-delimited leaf unambiguous.
pub fn is_salt(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Request-template policy: deterministic, single-sample decoding. Exactly one `"temperature":0,`,
/// exactly one `"stream":false`, and no `"n":`, `"best_of"`, `"logit_bias"`, `"seed"` keys.
/// (A system prompt can still carry hints; it is public in the suite and should be read.)
pub fn template_policy(t: &str) -> Result<(), String> {
    if t.matches("\"temperature\"").count() != 1 || !t.contains("\"temperature\":0,") {
        return Err("template must set \"temperature\":0 exactly once".into());
    }
    if t.matches("\"stream\"").count() != 1 || !t.contains("\"stream\":false") {
        return Err("template must set \"stream\":false exactly once".into());
    }
    for k in ["\"n\":", "\"best_of\"", "\"logit_bias\"", "\"seed\""] {
        if t.contains(k) {
            return Err(format!("template may not set {k}"));
        }
    }
    Ok(())
}

/// The text that is graded: `choices[0].message.content` of the raw chat-completion body, only if
/// `choices[0].finish_reason == "stop"`. Anything else (not JSON, other paths, null content, a
/// max_tokens cut-off with finish_reason "length") yields None, i.e. graded wrong. Reasoning text
/// (`reasoning_content`) is never read.
pub fn final_content(raw: &str) -> Option<String> {
    let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(raw).ok()?;
    let c0 = v.get("choices")?.get(0)?;
    if c0.get("finish_reason")?.as_str()? != "stop" {
        return None;
    }
    Some(c0.get("message")?.get("content")?.as_str()?.to_string())
}

/// Strict final-answer parser over decoded content. Takes the LAST "ANSWER:" and requires, after it:
/// optional spaces/tabs/'*'/'$', an optional '-', then an integer (plain digits, or 1-3 digits followed
/// by ",ddd" groups), |x| < 10^15, and then nothing but whitespace and '*', '$', '.' to the end.
/// So "4.9", "4/5", "4%", "4e5", "4 or maybe 9" and "4\nmore text" all yield None.
pub fn parse_final_answer(content: &str) -> Option<i64> {
    let pos = content.rfind("ANSWER:")?;
    let rest = content[pos + "ANSWER:".len()..].as_bytes();
    let mut i = 0;
    while i < rest.len() && matches!(rest[i], b' ' | b'\t' | b'*' | b'$') {
        i += 1;
    }
    let neg = i < rest.len() && rest[i] == b'-';
    if neg {
        i += 1;
    }
    let start = i;
    while i < rest.len() && (rest[i].is_ascii_digit() || rest[i] == b',') {
        i += 1;
    }
    let num = &rest[start..i];
    if num.is_empty() || !num[0].is_ascii_digit() || *num.last().unwrap() == b',' {
        return None;
    }
    let digits: Vec<u8> = if num.contains(&b',') {
        let groups: Vec<&[u8]> = num.split(|b| *b == b',').collect();
        if groups[0].is_empty() || groups[0].len() > 3 || groups[1..].iter().any(|g| g.len() != 3) {
            return None;
        }
        groups.concat()
    } else {
        num.to_vec()
    };
    if !rest[i..].iter().all(|b| b.is_ascii_whitespace() || matches!(b, b'*' | b'$' | b'.')) {
        return None;
    }
    if digits.len() > 15 || (digits.len() > 1 && digits[0] == b'0') {
        return None;
    }
    let v: i64 = core::str::from_utf8(&digits).ok()?.parse().ok()?;
    if v as u64 >= MAX_ANSWER_ABS {
        return None;
    }
    Some(if neg { -v } else { v })
}

/// Grade input: the strict final answer of a finished response's content.
pub fn response_answer(raw: &str) -> Option<i64> {
    final_content(raw).as_deref().and_then(parse_final_answer)
}

/// Choose k distinct indices in [0, n) from a 32-byte seed (shared by every run in a suite).
pub fn draw_indices(seed: &[u8], suite_id: &str, n: u32, k: u32) -> Vec<u32> {
    let mut out: Vec<u32> = Vec::with_capacity(k as usize);
    let mut ctr: u64 = 0;
    while (out.len() as u32) < k {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"sb-draw-v1");
        buf.extend_from_slice(seed);
        buf.extend_from_slice(suite_id.as_bytes());
        buf.extend_from_slice(&ctr.to_le_bytes());
        let h = sha256(&buf);
        let x = u64::from_le_bytes(h[..8].try_into().unwrap());
        let idx = (x % n as u64) as u32;
        if !out.contains(&idx) {
            out.push(idx);
        }
        ctr += 1;
    }
    out.sort_unstable();
    out
}
