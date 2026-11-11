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
} as { network: string; rpc: string; contractId: string; admin: string; owner: string; explorer: string };
export const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? CONFIG.rpc });

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId: CONFIG.contractId, method, args })) as T;
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
