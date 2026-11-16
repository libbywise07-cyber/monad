"use client";
// Talks to Monad testnet: reads with the public RPC (no wallet needed), writes through the
// student's browser wallet (MetaMask or any injected wallet).
import { createPublicClient, defineChain, encodeDeployData, encodeFunctionData, formatEther, http, parseEther, parseEventLogs, type Address, type Hash } from "viem";
import artifact from "./campusCart.json";
import { CART_ADDRESS, CHAIN_ID, EXPLORER, RPC_URL, STORE_ADDRESS, USD_PER_MON } from "./config";

export const abi = artifact.abi as typeof artifact.abi;
const bytecode = artifact.bytecode as `0x${string}`;

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Monad Explorer", url: EXPLORER } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

export const STATUS = ["None", "Paid", "Accepted", "Ready", "Completed", "Refunded"] as const;
export type StatusName = (typeof STATUS)[number];

export interface OrderDetails {
  store: string; // store display name
  where?: string; // store street address
  method: "pickup" | "delivery";
  slot: string;
  address?: string; // delivery address
  name?: string; // customer first name
  items: [string, string, number][]; // [name, package, usd]
  subtotal: number;
  fee: number;
  total: number;
  rate: number; // USD per MON used
}

export interface Order {
  id: bigint;
  buyer: Address;
  store: Address;
  amount: bigint;
  placedAt: number;
  updatedAt: number;
  status: StatusName;
  method: "pickup" | "delivery";
  details: OrderDetails | null;
}

// ---------- addresses (code config → env → this browser's saved setup) ----------
const LS = { cart: "campusfuel.monad.cart", store: "campusfuel.monad.store" };
const ls = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
export const saveAddress = (which: "cart" | "store", v: string) => {
  try {
    localStorage.setItem(LS[which], v);
  } catch {
    /* storage unavailable */
  }
};
export const cartAddress = () => (process.env.NEXT_PUBLIC_CART_ADDRESS || CART_ADDRESS || ls(LS.cart)) as Address | "";
export const storeAddress = () => (process.env.NEXT_PUBLIC_STORE_ADDRESS || STORE_ADDRESS || ls(LS.store)) as Address | "";

export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const usdToMon = (usd: number) => usd / USD_PER_MON;
export const fmtMon = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return `${n < 0.01 ? n.toFixed(5) : n.toFixed(4)} MON`;
};

// ---------- wallet ----------
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void };
export const eth = (): Eth | null => (typeof window !== "undefined" ? ((window as unknown as { ethereum?: Eth }).ethereum ?? null) : null);

export async function connectWallet(): Promise<Address> {
  const w = eth();
  if (!w) throw new Error("No wallet found. Install MetaMask (metamask.io), then reload this page.");
  const accounts = (await w.request({ method: "eth_requestAccounts" })) as Address[];
  await ensureMonad();
  return accounts[0];
}

export async function currentAccount(): Promise<Address | null> {
  const w = eth();
  if (!w) return null;
  const accounts = (await w.request({ method: "eth_accounts" })) as Address[];
  return accounts[0] ?? null;
}

/** Switch the wallet to Monad testnet, adding the network first if the wallet doesn't know it. */
export async function ensureMonad() {
  const w = eth()!;
  const hex = "0x" + CHAIN_ID.toString(16);
  const now = (await w.request({ method: "eth_chainId" })) as string;
  if (parseInt(now, 16) === CHAIN_ID) return;
  try {
    await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw e;
    await w.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: hex, chainName: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: [RPC_URL], blockExplorerUrls: [EXPLORER] }],
    });
  }
}

async function send(from: Address, tx: { to?: Address; data: `0x${string}`; value?: bigint }): Promise<Hash> {
  await ensureMonad();
  const params: Record<string, string> = { from, data: tx.data };
  if (tx.to) params.to = tx.to;
  if (tx.value) params.value = "0x" + tx.value.toString(16);
  // Estimate gas ourselves (+20%) instead of trusting each wallet's default. Monad charges by the gas
  // limit, so a tight, accurate limit keeps fees low; estimating also surfaces reverts before signing.
  const est = await publicClient.estimateGas({ account: from, to: tx.to, data: tx.data, value: tx.value });
  params.gas = "0x" + ((est * 12n) / 10n).toString(16);
  return (await eth()!.request({ method: "eth_sendTransaction", params: [params] })) as Hash;
}

export const waitFor = (hash: Hash) => publicClient.waitForTransactionReceipt({ hash, pollingInterval: 500 });

export function friendlyError(e: unknown): string {
  const err = e as { code?: number; shortMessage?: string; message?: string };
  if (err.code === 4001) return "You cancelled it in your wallet.";
  const m = err.shortMessage || err.message || String(e);
  if (/insufficient funds/i.test(m)) return "Not enough test MON in this wallet. Get some free at faucet.monad.xyz.";
  return m.split("\n")[0].slice(0, 200);
}

// ---------- contract ----------
export async function deployCart(from: Address) {
  const hash = await send(from, { data: encodeDeployData({ abi, bytecode }) });
  const r = await waitFor(hash);
  if (!r.contractAddress) throw new Error("Deploy failed");
  return { hash, address: r.contractAddress };
}

const call = (from: Address, functionName: string, args: unknown[] = [], value?: bigint) =>
  send(from, { to: cartAddress() as Address, data: encodeFunctionData({ abi, functionName, args } as never), value });

export const registerStore = (from: Address, name: string) => call(from, "registerStore", [name]);
export const acceptOrder = (from: Address, id: bigint) => call(from, "accept", [id]);
export const markReady = (from: Address, id: bigint) => call(from, "markReady", [id]);
export const confirmReceived = (from: Address, id: bigint) => call(from, "confirmReceived", [id]);
export const cancelOrder = (from: Address, id: bigint) => call(from, "cancel", [id]);

export async function placeOrder(from: Address, store: Address, d: OrderDetails) {
  const value = parseEther(usdToMon(d.total).toFixed(6));
  const hash = await call(from, "placeOrder", [store, d.method === "delivery" ? 1 : 0, JSON.stringify(d)], value);
  const r = await waitFor(hash);
  if (r.status !== "success") throw new Error("The payment didn't go through.");
  const ev = parseEventLogs({ abi, logs: r.logs, eventName: "OrderPlaced" } as never)[0] as unknown as { args: { id: bigint } } | undefined;
  return { hash, id: ev?.args.id ?? null };
}

const read = <T,>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: cartAddress() as Address, abi, functionName, args } as never) as Promise<T>;

export const storeNameOf = (a: Address) => read<string>("storeName", [a]);

export async function getOrder(id: bigint): Promise<Order> {
  const o = await read<{ id: bigint; buyer: Address; store: Address; amount: bigint; placedAt: bigint; updatedAt: bigint; status: number; method: number; details: string }>("getOrder", [id]);
  let details: OrderDetails | null = null;
  try {
    details = JSON.parse(o.details);
  } catch {
    details = null;
  }
  return {
    id: o.id,
    buyer: o.buyer,
    store: o.store,
    amount: o.amount,
    placedAt: Number(o.placedAt),
    updatedAt: Number(o.updatedAt),
    status: STATUS[o.status] ?? "None",
    method: o.method === 1 ? "delivery" : "pickup",
    details,
  };
}

export async function ordersFor(who: Address, as: "buyer" | "store"): Promise<Order[]> {
  const ids = await read<bigint[]>(as === "buyer" ? "ordersOfBuyer" : "ordersOfStore", [who]);
  const list = await Promise.all([...ids].reverse().slice(0, 25).map((id) => getOrder(id)));
  return list;
}

export const balanceOf = (a: Address) => publicClient.getBalance({ address: a });
