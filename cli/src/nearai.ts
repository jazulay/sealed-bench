// NEAR AI Cloud client: exact-bytes chat completion, response signature fetch, and attestation check.
// The API key comes ONLY from the NEARAI_API_KEY env var.
import { createHash, randomBytes } from "node:crypto";
import { recoverSigner, sha256hex, signedText } from "./lib.ts";

export const NEARAI = process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai/v1";

function key(): string {
  const k = process.env.NEARAI_API_KEY;
  if (!k) throw new Error("NEARAI_API_KEY is not set (real inference needs a NEAR AI Cloud key; use --mock for the DEV-ONLY rehearsal)");
  return k;
}

export interface SignedCompletion {
  request: string; response: string; chat_id: string;
  signature: string; signing_address: string; signature_kind: string; text: string;
}

/** POST the exact request bytes, keep the exact response bytes, then fetch and check the TEE signature. */
export async function signedCompletion(model: string, request: string): Promise<SignedCompletion> {
  const res = await fetch(`${NEARAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "x-no-aliasing": "true", "Accept-Encoding": "identity", Accept: "application/json" },
    body: Buffer.from(request, "utf8"),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  const response = bytes.toString("utf8");
  if (!res.ok) throw new Error(`completion HTTP ${res.status}: ${response.slice(0, 300)}`);
  if (!Buffer.from(response, "utf8").equals(bytes)) throw new Error("response is not round-trippable UTF-8; refusing (hash would not match)");
  const chat_id = JSON.parse(response).id as string;
  let sig: any = null;
  for (let i = 0; i < 6; i++) {
    const s = await fetch(`${NEARAI}/signature/${encodeURIComponent(chat_id)}?signing_algo=ecdsa`, { headers: { Authorization: `Bearer ${key()}`, Accept: "application/json" } });
    if (s.status === 404) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    sig = await s.json();
    if (!s.ok || sig.error_code) throw new Error(`signature unavailable: ${JSON.stringify(sig).slice(0, 300)}`);
    break;
  }
  if (!sig) throw new Error(`no signature recorded for ${chat_id}`);
  if (sig.signature_kind && sig.signature_kind !== "provider_tee") throw new Error(`signature_kind ${sig.signature_kind} is not provider_tee`);
  const expect = signedText(model, sha256hex(request), sha256hex(bytes));
  if (sig.text !== expect) throw new Error(`signed text mismatch:\n got ${sig.text}\nwant ${expect}`);
  if (recoverSigner(sig.text, sig.signature) !== String(sig.signing_address).toLowerCase()) throw new Error("ECDSA signature does not match signing_address");
  return { request, response, chat_id, signature: sig.signature, signing_address: String(sig.signing_address).toLowerCase(), signature_kind: sig.signature_kind ?? "", text: sig.text };
}

const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const hx = (v: string) => Buffer.from(String(v).replace(/^0x/i, ""), "hex");
const H = (alg: string, ...parts: (Buffer | string)[]) => { const h = createHash(alg); for (const p of parts) h.update(p); return h.digest(); };

function replayRtmr3(eventLog: any): Buffer {
  let rt = Buffer.alloc(48);
  for (const e of parse(eventLog)) {
    if (e.imr !== 3) continue;
    const t = Buffer.alloc(4); t.writeUInt32LE(e.event_type);
    const d = H("sha384", t, ":", Buffer.from(e.event, "utf8"), ":", hx(e.event_payload ?? ""));
    if (e.digest && !hx(e.digest).equals(d)) throw new Error(`event digest mismatch: ${e.event}`);
    rt = H("sha384", rt, d);
  }
  return rt;
}

/** Fetch a fresh NEAR model attestation (public, no key) and verify it per docs.near.ai quote-nonce-signer. */
export async function attest(model: string, opts: { offlineReport?: any; nonce?: string; skipDcap?: boolean } = {}) {
  const nonce = opts.nonce ?? randomBytes(32).toString("hex");
  let raw: string;
  if (opts.offlineReport) raw = JSON.stringify(opts.offlineReport);
  else {
    const q = new URLSearchParams({ model, provider: "near", include_tls_fingerprint: "false", signing_algo: "ecdsa", nonce });
    const r = await fetch(`${NEARAI}/attestation/report?${q}`, { headers: { Accept: "application/json", "x-no-aliasing": "true" } });
    raw = await r.text();
    if (!r.ok) throw new Error(`attestation HTTP ${r.status}: ${raw.slice(0, 300)}`);
  }
  const rep = JSON.parse(raw);
  const cands = (rep.model_attestations ?? []).filter((m: any) => m.model_name === model && m.signing_algo === "ecdsa");
  if (cands.length !== 1) throw new Error(`expected exactly one ecdsa model report for ${model}, got ${cands.length}`);
  const m = cands[0];
  const checks: Record<string, string> = {};
  if (String(m.request_nonce).toLowerCase() !== nonce.toLowerCase()) throw new Error("echoed nonce does not match");
  checks.nonce_echo = "ok";
  if (!opts.skipDcap) {
    const { getCollateralAndVerify } = await import("@phala/dcap-qvl");
    const v: any = await getCollateralAndVerify(hx(m.intel_quote));
    checks.dcap_tcb_status = v.status;
    if (v.report.type !== "td10") throw new Error("expected a TDX quote");
    const qd = v.report.data;
    if (qd.tdAttributes[0] & 1) throw new Error("TDX debug mode is enabled");
    const id = hx(m.signing_address);
    if (id.length !== 20) throw new Error("ecdsa signing identity must be 20 bytes");
    if (!Buffer.from(qd.reportData).equals(Buffer.concat([id, Buffer.alloc(12), hx(nonce)]))) throw new Error("report data does not bind the signer and nonce");
    checks.report_data_binds_signer_and_nonce = "ok";
    const compose = parse(m.info.tcb_info).app_compose;
    if (!Buffer.from(qd.mrConfigId).equals(Buffer.concat([Buffer.from([1]), H("sha256", Buffer.from(compose, "utf8")), Buffer.alloc(15)]))) throw new Error("MRCONFIGID does not match app_compose");
    checks.mrconfigid_matches_app_compose = "ok";
    if (!replayRtmr3(m.event_log).equals(Buffer.from(qd.rtMr3))) throw new Error("event log does not match RTMR3");
    checks.rtmr3_replay = "ok";
    checks.app_compose_sha256 = H("sha256", Buffer.from(compose, "utf8")).toString("hex");
  }
  return { model, nonce, signing_address: String(m.signing_address).toLowerCase(), report_sha256: sha256hex(raw), checks, raw };
}
