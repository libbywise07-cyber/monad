// End-to-end test of CampusCart against a local chain (ganache on :8545 with chain id 10143).
// Run: npx ganache --chain.chainId 10143 & node scripts/test-contract.mjs
import { createPublicClient, createWalletClient, http, parseEther, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";

const { abi, bytecode } = JSON.parse(fs.readFileSync(new URL("../lib/monad/campusCart.json", import.meta.url)));
const local = defineChain({ id: 10143, name: "local", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } } });
const pub = createPublicClient({ chain: local, transport: http() });
const keys = ["1", "2", "3", "4"].map((c) => privateKeyToAccount("0x" + c.repeat(64)));
const [deployer, student, store, stranger] = keys.map((k) => k.address);
const as = (address) => createWalletClient({ account: keys.find((k) => k.address === address), chain: local, transport: http() });
const wait = (hash) => pub.waitForTransactionReceipt({ hash });
let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const expectRevert = async (label, fn) => {
  try {
    await fn();
    check(label + " (should revert)", false);
  } catch (e) {
    check(label + " reverts: " + (e.shortMessage || e.message).split("\n")[0].slice(0, 70), true);
  }
};

// deploy
const hash = await as(deployer).deployContract({ abi, bytecode });
const { contractAddress: addr, gasUsed } = await wait(hash);
console.log("deployed at", addr, "gas", gasUsed);
const read = (functionName, args = []) => pub.readContract({ address: addr, abi, functionName, args });
const write = async (account, functionName, args = [], value) => wait(await as(account).writeContract({ address: addr, abi, functionName, args, value }));

await expectRevert("order to unregistered store", () => as(student).writeContract({ address: addr, abi, functionName: "placeOrder", args: [store, 0, "{}"], value: parseEther("0.05") }));
await write(store, "registerStore", ["Safeway (demo)"]);
check("store registered", (await read("storeName", [store])) === "Safeway (demo)");
await expectRevert("order with no payment", () => as(student).writeContract({ address: addr, abi, functionName: "placeOrder", args: [store, 0, "{}"] }));

// happy path
const storeBefore = await pub.getBalance({ address: store });
const r1 = await write(student, "placeOrder", [store, 1, JSON.stringify({ items: [{ n: "eggs", usd: 3.49 }] })], parseEther("0.0612"));
console.log("placeOrder gas", r1.gasUsed);
check("order 1 placed, contract holds funds", (await pub.getBalance({ address: addr })) === parseEther("0.0612"));
let o = await read("getOrder", [1n]);
check("order 1 status Placed, method Delivery", o.status === 1 && o.method === 1 && o.buyer.toLowerCase() === student.toLowerCase());
await expectRevert("student can't accept", () => as(student).writeContract({ address: addr, abi, functionName: "accept", args: [1n] }));
await expectRevert("can't confirm before accepted", () => as(student).writeContract({ address: addr, abi, functionName: "confirmReceived", args: [1n] }));
await write(store, "accept", [1n]);
await write(store, "markReady", [1n]);
check("order 1 Ready", (await read("getOrder", [1n])).status === 3);
await expectRevert("stranger can't confirm", () => as(stranger).writeContract({ address: addr, abi, functionName: "confirmReceived", args: [1n] }));
await write(student, "confirmReceived", [1n]);
const storeGain = (await pub.getBalance({ address: store })) - storeBefore;
check("order 1 Completed", (await read("getOrder", [1n])).status === 4);
check(`store received ~0.0612 MON (net of its own gas): +${formatEther(storeGain)}`, storeGain > parseEther("0.06") && storeGain <= parseEther("0.0612"));
check("contract empty after payout", (await pub.getBalance({ address: addr })) === 0n);
await expectRevert("can't confirm twice", () => as(student).writeContract({ address: addr, abi, functionName: "confirmReceived", args: [1n] }));

// refund: student cancels before acceptance
const sBefore = await pub.getBalance({ address: student });
const r2 = await write(student, "placeOrder", [store, 0, "{}"], parseEther("1"));
const r3 = await write(student, "cancel", [2n]);
const sAfter = await pub.getBalance({ address: student });
const gas = r2.gasUsed * r2.effectiveGasPrice + r3.gasUsed * r3.effectiveGasPrice;
check("student refunded in full on early cancel", sBefore - sAfter === gas);

// refund: store rejects after accepting
await write(student, "placeOrder", [store, 0, "{}"], parseEther("0.5"));
await write(store, "accept", [3n]);
await expectRevert("student can't cancel once accepted", () => as(student).writeContract({ address: addr, abi, functionName: "cancel", args: [3n] }));
await write(store, "cancel", [3n]);
check("store rejection refunds (status Cancelled)", (await read("getOrder", [3n])).status === 5);

// refund: store never accepts within an hour -> anyone can trigger
await write(student, "placeOrder", [store, 0, "{}"], parseEther("0.2"));
await expectRevert("stranger can't cancel a fresh order", () => as(stranger).writeContract({ address: addr, abi, functionName: "cancel", args: [4n] }));
await pub.request({ method: "evm_increaseTime", params: [3601] });
await pub.request({ method: "evm_mine", params: [] });
await write(stranger, "cancel", [4n]);
check("stale order refunded by anyone after 1h", (await read("getOrder", [4n])).status === 5);

check("lists: buyer has 4 orders", (await read("ordersOfBuyer", [student])).length === 4);
check("lists: store has 4 orders", (await read("ordersOfStore", [store])).length === 4);
check("orderCount 4", (await read("orderCount")) === 4n);
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
