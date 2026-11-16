// Compiles contracts/CampusCart.sol with solc-js and writes the ABI + bytecode the app uses.
// Run: node scripts/compile-contract.cjs
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const file = path.join(__dirname, "..", "contracts", "CampusCart.sol");
const input = {
  language: "Solidity",
  sources: { "CampusCart.sol": { content: fs.readFileSync(file, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === "error");
for (const e of out.errors || []) console.log(e.severity.toUpperCase(), e.formattedMessage);
if (errors.length) process.exit(1);
const c = out.contracts["CampusCart.sol"].CampusCart;
const dest = path.join(__dirname, "..", "lib", "monad", "campusCart.json");
fs.writeFileSync(dest, JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object, compiler: solc.version() }, null, 2));
console.log("wrote", dest, "bytecode bytes:", c.evm.bytecode.object.length / 2);
