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

/// The bytes of the first `"content":"` JSON string value in a raw chat-completion body, up to its
/// closing unescaped quote (still JSON-escaped). Reasoning models put `reasoning_content` AFTER
/// `content`, and their reasoning often repeats "ANSWER: <integer>", so grading must only read the
/// final answer text. The marker cannot occur inside a JSON string value: a quote inside a string
/// is always escaped as \" so `"content":"` there would read `\"content\":\"`.
pub fn answer_region(raw: &str) -> Option<&str> {
    const MARK: &str = "\"content\":\"";
    match raw.find(MARK) {
        Some(p) => {
            let start = p + MARK.len();
            let b = raw.as_bytes();
            let mut i = start;
            while i < b.len() {
                match b[i] {
                    b'\\' => i += 2,
                    b'"' => return Some(&raw[start..i]),
                    _ => i += 1,
                }
            }
            None
        }
        // Not a chat-completion body (unit-test strings): use it whole, unless it carries reasoning.
        None if raw.contains("reasoning_content") => None,
        None => Some(raw),
    }
}

/// Grade input: the final ANSWER inside the response's `content` field only.
pub fn response_answer(raw: &str) -> Option<i64> {
    answer_region(raw).and_then(extract_answer)
}

/// Take the LAST "ANSWER:" marker in the raw response bytes and parse the integer after it.
/// Skips spaces, '*', '$' and backslash-escapes; drops thousands separators.
pub fn extract_answer(response: &str) -> Option<i64> {
    let pos = response.rfind("ANSWER:")?;
    let rest = &response[pos + "ANSWER:".len()..];
    let mut chars = rest.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c == ' ' || c == '*' || c == '$' {
            chars.next();
        } else {
            break;
        }
    }
    let mut neg = false;
    if chars.peek() == Some(&'-') {
        neg = true;
        chars.next();
    }
    let mut digits = String::new();
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            digits.push(c);
            chars.next();
        } else if c == ',' {
            // thousands separator only if followed by a digit
            let mut look = chars.clone();
            look.next();
            if look.peek().map_or(false, |d| d.is_ascii_digit()) {
                chars.next();
            } else {
                break;
            }
        } else {
            break;
        }
    }
    if digits.is_empty() || digits.len() > 18 {
        return None;
    }
    let v: i64 = digits.parse().ok()?;
    Some(if neg { -v } else { v })
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
