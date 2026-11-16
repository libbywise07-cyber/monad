"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import OrderCard from "@/components/OrderCard";
import WalletBar, { useWallet } from "@/components/WalletBar";
import { acceptOrder, cancelOrder, cartAddress, friendlyError, markReady, ordersFor, storeNameOf, waitFor, type Order } from "@/lib/monad/client";

/** The grocery store's side: new orders arrive live from Monad; accept, pack, hand off. */
export default function StoreDashboard() {
  const w = useWallet();
  const [name, setName] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [lastTx, setLastTx] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!w.account || !cartAddress()) return;
    try {
      const [n, list] = await Promise.all([storeNameOf(w.account), ordersFor(w.account, "store")]);
      setName(n);
      setOrders(list);
    } catch (e) {
      setErr(friendlyError(e));
    }
  }, [w.account]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (o: Order, what: "accept" | "ready" | "reject") => {
    if (!w.account) return;
    setErr("");
    setBusy(o.id + what);
    try {
      const fn = what === "accept" ? acceptOrder : what === "ready" ? markReady : cancelOrder;
      const hash = await fn(w.account, o.id);
      setLastTx((x) => ({ ...x, [o.id.toString()]: hash }));
      await waitFor(hash);
      await load();
      w.refreshBalance();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  const open = orders?.filter((o) => o.status === "Paid" || o.status === "Accepted" || o.status === "Ready") ?? [];
  const done = orders?.filter((o) => o.status === "Completed" || o.status === "Refunded") ?? [];

  return (
    <main className="wrap narrow">
      <nav className="row between" style={{ marginBottom: 14 }}>
        <Link href="/" className="brand">
          campus<span>fuel</span> <span className="tag">for stores</span>
        </Link>
        <Link href="/monad" className="btn sm ghost">
          Setup
        </Link>
      </nav>
      <h1 style={{ fontSize: 30 }}>{name || "Store dashboard"}</h1>
      <p className="muted">New orders show up here a second after a student pays on Monad. You&apos;re paid automatically when they confirm pickup or delivery.</p>
      <WalletBar w={w} label="Connect store wallet" />
      {w.account && name === "" ? (
        <div className="notice" style={{ marginTop: 12 }}>
          This wallet isn&apos;t registered as a store yet. <Link href="/monad">Register it in Monad setup</Link>.
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}

      {w.account && orders ? (
        <div className="stack" style={{ marginTop: 14 }}>
          <h2 style={{ margin: 0 }}>
            Open orders <span className="tag">{open.length}</span>
          </h2>
          {open.length ? (
            open.map((o) => (
              <OrderCard
                key={o.id.toString()}
                o={o}
                view="store"
                lastTx={lastTx[o.id.toString()]}
                actions={
                  <>
                    {o.status === "Paid" ? (
                      <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => act(o, "accept")}>
                        {busy === o.id + "accept" ? "Accepting…" : "Accept order"}
                      </button>
                    ) : null}
                    {o.status === "Accepted" ? (
                      <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => act(o, "ready")}>
                        {busy === o.id + "ready" ? "Updating…" : o.method === "delivery" ? "🚚 Send out for delivery" : "🛍️ Ready for pickup"}
                      </button>
                    ) : null}
                    {o.status === "Paid" || o.status === "Accepted" ? (
                      <button type="button" className="btn sm" disabled={Boolean(busy)} onClick={() => act(o, "reject")}>
                        {busy === o.id + "reject" ? "Refunding…" : "Reject & refund"}
                      </button>
                    ) : null}
                    {o.status === "Ready" ? <span className="small muted">Waiting for the student to confirm…</span> : null}
                  </>
                }
              />
            ))
          ) : (
            <p className="muted">No open orders. Waiting for students…</p>
          )}
          {done.length ? (
            <>
              <h2 style={{ margin: "10px 0 0" }}>Done</h2>
              {done.map((o) => (
                <OrderCard key={o.id.toString()} o={o} view="store" lastTx={lastTx[o.id.toString()]} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
