// Runs the whole order flow against a local in-memory chain (ganache), no Monad needed.
// Run: npm run contracts:test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, decodeErrorResult, encodeFunctionData, encodePacked, getContract, keccak256, parseUnits, toHex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const { contracts } = JSON.parse(readFileSync("lib/monad/artifacts.json", "utf8"));
const keys = Array.from({ length: 4 }, () => generatePrivateKey());
const [deployer, student, storeOwner, driver] = keys.map((k) => privateKeyToAccount(k));

const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 10143, hardfork: "merge" },
  wallet: { accounts: keys.map((k) => ({ secretKey: k, balance: toHex(10n ** 20n) })) },
});
const chain = { id: 10143, name: "local", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["http://local"] } } };
const pub = createPublicClient({ chain, transport: custom(provider) });
const wallet = (account) => createWalletClient({ account, chain, transport: custom(provider) });

async function deploy(name, args = []) {
  const { abi, bytecode } = contracts[name];
  const hash = await wallet(deployer).deployContract({ abi, bytecode, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  return r.contractAddress;
}
const send = async (account, address, name, fn, args = []) => {
  const abi = contracts[name].abi;
  // Estimate, then add 30% headroom (Monad charges the gas limit, so the app does the same).
  const est = await pub.estimateContractGas({ account, address, abi, functionName: fn, args });
  const hash = await wallet(account).writeContract({ address, abi, functionName: fn, args, gas: (est * 13n) / 10n });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") {
    // replay as a call to get the custom error name
    let why = "unknown";
    try {
      await provider.request({ method: "eth_call", params: [{ from: account.address, to: address, data: encodeFunctionData({ abi: contracts[name].abi, functionName: fn, args }) }, "latest"] });
    } catch (e) {
      const data = typeof e.data === "string" ? e.data : e.data?.result;
      why = data ? decodeErrorResult({ abi: contracts[name].abi, data }).errorName + " " + data : e.message;
    }
    const tx = await pub.getTransaction({ hash });
    assert.fail(`${fn} reverted: ${why} (gas limit ${tx.gas}, used ${r.gasUsed})`);
  }
  return r;
};
// Expect a call to revert with a specific custom error (read straight from the node's error data).
const fails = async (account, address, name, fn, args, errorName) => {
  const abi = contracts[name].abi;
  try {
    await provider.request({ method: "eth_call", params: [{ from: account.address, to: address, data: encodeFunctionData({ abi, functionName: fn, args }) }, "latest"] });
  } catch (e) {
    const data = typeof e.data === "string" ? e.data : e.data?.result;
    const got = data ? decodeErrorResult({ abi, data }).errorName : e.message;
    assert.equal(got, errorName, `${fn}: expected ${errorName}, got ${got}`);
    return;
  }
  assert.fail(`${fn} should have reverted with ${errorName}`);
};
const usd = (n) => parseUnits(String(n), 6);
const codeHash = (buyer, code) => keccak256(encodePacked(["address", "string"], [buyer, code]));
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};

const tokenAddr = await deploy("CampusDollar");
const shopAddr = await deploy("GroceryCheckout", [tokenAddr]);
const token = getContract({ address: tokenAddr, abi: contracts.CampusDollar.abi, client: pub });
const shop = getContract({ address: shopAddr, abi: contracts.GroceryCheckout.abi, client: pub });
const bal = (a) => token.read.balanceOf([a.address]);

console.log("GroceryCheckout");

await test("faucet gives $100 and stops above $500", async () => {
  for (let i = 0; i < 5; i++) await send(student, tokenAddr, "CampusDollar", "faucet");
  assert.equal(await bal(student), usd(500));
  await fails(student, tokenAddr, "CampusDollar", "faucet", [], "FaucetLimit");
});

await send(student, tokenAddr, "CampusDollar", "approve", [shopAddr, 2n ** 256n - 1n]);
await send(storeOwner, shopAddr, "GroceryCheckout", "registerStore", ["ALDI · 3 Oak St"]);

await test("pickup: escrow, accept, ready, finish with code pays the store", async () => {
  const before = await bal(student);
  await send(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 0, usd(35.62), 0n, usd(1), keccak256(toHex("items")), codeHash(student.address, "K7Q2-M9XD")]);
  assert.equal(before - (await bal(student)), usd(36.62));
  assert.equal(await token.read.balanceOf([shopAddr]), usd(36.62));
  await send(storeOwner, shopAddr, "GroceryCheckout", "accept", [0n]);
  await send(storeOwner, shopAddr, "GroceryCheckout", "markReady", [0n]);
  await fails(storeOwner, shopAddr, "GroceryCheckout", "complete", [0n, "WRONG-CODE"], "WrongCode");
  await send(storeOwner, shopAddr, "GroceryCheckout", "complete", [0n, "K7Q2-M9XD"]);
  assert.equal(await bal(storeOwner), usd(36.62)); // groceries + pickup tip
  assert.equal((await shop.read.getOrder([0n])).status, 5); // Completed
});

await test("delivery: driver claims, finishes with code, gets fee + tip", async () => {
  await send(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 1, usd(20), usd(3.99), usd(2), keccak256(toHex("items2")), codeHash(student.address, "ABCD-1234")]);
  await send(storeOwner, shopAddr, "GroceryCheckout", "accept", [1n]);
  await fails(driver, shopAddr, "GroceryCheckout", "claimDelivery", [1n], "BadStatus"); // not ready yet
  await send(storeOwner, shopAddr, "GroceryCheckout", "markReady", [1n]);
  await send(driver, shopAddr, "GroceryCheckout", "claimDelivery", [1n]);
  await fails(storeOwner, shopAddr, "GroceryCheckout", "complete", [1n, "ABCD-1234"], "NotDriver");
  const storeBefore = await bal(storeOwner);
  await send(driver, shopAddr, "GroceryCheckout", "complete", [1n, "ABCD-1234"]);
  assert.equal((await bal(storeOwner)) - storeBefore, usd(20));
  assert.equal(await bal(driver), usd(5.99));
});

await test("student can cancel before the store accepts (full refund)", async () => {
  const before = await bal(student);
  await send(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 1, usd(10), usd(2), 0n, keccak256(toHex("i3")), codeHash(student.address, "x")]);
  await send(student, shopAddr, "GroceryCheckout", "cancel", [2n]);
  assert.equal(await bal(student), before);
  await fails(student, shopAddr, "GroceryCheckout", "cancel", [2n], "BadStatus");
});

await test("student can't cancel after accept; store can refund", async () => {
  const before = await bal(student);
  await send(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 0, usd(12), 0n, 0n, keccak256(toHex("i4")), codeHash(student.address, "y")]);
  await send(storeOwner, shopAddr, "GroceryCheckout", "accept", [3n]);
  await fails(student, shopAddr, "GroceryCheckout", "cancel", [3n], "BadStatus");
  await fails(driver, shopAddr, "GroceryCheckout", "refund", [3n], "NotStoreOwner");
  await send(storeOwner, shopAddr, "GroceryCheckout", "refund", [3n]);
  assert.equal(await bal(student), before);
});

await test("rules: no empty orders, no delivery fee on pickup, only the store accepts", async () => {
  await fails(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 0, 0n, 0n, 0n, keccak256(toHex("e")), codeHash(student.address, "z")], "EmptyOrder");
  await fails(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 0, usd(5), usd(1), 0n, keccak256(toHex("e")), codeHash(student.address, "z")], "PickupHasNoDelivery");
  await fails(student, shopAddr, "GroceryCheckout", "placeOrder", [9n, 0, usd(5), 0n, 0n, keccak256(toHex("e")), codeHash(student.address, "z")], "BadStore");
  await send(student, shopAddr, "GroceryCheckout", "placeOrder", [0n, 0, usd(5), 0n, 0n, keccak256(toHex("e")), codeHash(student.address, "z")]);
  await fails(driver, shopAddr, "GroceryCheckout", "accept", [4n], "NotStoreOwner");
  assert.deepEqual(await shop.read.ordersOf([student.address]), [0n, 1n, 2n, 3n, 4n]);
});

await test("escrow holds exactly the open orders", async () => {
  assert.equal(await token.read.balanceOf([shopAddr]), usd(5)); // only order 4 is still open
});

console.log(`\n${passed} passed`);
await provider.disconnect();
