// Deploys CampusDollar and GroceryCheckout to Monad testnet and saves the addresses
// to lib/monad/deployment.json (which the app reads).
// Run: npm run monad:deploy
import { readFileSync, writeFileSync } from "node:fs";
import { encodeDeployData, formatEther, parseEther } from "viem";
import { EXPLORER, deployerAccount, publicClient, walletClient } from "./monad-env.mjs";

const { contracts } = JSON.parse(readFileSync("lib/monad/artifacts.json", "utf8"));
const account = deployerAccount();
const wallet = walletClient(account);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deploying from ${account.address} (${formatEther(balance)} MON)`);
if (balance < parseEther("0.3")) {
  console.error("Not enough MON to deploy. Get testnet MON at https://faucet.monad.xyz for the address above.");
  process.exit(1);
}

async function deploy(name, args = []) {
  const { abi, bytecode } = contracts[name];
  // Monad charges the full gas limit, so estimate and add only a little headroom.
  const est = await publicClient.estimateGas({ account, data: encodeDeployData({ abi, bytecode, args }) });
  const hash = await wallet.deployContract({ abi, bytecode, args, gas: (est * 12n) / 10n });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${name} deploy failed: ${EXPLORER}/tx/${hash}`);
  console.log(`  ${name}: ${r.contractAddress}  (${EXPLORER}/address/${r.contractAddress})`);
  return { address: r.contractAddress, block: Number(r.blockNumber) };
}

const token = await deploy("CampusDollar");
const checkout = await deploy("GroceryCheckout", [token.address]);

const deployment = {
  chainId: 10143,
  network: "Monad Testnet",
  explorer: EXPLORER,
  token: token.address,
  checkout: checkout.address,
  startBlock: token.block,
  deployedAt: new Date().toISOString(),
};
writeFileSync("lib/monad/deployment.json", JSON.stringify(deployment, null, 2) + "\n");
console.log("\nSaved lib/monad/deployment.json. Restart `npm run dev` if it's running.");
