// Creates the app's Monad testnet wallet (deploys the contracts and pays gas for demo users).
// The private key is saved only in .env.local (git-ignored) and never printed.
// Run: npm run monad:wallet
import { formatEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { publicClient, readEnv, setEnv } from "./monad-env.mjs";

let key = readEnv().MONAD_DEPLOYER_KEY;
if (!key) {
  key = generatePrivateKey();
  setEnv("MONAD_DEPLOYER_KEY", key);
  console.log("Created a new testnet wallet and saved it to .env.local");
}
const { address } = privateKeyToAccount(key);
const balance = await publicClient.getBalance({ address }).catch(() => null);

console.log(`\nApp wallet address: ${address}`);
console.log(`Balance on Monad testnet: ${balance == null ? "couldn't check" : `${formatEther(balance)} MON`}`);
console.log("\nTo fund it, paste the address at https://faucet.monad.xyz and request testnet MON.");
console.log("Then run: npm run monad:deploy");
