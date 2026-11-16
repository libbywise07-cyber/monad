"use client";
// The driver's side: claim deliveries that are packed, deliver, finish with the student's code, get paid.
import { useEffect, useState } from "react";
import { MonadHeader, useRoleAddress, OrderSummary, StatusTimeline, TxLink, useInterval, WalletCard } from "@/components/monad/MonadUI";
import { fmtUsd, isDeployed } from "@/lib/monad/config";
import { explain, getOrders, listStores, orderCount, writeCheckout, type OnchainOrder } from "@/lib/monad/client";

export default function DriverScreen() {
  const me = useRoleAddress("driver");
  const [orders, setOrders] = useState<OnchainOrder[]>([]);
  const [stores, setStores] = useState<Record<number, string>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ hash: string; ms: number } | null>(null);

  useEffect(() => {
    if (isDeployed) listStores().then((s) => setStores(Object.fromEntries(s.map((x) => [x.id, x.name]))));
  }, []);

  // Look at the 40 most recent orders for deliveries to pick up or finish.
  useInterval(
    () => {
      orderCount()
        .then((n) => getOrders(Array.from({ length: Math.min(40, n) }, (_, i) => BigInt(n - 1 - i))))
        .then((all) => setOrders(all.filter((o) => o.kind === 1)))
        .catch(() => {});
    },
    1500,
    isDeployed,
  );

  const mineNow = orders.filter((o) => me && o.driver.toLowerCase() === me.toLowerCase());
  const open = orders.filter((o) => o.status === 3);

  const act = async (key: string, fn: "claimDelivery" | "complete", args: readonly unknown[]) => {
    setBusy(key);
    setErr("");
    try {
      setLast(await writeCheckout("driver", fn, args));
    } catch (e) {
      setErr(explain(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="wrap narrow">
      <MonadHeader title="driver screen" sub="Claim a packed delivery, drop it off, enter the student's code, and the fee + tip land in your wallet." />
      {me ? <WalletCard role="driver" label="Driver wallet (earnings)" address={me} tick={last ? 1 : 0} /> : null}
      {last ? (
        <p style={{ margin: "10px 0 0" }}>
          <TxLink hash={last.hash} ms={last.ms} />
        </p>
      ) : null}
      {err ? <p className="err">{err}</p> : null}

      <div className="section-head">
        <h2>ready for pickup</h2>
        <span className="small muted">{open.length} open</span>
      </div>
      <div className="stack">
        {!open.length ? <p className="muted">No deliveries waiting. They show up here when a store marks one packed.</p> : null}
        {open.map((o) => {
          const k = o.id.toString();
          return (
            <section key={k} className="card stack">
              <OrderSummary order={o} storeName={stores[o.storeId]} />
              <div className="row between">
                <span className="small">
                  You earn <b>{fmtUsd(o.deliveryFee + o.tip)}</b>
                </span>
                <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => act(k, "claimDelivery", [o.id])}>
                  {busy === k ? "Claiming…" : "Claim delivery"}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="section-head">
        <h2>my deliveries</h2>
      </div>
      <div className="stack">
        {!mineNow.length ? <p className="muted">Nothing claimed yet.</p> : null}
        {mineNow.map((o) => {
          const k = o.id.toString();
          return (
            <section key={k} className="card stack">
              <OrderSummary order={o} storeName={stores[o.storeId]} />
              <StatusTimeline order={o} />
              {o.status === 4 ? (
                <div className="row">
                  <input className="code-input" value={codes[k] ?? ""} onChange={(e) => setCodes({ ...codes, [k]: e.target.value.toUpperCase() })} placeholder="Student's code" />
                  <button type="button" className="btn primary sm" disabled={!!busy || !codes[k]} onClick={() => act(`c${k}`, "complete", [o.id, codes[k]])}>
                    {busy === `c${k}` ? "Checking…" : "Delivered, get paid"}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
