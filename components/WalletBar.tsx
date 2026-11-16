"use client";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { addressUrl, balanceOf, connectWallet, currentAccount, eth, fmtMon, friendlyError, short } from "@/lib/monad/client";

/** Connect button + connected wallet, its MON balance and a faucet link. */
export function useWallet() {
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [err, setErr] = useState("");
  const [hasWallet, setHasWallet] = useState(true);

  const refresh = useCallback(async (a: Address | null) => {
    setAccount(a);
    if (a) {
      try {
        setBalance(await balanceOf(a));
      } catch {
        setBalance(null);
      }
    } else setBalance(null);
  }, []);

  useEffect(() => {
    setHasWallet(Boolean(eth()));
    currentAccount()
      .then(refresh)
      .catch(() => {});
    const w = eth();
    w?.on?.("accountsChanged", (a) => refresh(((a as Address[]) ?? [])[0] ?? null));
    w?.on?.("chainChanged", () => currentAccount().then(refresh));
  }, [refresh]);

  const connect = async () => {
    setErr("");
    try {
      await refresh(await connectWallet());
    } catch (e) {
      setErr(friendlyError(e));
    }
  };

  return { account, balance, connect, err, hasWallet, refreshBalance: () => refresh(account) };
}

export default function WalletBar({ w, label = "Connect wallet" }: { w: ReturnType<typeof useWallet>; label?: string }) {
  return (
    <div className="wallet-bar">
      {w.account ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="monad-dot" aria-hidden />
          <a href={addressUrl(w.account)} target="_blank" rel="noreferrer" className="mono">
            {short(w.account)}
          </a>
          <span className="muted small">{w.balance != null ? fmtMon(w.balance) : "…"} on Monad testnet</span>
          {w.balance != null && w.balance < BigInt(1e16) ? (
            <a className="small" href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
              Get free test MON ↗
            </a>
          ) : null}
        </div>
      ) : w.hasWallet ? (
        <button type="button" className="btn primary sm" onClick={w.connect}>
          {label}
        </button>
      ) : (
        <span className="small">
          Install{" "}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{" "}
          to pay on Monad, then reload.
        </span>
      )}
      {w.err ? <p className="err small" style={{ margin: "6px 0 0" }}>{w.err}</p> : null}
    </div>
  );
}
