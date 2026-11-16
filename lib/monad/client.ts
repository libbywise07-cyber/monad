"use client";
// Browser side of "checkout with Monad": demo wallets for each role, reads, and writes.
//
// Each role (student, store, driver) gets its own test wallet, created in this browser and kept in
// localStorage. It's a testnet-only demo wallet: no MetaMask, no seed phrase, nothing of real value.
// The app tops it up with a little testnet MON for gas, so nobody has to buy anything.
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodePacked,
  http,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type PrivateKeyAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { campusDollarAbi, groceryCheckoutAbi } from "./abi";
import { CHECKOUT, monadTestnet, TOKEN } from "./config";

export type Role = "student" | "store" | "driver";

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(), pollingInterval: 500 });

const keyName = (role: Role) => `campusfuel.monad.${role}.v1`;

export function getAccount(role: Role): PrivateKeyAccount {
  let key: `0x${string}` | null = null;
  try {
    key = localStorage.getItem(keyName(role)) as `0x${string}` | null;
  } catch {
    /* storage unavailable */
  }
  if (!key) {
    key = generatePrivateKey();
    try {
      localStorage.setItem(keyName(role), key);
    } catch {
      /* storage unavailable: wallet lasts for this page only */
    }
  }
  return privateKeyToAccount(key);
}

// ---------- MetaMask ----------
// Any role can use MetaMask instead of its built-in test wallet. The choice is remembered per role.

type Eip1193 = {
  isMetaMask?: boolean;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
};
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

const MODE = (role: Role) => `campusfuel.monad.${role}.metamask.v1`; // holds the connected address
export const WALLET_EVENT = "campusfuel-wallet";
const notify = () => window.dispatchEvent(new Event(WALLET_EVENT));

export const hasMetaMask = () => typeof window !== "undefined" && Boolean(window.ethereum);

export function metamaskAddress(role: Role): Address | null {
  try {
    return (localStorage.getItem(MODE(role)) as Address | null) || null;
  } catch {
    return null;
  }
}

/** The address this role pays/acts from: MetaMask if connected, otherwise its test wallet. */
export function roleAddress(role: Role): Address {
  return metamaskAddress(role) ?? getAccount(role).address;
}

const CHAIN_HEX = `0x${monadTestnet.id.toString(16)}`; // 0x279f

/** Switch MetaMask to Monad Testnet, adding the network first if it isn't there. */
export async function ensureMonadNetwork(): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error("MetaMask isn't installed.");
  if ((await eth.request({ method: "eth_chainId" })) === CHAIN_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e; // 4902 = network not added yet
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "Monad Testnet",
          nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
          rpcUrls: monadTestnet.rpcUrls.default.http,
          blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
        },
      ],
    });
  }
}

/** Ask MetaMask for an account, put it on Monad Testnet, and use it for this role. */
export async function connectMetaMask(role: Role): Promise<Address> {
  const eth = window.ethereum;
  if (!eth) throw new Error("MetaMask isn't installed. Get it at metamask.io, then refresh this page.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  if (!accounts?.length) throw new Error("MetaMask didn't share an account.");
  await ensureMonadNetwork();
  localStorage.setItem(MODE(role), accounts[0]);
  notify();
  return accounts[0];
}

/** Go back to this role's built-in test wallet. */
export function switchToTestWallet(role: Role) {
  try {
    localStorage.removeItem(MODE(role));
  } catch {
    /* storage unavailable */
  }
  notify();
}

/** Keep the saved address in sync when the user switches accounts inside MetaMask. */
export function watchMetaMask(): () => void {
  const eth = window.ethereum;
  if (!eth?.on) return () => {};
  const onAccounts = (...args: unknown[]) => {
    const next = (args[0] as Address[] | undefined)?.[0];
    (["student", "store", "driver"] as Role[]).forEach((r) => {
      if (!metamaskAddress(r)) return;
      if (next) localStorage.setItem(MODE(r), next);
      else localStorage.removeItem(MODE(r));
    });
    notify();
  };
  eth.on("accountsChanged", onAccounts);
  return () => eth.removeListener?.("accountsChanged", onAccounts);
}

async function walletFor(role: Role) {
  const mm = metamaskAddress(role);
  if (mm && window.ethereum) {
    await ensureMonadNetwork();
    return createWalletClient({ account: mm, chain: monadTestnet, transport: custom(window.ethereum) });
  }
  return createWalletClient({ account: getAccount(role), chain: monadTestnet, transport: http() });
}

/** Make sure this role's wallet has testnet MON for gas (the app sends some if it's low). */
export async function ensureGas(role: Role): Promise<void> {
  const address = roleAddress(role);
  const bal = await publicClient.getBalance({ address });
  if (bal >= 40_000_000_000_000_000n) return; // 0.04 MON
  const res = await fetch("/api/monad/fund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
  const j = (await res.json()) as { error?: string };
  if (j.error) throw new Error(j.error);
}

type CheckoutFn =
  | "registerStore"
  | "placeOrder"
  | "cancel"
  | "accept"
  | "markReady"
  | "refund"
  | "claimDelivery"
  | "complete";

/**
 * Send a transaction to GroceryCheckout. Monad charges the full gas limit, so we estimate first and
 * add 30% headroom instead of letting a wallet guess high.
 */
export async function writeCheckout(role: Role, functionName: CheckoutFn, args: readonly unknown[]): Promise<{ hash: Hash; ms: number }> {
  if (!CHECKOUT) throw new Error("Contracts aren't deployed yet. Run: npm run monad:deploy");
  await ensureGas(role);
  const account = roleAddress(role);
  const base = { address: CHECKOUT, abi: groceryCheckoutAbi, functionName, args, account } as never;
  const est = await publicClient.estimateContractGas(base);
  const wallet = await walletFor(role);
  const hash = await wallet.writeContract({ ...(base as object), gas: (est * 13n) / 10n } as never);
  const started = performance.now(); // from broadcast to confirmed (not counting time spent in a MetaMask popup)
  const r = await publicClient.waitForTransactionReceipt({ hash });
  const ms = Math.round(performance.now() - started);
  if (r.status !== "success") throw new Error("The transaction failed on Monad.");
  return { hash, ms };
}

/** Turn a contract revert or RPC error into a short sentence. */
export function explain(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; cause?: { data?: { errorName?: string } } };
  const name = err.cause?.data?.errorName ?? (err.shortMessage || err.message || "").match(/reverted with the following signature|Error: (\w+)\(/)?.[1];
  const known: Record<string, string> = {
    WrongCode: "That handoff code doesn't match. Ask the student to check it.",
    NotStoreOwner: "Only the store that owns this order can do that.",
    NotDriver: "Only the driver who claimed this delivery can finish it.",
    NotBuyer: "Only the student who placed the order can cancel it.",
    BadStatus: "The order has already moved on. Refresh to see its latest status.",
    EmptyOrder: "The cart is empty.",
    PickupHasNoDelivery: "Pickup orders don't have a delivery fee.",
    BadStore: "That store isn't set up on Monad yet.",
    InsufficientBalance: "Not enough test dollars.",
  };
  if (name && known[name]) return known[name];
  if (/user rejected|user denied|4001/i.test(err.shortMessage || err.message || "")) return "You cancelled it in MetaMask.";
  const msg = err.shortMessage || err.message || "Something went wrong";
  return msg.split("\n")[0];
}

async function writeToken(role: Role, functionName: "faucet" | "approve", args: readonly unknown[]): Promise<Hash> {
  if (!TOKEN) throw new Error("Contracts aren't deployed yet. Run: npm run monad:deploy");
  await ensureGas(role);
  const account = roleAddress(role);
  const base = { address: TOKEN, abi: campusDollarAbi, functionName, args, account } as never;
  const est = await publicClient.estimateContractGas(base);
  const wallet = await walletFor(role);
  const hash = await wallet.writeContract({ ...(base as object), gas: (est * 13n) / 10n } as never);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function dollarBalance(address: Address): Promise<bigint> {
  if (!TOKEN) return 0n;
  return publicClient.readContract({ address: TOKEN, abi: campusDollarAbi, functionName: "balanceOf", args: [address] });
}

/** Student setup before paying: enough test dollars, and the checkout contract allowed to take payment. */
export async function prepareToPay(totalUnits: bigint, onStep?: (s: string) => void): Promise<void> {
  const me = roleAddress("student");
  onStep?.("Getting gas for your test wallet");
  await ensureGas("student");
  let bal = await dollarBalance(me);
  while (bal < totalUnits) {
    onStep?.("Adding test dollars to your wallet");
    await writeToken("student", "faucet", []);
    const next = await dollarBalance(me);
    if (next === bal) throw new Error("Couldn't add test dollars (faucet limit reached).");
    bal = next;
  }
  const allowance = await publicClient.readContract({ address: TOKEN!, abi: campusDollarAbi, functionName: "allowance", args: [me, CHECKOUT!] });
  if (allowance < totalUnits) {
    onStep?.("Allowing CampusFuel checkout to take payment");
    await writeToken("student", "approve", [CHECKOUT!, 2n ** 256n - 1n]);
  }
}

// ---------- reads ----------

export interface OnchainOrder {
  id: bigint;
  buyer: Address;
  storeId: number;
  kind: number;
  status: number;
  placedAt: number;
  updatedAt: number;
  driver: Address;
  subtotal: bigint;
  deliveryFee: bigint;
  tip: bigint;
  codeHash: `0x${string}`;
  itemsHash: `0x${string}`;
}

export async function getOrder(id: bigint): Promise<OnchainOrder> {
  const o = await publicClient.readContract({ address: CHECKOUT!, abi: groceryCheckoutAbi, functionName: "getOrder", args: [id] });
  return { id, ...o, placedAt: Number(o.placedAt), updatedAt: Number(o.updatedAt) };
}

export async function getOrders(ids: readonly bigint[]): Promise<OnchainOrder[]> {
  return Promise.all(ids.map(getOrder));
}

export async function listStores(): Promise<{ id: number; owner: Address; name: string }[]> {
  const address = CHECKOUT;
  if (!address) return [];
  const n = Number(await publicClient.readContract({ address, abi: groceryCheckoutAbi, functionName: "storeCount" }));
  const stores = await Promise.all(
    Array.from({ length: n }, (_, i) => publicClient.readContract({ address, abi: groceryCheckoutAbi, functionName: "getStore", args: [BigInt(i)] })),
  );
  return stores.map((s, i) => ({ id: i, owner: s.owner, name: s.name }));
}

export async function orderCount(): Promise<number> {
  if (!CHECKOUT) return 0;
  return Number(await publicClient.readContract({ address: CHECKOUT, abi: groceryCheckoutAbi, functionName: "orderCount" }));
}

export async function myOrderIds(): Promise<bigint[]> {
  if (!CHECKOUT) return [];
  return [...(await publicClient.readContract({ address: CHECKOUT, abi: groceryCheckoutAbi, functionName: "ordersOf", args: [roleAddress("student")] }))];
}

export async function storeOrderIds(storeId: number): Promise<bigint[]> {
  if (!CHECKOUT) return [];
  return [...(await publicClient.readContract({ address: CHECKOUT, abi: groceryCheckoutAbi, functionName: "ordersForStore", args: [BigInt(storeId)] }))];
}

// ---------- handoff code ----------

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I mix-ups

/** A random 8-character handoff code like "K7Q2-M9XD" (40 bits). */
export function newHandoffCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** What the contract stores: keccak256(buyer, code). The code itself never goes onchain until handoff. */
export const handoffHash = (buyer: Address, code: string) => keccak256(encodePacked(["address", "string"], [buyer, code]));

export const itemsHash = (items: unknown) => keccak256(toHex(JSON.stringify(items)));

// The student's handoff codes live only in this browser.
const CODES = "campusfuel.monad.codes.v1";
export function saveCode(orderId: bigint, code: string) {
  try {
    const all = JSON.parse(localStorage.getItem(CODES) || "{}");
    all[orderId.toString()] = code;
    localStorage.setItem(CODES, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
export function loadCode(orderId: bigint): string | null {
  try {
    return JSON.parse(localStorage.getItem(CODES) || "{}")[orderId.toString()] ?? null;
  } catch {
    return null;
  }
}

/** Order id from a placeOrder receipt (the OrderPlaced event's first topic). */
export async function orderIdFromTx(hash: Hash): Promise<bigint> {
  const r = await publicClient.getTransactionReceipt({ hash });
  const log = r.logs.find((l) => l.address.toLowerCase() === CHECKOUT!.toLowerCase() && l.topics.length === 4);
  if (!log?.topics[1]) throw new Error("Couldn't find the order in the receipt.");
  return BigInt(log.topics[1]);
}

// The item list stays off-chain (only its hash is onchain). For the demo, the store screen in the
// same browser reads it here and checks it against the onchain hash.
const ITEMS = "campusfuel.monad.items.v1";
export interface CartLine {
  name: string;
  pkg: string;
  price: number;
}
export function saveItems(orderId: bigint, items: CartLine[]) {
  try {
    const all = JSON.parse(localStorage.getItem(ITEMS) || "{}");
    all[orderId.toString()] = items;
    localStorage.setItem(ITEMS, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}
export function loadItems(orderId: bigint): CartLine[] | null {
  try {
    return JSON.parse(localStorage.getItem(ITEMS) || "{}")[orderId.toString()] ?? null;
  } catch {
    return null;
  }
}
