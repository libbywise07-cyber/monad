"use client";
// Small shared pieces for the Monad checkout screens.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { addressUrl, fmtUsd, isDeployed, KIND, STATUS, txUrl } from "@/lib/monad/config";
import {
  connectMetaMask,
  dollarBalance,
  explain,
  hasMetaMask,
  metamaskAddress,
  publicClient,
  roleAddress,
  switchToTestWallet,
  WALLET_EVENT,
  watchMetaMask,
  type OnchainOrder,
  type Role,
} from "@/lib/monad/client";

/** The address a role is using right now (MetaMask or test wallet). Updates when it changes. */
export function useRoleAddress(role: Role): Address | null {
  const [addr, setAddr] = useState<Address | null>(null);
  useEffect(() => {
    const sync = () => setAddr(roleAddress(role));
    sync();
    window.addEventListener(WALLET_EVENT, sync);
    const stop = watchMetaMask();
    return () => {
      window.removeEventListener(WALLET_EVENT, sync);
      stop();
    };
  }, [role]);
  return addr;
}

export function useInterval(fn: () => void, ms: number, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

const LINKS: [string, string][] = [
  ["/checkout", "Checkout"],
  ["/orders", "My orders"],
  ["/store", "Store"],
  ["/driver", "Driver"],
];

export function MonadHeader({ title, sub }: { title: string; sub?: string }) {
  const path = usePathname();
  return (
    <>
      <header className="row between" style={{ marginBottom: 6 }}>
        <Link href="/dashboard?tab=groceries" className="brand" aria-label="CampusFuel home">
          campus<span>fuel</span>
        </Link>
        <div className="row" style={{ gap: 8 }}>
          <span className="monad-pill">
            <span className="monad-dot" aria-hidden /> Monad testnet
          </span>
          <Link href="/dashboard?tab=groceries" className="icon-btn sm close-btn" aria-label="Close checkout and go back to groceries" title="Close">
            ✕
          </Link>
        </div>
      </header>
      <Link href="/dashboard?tab=groceries" className="back-link">
        ← Back to groceries
      </Link>
      <nav className="monad-tabs" aria-label="Checkout screens">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "on" : ""}>
            {label}
          </Link>
        ))}
      </nav>
      <h1 className="headline" style={{ marginTop: 10 }}>
        {title}
      </h1>
      {sub ? (
        <p className="muted" style={{ marginTop: -8 }}>
          {sub}
        </p>
      ) : null}
      {!isDeployed ? (
        <div className="notice">
          <b>Not deployed yet.</b> Fund the app wallet at faucet.monad.xyz, then run <code>npm run monad:deploy</code> and restart the dev server.
        </div>
      ) : null}
    </>
  );
}

/** Wallet address, test-dollar balance and MON for gas, plus Connect MetaMask / Use test wallet. */
export function WalletCard({ label, address, role, tick = 0 }: { label: string; address: Address; role: Role; tick?: number }) {
  const [usd, setUsd] = useState<bigint | null>(null);
  const [mon, setMon] = useState<bigint | null>(null);
  const [mm, setMm] = useState(false);
  const [canMm, setCanMm] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setMm(Boolean(metamaskAddress(role)));
    setCanMm(hasMetaMask());
  }, [role, address]);
  const connect = async () => {
    setConnecting(true);
    setErr("");
    try {
      await connectMetaMask(role);
    } catch (e) {
      setErr(explain(e));
    } finally {
      setConnecting(false);
    }
  };
  useInterval(
    () => {
      dollarBalance(address).then(setUsd).catch(() => {});
      publicClient.getBalance({ address }).then(setMon).catch(() => {});
    },
    4000,
    isDeployed,
  );
  useEffect(() => {
    if (!isDeployed) return;
    dollarBalance(address).then(setUsd).catch(() => {});
  }, [tick, address]);
  return (
    <div className="wallet-card">
      <div className="wallet-top">
        <div>
          <div className="small muted">
            {label} · <b>{mm ? "MetaMask" : "test wallet"}</b>
          </div>
          <a href={addressUrl(address)} target="_blank" rel="noreferrer" className="mono small">
            {address.slice(0, 6)}…{address.slice(-4)}
          </a>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="wallet-usd">{usd == null ? "–" : fmtUsd(usd)}</div>
          <div className="small muted">test dollars{mon != null ? ` · ${(Number(mon) / 1e18).toFixed(3)} MON gas` : ""}</div>
        </div>
      </div>
      <div className="wallet-actions">
        {mm ? (
          <button type="button" className="btn ghost sm" onClick={() => switchToTestWallet(role)}>
            Use the built-in test wallet
          </button>
        ) : canMm ? (
          <button type="button" className="btn sm mm-btn" onClick={connect} disabled={connecting}>
            {connecting ? "Check MetaMask…" : "Connect MetaMask"}
          </button>
        ) : (
          <a className="small" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Install MetaMask to use your own wallet ↗
          </a>
        )}
        {mm ? <span className="small muted">Payments open in MetaMask on Monad Testnet</span> : null}
      </div>
      {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : null}
    </div>
  );
}

export function TxLink({ hash, ms, label = "View on MonadVision" }: { hash: string; ms?: number; label?: string }) {
  return (
    <span className="tx-link small">
      {ms != null ? <b>Confirmed on Monad in {(ms / 1000).toFixed(2)}s</b> : null}
      {ms != null ? " · " : ""}
      <a href={txUrl(hash)} target="_blank" rel="noreferrer">
        {label} ↗
      </a>
    </span>
  );
}

const STEPS = {
  0: [1, 2, 3, 5], // pickup: placed, accepted, ready, completed
  1: [1, 2, 3, 4, 5], // delivery: placed, accepted, ready, out for delivery, delivered
} as const;
const STEP_LABEL = (kind: number, s: number) =>
  s === 5 ? (kind === 0 ? "Picked up" : "Delivered") : s === 3 ? (kind === 0 ? "Ready for pickup" : "Packed, waiting for a driver") : STATUS[s];

/** Placed → Accepted → Ready → (Out for delivery) → Done, from the order's onchain status. */
export function StatusTimeline({ order }: { order: OnchainOrder }) {
  if (order.status >= 6) {
    return <div className={`status-pill ${order.status === 6 ? "cancel" : "refund"}`}>{STATUS[order.status]}: the full amount went back to the student</div>;
  }
  const steps = STEPS[order.kind as 0 | 1];
  const next = steps.find((s) => order.status < s);
  return (
    <ol className="timeline-steps">
      {steps.map((s) => (
        <li key={s} className={order.status >= s ? "done" : s === next ? "next" : ""}>
          <span className="dot" aria-hidden />
          {STEP_LABEL(order.kind, s)}
        </li>
      ))}
    </ol>
  );
}

export function OrderSummary({ order, storeName }: { order: OnchainOrder; storeName?: string }) {
  const total = order.subtotal + order.deliveryFee + order.tip;
  return (
    <div className="row between small" style={{ alignItems: "baseline" }}>
      <span>
        <b>Order #{order.id.toString()}</b> · {KIND[order.kind]}
        {storeName ? ` · ${storeName}` : ""}
      </span>
      <span>
        <b>{fmtUsd(total)}</b>
        <span className="muted">
          {" "}
          ({fmtUsd(order.subtotal)} groceries{order.deliveryFee ? ` + ${fmtUsd(order.deliveryFee)} delivery` : ""}
          {order.tip ? ` + ${fmtUsd(order.tip)} tip` : ""})
        </span>
      </span>
    </div>
  );
}
