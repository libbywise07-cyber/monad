// Where CampusCart lives on Monad testnet.
// After deploying (on the /monad page), put the addresses here or in Vercel env vars
// NEXT_PUBLIC_CART_ADDRESS / NEXT_PUBLIC_STORE_ADDRESS so every visitor uses the same contract.
export const CART_ADDRESS = "";
export const STORE_ADDRESS = "";

export const CHAIN_ID = 10143;
export const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || "https://testnet-rpc.monad.xyz";
export const EXPLORER = process.env.NEXT_PUBLIC_MONAD_EXPLORER || "https://testnet.monadexplorer.com";

/** Testnet MON has no real value. For the demo we price groceries at a fixed rate so a $60 order costs 0.06 MON. */
export const USD_PER_MON = Number(process.env.NEXT_PUBLIC_USD_PER_MON || 1000);

export const DELIVERY_FEE_USD = 3.99;
