// Monad testnet settings shared by the app and the server.
import { defineChain, type Address } from "viem";
import { monadTestnet as base } from "viem/chains";
import deployment from "./deployment.json";

export const EXPLORER = deployment.explorer || "https://testnet.monadvision.com";

/** Monad testnet, with the official MonadVision explorer. */
export const monadTestnet = defineChain({
  ...base,
  blockExplorers: { default: { name: "MonadVision", url: EXPLORER } },
});

export const TOKEN = deployment.token as Address | null;
export const CHECKOUT = deployment.checkout as Address | null;
export const START_BLOCK = BigInt(deployment.startBlock || 0);
export const isDeployed = Boolean(TOKEN && CHECKOUT);

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;

/** cfUSD has 6 decimals, like USDC. */
export const toUnits = (usd: number) => BigInt(Math.round(usd * 100)) * 10_000n;
export const fromUnits = (v: bigint) => Number(v) / 1e6;
export const fmtUsd = (v: bigint | number) => `$${(typeof v === "bigint" ? fromUnits(v) : v).toFixed(2)}`;

export const STATUS = ["None", "Placed", "Accepted", "Ready", "Out for delivery", "Completed", "Cancelled", "Refunded"] as const;
export type StatusName = (typeof STATUS)[number];
export const KIND = ["Pickup", "Delivery"] as const;
