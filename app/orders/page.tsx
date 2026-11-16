"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import OrderCard from "@/components/OrderCard";
import WalletBar, { useWallet } from "@/components/WalletBar";
import { cancelOrder, cartAddress, confirmReceived, friendlyError, ordersFor, txUrl, waitFor, type Order } from "@/lib/monad/client";

/** The student's orders, read live from Monad every 2 seconds. */
export default function Orders() {
  const w = useWallet();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [lastTx, setLastTx] = useState<Record<string, string>>({});
  const [placed, setPlaced] = useState<{ id: string; tx: string } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("id");
    const tx = sp.get("tx");
    if (id && tx) {
      setPlaced({ id, tx });
      setLastTx((x) => ({ ...x, [id]: tx }));
    }
  }, []);

  const load = useCallback(async () => {
    if (!w.account || !cartAddress()) return;
    try {
      setOrders(await ordersFor(w.account, "buyer"));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }, [w.account]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (o: Order, what: "confirm" | "cancel") => {
    if (!w.account) return;
    setErr("");
    setBusy(o.id.toString() + what);
    try {
      const hash = await (what === "confirm" ? confirmReceived : cancelOrder)(w.account, o.id);
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

  return (
    <main className="wrap narrow">
      <nav className="row between" style={{ marginBottom: 14 }}>
        <Link href="/dashboard" className="btn sm">
          ← Back to plan
        </Link>
        <Link href="/checkout" className="btn sm ghost">
          New order
        </Link>
      </nav>
      <h1 style={{ fontSize: 30 }}>My orders</h1>
      <p className="muted">Live from Monad. Status updates within a second or two of the store tapping a button.</p>
      <WalletBar w={w} label="Connect wallet to see your orders" />
      {placed ? (
        <div className="notice" style={{ marginTop: 12 }}>
          ✅ Order #{placed.id} paid on Monad.{" "}
          <a href={txUrl(placed.tx)} target="_blank" rel="noreferrer">
            See the payment ↗
          </a>
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}
      <div className="stack" style={{ marginTop: 14 }}>
        {!cartAddress() ? (
          <div className="notice">
            Monad isn&apos;t set up yet. <Link href="/monad">Open Monad setup</Link>.
          </div>
        ) : !w.account ? null : orders === null ? (
          <div className="row muted">
            <span className="spinner" /> Reading your orders from Monad…
          </div>
        ) : orders.length ? (
          orders.map((o) => (
            <OrderCard
              key={o.id.toString()}
              o={o}
              view="buyer"
              lastTx={lastTx[o.id.toString()]}
              actions={
                <>
                  {o.status === "Accepted" || o.status === "Ready" ? (
                    <button type="button" className="btn primary sm" disabled={Boolean(busy)} onClick={() => act(o, "confirm")}>
                      {busy === o.id + "confirm" ? "Confirming…" : o.method === "delivery" ? "✓ I got my delivery" : "✓ I picked it up"}
                    </button>
                  ) : null}
                  {o.status === "Paid" ? (
                    <button type="button" className="btn sm" disabled={Boolean(busy)} onClick={() => act(o, "cancel")}>
                      {busy === o.id + "cancel" ? "Refunding…" : "Cancel & refund"}
                    </button>
                  ) : null}
                </>
              }
            />
          ))
        ) : (
          <p className="muted">
            No orders yet. <Link href="/checkout">Check out your grocery list</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
