// Gives a demo wallet a little testnet MON for gas, paid from the app wallet in .env.local.
// Only tops up wallets that are nearly empty, at most once a minute each.
import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, txUrl } from "@/lib/monad/config";

export const runtime = "nodejs";

const DRIP = parseEther("0.1");
const LOW = parseEther("0.04");
const recent = new Map<string, number>();

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const key = process.env.MONAD_DEPLOYER_KEY as Hex | undefined;
  if (!key) return NextResponse.json({ error: "The app wallet isn't set up. Run: npm run monad:wallet" }, { status: 503 });

  const pub = createPublicClient({ chain: monadTestnet, transport: http() });
  const balance = await pub.getBalance({ address });
  if (balance >= LOW) return NextResponse.json({ funded: false, balance: formatEther(balance) });

  const last = recent.get(address.toLowerCase()) ?? 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ funded: false, pending: true, balance: formatEther(balance) });
  recent.set(address.toLowerCase(), Date.now());

  try {
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
    const hash = await wallet.sendTransaction({ to: address, value: DRIP, gas: 21_000n });
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ funded: true, tx: txUrl(hash), balance: formatEther(balance + DRIP) });
  } catch (e) {
    recent.delete(address.toLowerCase());
    const msg = e instanceof Error ? e.message : "Funding failed";
    return NextResponse.json(
      { error: /insufficient funds/i.test(msg) ? "The app wallet is out of testnet MON. Top it up at https://faucet.monad.xyz" : msg.split("\n")[0] },
      { status: 502 },
    );
  }
}
