// Thin NEAR testnet helpers (near-api-js v7). Keys are read from ~/.near-credentials (near-cli legacy keychain)
// or from NEAR_PRIVATE_KEY; they are never written into the repo.
import { Account, JsonRpcProvider, KeyPairSigner, actions, teraToGas, parseNearAmount } from "near-api-js";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = JSON.parse(readFileSync(join(ROOT, "config", "testnet.json"), "utf8"));
// Env overrides let anyone rehearse the flow with their own testnet accounts.
export const CONFIG = {
  ...FILE,
  contractId: process.env.SB_CONTRACT ?? FILE.contractId,
  admin: process.env.SB_ADMIN ?? FILE.admin,
  owner: process.env.SB_OWNER ?? FILE.owner,
} as { network: string; rpc: string; contractId: string; admin: string; owner: string; drawer: string; explorer: string; wasm_sha256: string };
export const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? CONFIG.rpc });

/** Contract view. Pass `blockId` to pin every read of one verification to the same block. */
export async function view<T>(method: string, args: Record<string, unknown> = {}, blockId?: number): Promise<T> {
  const blockQuery: any = blockId ? { blockId } : { finality: "final" };
  return (await provider.callFunction({ contractId: CONFIG.contractId, method, args, blockQuery } as any)) as T;
}

/** The latest final block, and the contract's code hash (base58 sha256 of the deployed wasm) at that block. */
export async function snapshot(): Promise<{ height: number; hash: string; code_hash: string }> {
  const b: any = await provider.viewBlock({ finality: "final" });
  const a: any = await provider.viewAccount({ accountId: CONFIG.contractId, blockQuery: { blockId: b.header.height } } as any);
  return { height: b.header.height, hash: b.header.hash, code_hash: String(a.code_hash) };
}

function keyFor(accountId: string): string {
  if (process.env.NEAR_PRIVATE_KEY) return process.env.NEAR_PRIVATE_KEY;
  const f = join(homedir(), ".near-credentials", CONFIG.network, `${accountId}.json`);
  if (!existsSync(f)) throw new Error(`no key for ${accountId}: set NEAR_PRIVATE_KEY or create ${f} (near-cli legacy keychain)`);
  return JSON.parse(readFileSync(f, "utf8")).private_key;
}

export interface TxOut { tx: string; explorer: string; result: unknown; logs: string[] }

export async function call(signerId: string, method: string, args: Record<string, unknown>, depositNear = "0", tgas = 300): Promise<TxOut> {
  const acct = new Account(signerId, provider, KeyPairSigner.fromSecretKey(keyFor(signerId) as any));
  const res: any = await acct.signAndSendTransaction({
    receiverId: CONFIG.contractId,
    actions: [actions.functionCall(method, args, teraToGas(tgas), BigInt(parseNearAmount(depositNear) ?? "0"))],
    waitUntil: "FINAL",
  });
  const tx = res.transaction?.hash ?? res.transaction_outcome?.id;
  // A panicked call must never print ok:true (review P1-12).
  if (res.status && typeof res.status === "object" && "Failure" in res.status)
    throw new Error(`transaction ${tx} failed: ${JSON.stringify(res.status.Failure).slice(0, 400)}`);
  const logs = [res.transaction_outcome, ...(res.receipts_outcome ?? [])].flatMap((o: any) => o?.outcome?.logs ?? []);
  let result: unknown = null;
  const sv = res.status?.SuccessValue;
  if (sv) { try { result = JSON.parse(Buffer.from(sv, "base64").toString("utf8")); } catch { result = sv; } }
  return { tx, explorer: `${CONFIG.explorer}/txns/${tx}`, result, logs };
}

export async function blockHeight(): Promise<number> {
  const b: any = await provider.viewBlock({ finality: "final" });
  return b.header.height;
}
