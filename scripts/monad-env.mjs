// Shared helpers for the Monad scripts: read/write .env.local and the testnet clients.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const ENV_FILE = ".env.local";
export const EXPLORER = "https://testnet.monadvision.com";

export function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
}

/** Adds or replaces KEY=value in .env.local, keeping everything else. */
export function setEnv(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, lines.filter((l, k) => l !== "" || k < lines.length - 1).join("\n") + "\n");
}

export function deployerAccount() {
  const key = readEnv().MONAD_DEPLOYER_KEY;
  if (!key) throw new Error("No MONAD_DEPLOYER_KEY in .env.local. Run: npm run monad:wallet");
  return privateKeyToAccount(key);
}

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
export const walletClient = (account) => createWalletClient({ account, chain: monadTestnet, transport: http() });
