// The ONE place the contract id lives: site.config.json (override at build time with CONTRACT_ID).
import cfg from "../site.config.json";
export const CONTRACT: string = (import.meta.env.VITE_CONTRACT_ID as string | undefined) || cfg.contractId;
export const NETWORK: string = cfg.network;
export const EXPLORER: string = cfg.explorer;
const RPCS: string[] = cfg.rpcs;
let preferred = 0;

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unbytes = (a: number[]) => new TextDecoder().decode(new Uint8Array(a));

export type ViewResult<T> = { value: T; block: number; rpc: string; ms: number };

export async function view<T>(method: string, args: unknown = {}, timeoutMs = 8000): Promise<ViewResult<T>> {
  let lastErr: unknown;
  const enc = b64(JSON.stringify(args));
  for (let i = 0; i < RPCS.length; i++) {
    const idx = (preferred + i) % RPCS.length, url = RPCS[idx];
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs), t0 = performance.now();
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
        body: JSON.stringify({ jsonrpc: "2.0", id: "sb", method: "query", params: { request_type: "call_function", finality: "final", account_id: CONTRACT, method_name: method, args_base64: enc } }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error?.cause?.info?.error_message ?? j.error?.data ?? JSON.stringify(j.error));
      if (j.result?.error) throw new ContractError(String(j.result.error));
      preferred = idx;
      return { value: JSON.parse(unbytes(j.result.result)) as T, block: j.result.block_height, rpc: new URL(url).host, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      lastErr = e;
      if (e instanceof ContractError) throw e;
    } finally { clearTimeout(t); }
  }
  throw lastErr;
}
export class ContractError extends Error {}

export const tx = (h: string) => `${EXPLORER}/txns/${h}`;
export const acct = (a: string) => `${EXPLORER}/address/${a}`;
