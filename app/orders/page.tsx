"use client";
// The student's Monad orders with live status, handoff codes and refunds.
import Link from "next/link";
import { useEffect, useState } from "react";
import { MonadHeader, useRoleAddress, OrderSummary, StatusTimeline, useInterval, WalletCard } from "@/components/monad/MonadUI";
import { isDeployed } from "@/lib/monad/config";
import { explain, getOrders, listStores, loadCode, myOrderIds, writeCheckout, type OnchainOrder } from "@/lib/monad/client";

export default function Orders() {
  const [orders, setOrders] = useState<OnchainOrder[] | null>(null);
  const [stores, setStores] = useState<Record<number, string>>({});
  const student = useRoleAddress("student");
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (isDeployed) listStores().then((s) => setStores(Object.fromEntries(s.map((x) => [x.id, x.name]))));
  }, []);

  useInterval(
    () => {
      myOrderIds()
        .then((ids) => getOrders(ids))
        .then((o) => setOrders(o.reverse()))
        .catch(() => setOrders((x) => x ?? []));
    },
    1500,
    isDeployed,
  );

  const cancel = async (id: bigint) => {
    setBusy(id.toString());
    setErr("");
    try {
      await writeCheckout("student", "cancel", [id]);
    } catch (e) {
      setErr(explain(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="wrap narrow">
      <MonadHeader title="my orders" sub="Every order, payment and refund is onchain on Monad." />
      {student ? <WalletCard role="student" label="Your wallet" address={student} /> : null}
      {err ? <p className="err">{err}</p> : null}
      <div className="stack" style={{ marginTop: 14 }}>
        {orders == null ? (
          <p className="muted">Loading your orders from Monad…</p>
        ) : !orders.length ? (
          <p className="muted">
            No orders yet. <Link href="/checkout">Check out your grocery list</Link>.
          </p>
        ) : (
          orders.map((o) => {
            const code = loadCode(o.id);
            return (
              <section key={o.id.toString()} className="card stack">
                <OrderSummary order={o} storeName={stores[o.storeId]} />
                <StatusTimeline order={o} />
                {code && o.status < 5 ? (
                  <div className="small">
                    Handoff code: <span className="handoff-code sm">{code}</span>
                  </div>
                ) : null}
                {o.status === 1 ? (
                  <button type="button" className="btn sm" onClick={() => cancel(o.id)} disabled={busy === o.id.toString()}>
                    {busy === o.id.toString() ? "Cancelling…" : "Cancel for a full refund"}
                  </button>
                ) : null}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
