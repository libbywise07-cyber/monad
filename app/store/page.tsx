"use client";
// The store's side: open a store on Monad, accept orders, mark them ready, hand off pickups, refund.
import { useEffect, useState } from "react";
import { MonadHeader, useRoleAddress, OrderSummary, StatusTimeline, TxLink, useInterval, WalletCard } from "@/components/monad/MonadUI";
import { useStored } from "@/lib/store";
import { isDeployed } from "@/lib/monad/config";
import {
  explain,
  getOrders,
  itemsHash,
  listStores,
  loadItems,
  storeOrderIds,
  writeCheckout,
  type OnchainOrder,
} from "@/lib/monad/client";

export default function StoreScreen() {
  const { profile } = useStored();
  const me = useRoleAddress("store");
  const [mine, setMine] = useState<{ id: number; name: string }[] | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [orders, setOrders] = useState<OnchainOrder[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ hash: string; ms: number } | null>(null);

  const loadStores = async (addr: string) => {
    const all = await listStores();
    const own = all.filter((s) => s.owner.toLowerCase() === addr.toLowerCase());
    setMine(own);
    setStoreId(own[own.length - 1]?.id ?? null);
  };

  // Reload "my stores" whenever the store's wallet changes (test wallet <-> MetaMask).
  useEffect(() => {
    if (!me) return;
    setStoreId(null);
    if (isDeployed) loadStores(me).catch(() => setMine([]));
    else setMine([]);
  }, [me]);

  useEffect(() => {
    if (!name && profile?.stores?.length) {
      const s = profile.stores.find((x) => x.priceFactor <= 0.85) ?? profile.stores[0];
      setName(`${s.name}${s.address ? ` · ${s.address.split(",")[0]}` : ""}`);
    }
  }, [profile, name]);

  useInterval(
    () => {
      if (storeId == null) return;
      storeOrderIds(storeId)
        .then(getOrders)
        .then((o) => setOrders(o.reverse()))
        .catch(() => {});
    },
    1500,
    isDeployed && storeId != null,
  );

  const act = async (key: string, fn: "registerStore" | "accept" | "markReady" | "complete" | "refund", args: readonly unknown[]) => {
    setBusy(key);
    setErr("");
    try {
      const r = await writeCheckout("store", fn, args);
      setLast(r);
      if (fn === "registerStore" && me) await loadStores(me);
    } catch (e) {
      setErr(explain(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="wrap narrow">
      <MonadHeader title="store screen" sub="What the grocery store sees. Payments are released to this wallet when an order is handed off." />
      {me ? <WalletCard role="store" label="Store wallet (earnings)" address={me} tick={last ? 1 : 0} /> : null}
      {last ? (
        <p style={{ margin: "10px 0 0" }}>
          <TxLink hash={last.hash} ms={last.ms} />
        </p>
      ) : null}
      {err ? <p className="err">{err}</p> : null}

      {mine == null && isDeployed ? <p className="muted">Loading from Monad…</p> : null}
      {mine && !mine.length ? (
        <section className="card stack" style={{ marginTop: 14 }}>
          <h2 style={{ margin: 0 }}>Open your store on Monad</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Registers this store with the GroceryCheckout contract so students can pay it.
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ALDI · 3 Oak St" />
          <button type="button" className="btn primary" disabled={!name.trim() || busy === "reg"} onClick={() => act("reg", "registerStore", [name.trim()])}>
            {busy === "reg" ? "Registering…" : "Register store"}
          </button>
        </section>
      ) : null}

      {mine && mine.length ? (
        <>
          {mine.length > 1 ? (
            <select style={{ marginTop: 14 }} value={storeId ?? ""} onChange={(e) => setStoreId(+e.target.value)}>
              {mine.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="small muted" style={{ margin: "14px 0 0" }}>
              Store: <b>{mine[0].name}</b>
            </p>
          )}
          <div className="stack" style={{ marginTop: 14 }}>
            {!orders.length ? <p className="muted">No orders yet. Place one from the checkout screen.</p> : null}
            {orders.map((o) => {
              const k = o.id.toString();
              const items = loadItems(o.id);
              const verified = items ? itemsHash(items) === o.itemsHash : null;
              return (
                <section key={k} className="card stack">
                  <OrderSummary order={o} />
                  <StatusTimeline order={o} />
                  {items ? (
                    <details>
                      <summary className="small">
                        {items.length} items {verified ? "· matches the onchain receipt ✓" : verified === false ? "· doesn't match the receipt" : ""}
                      </summary>
                      <ul className="cart-lines">
                        {items.map((i) => (
                          <li key={i.name}>
                            <span>
                              {i.name} <span className="muted small">· {i.pkg}</span>
                            </span>
                            <span className="grocery-price">${i.price.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="row">
                    {o.status === 1 ? (
                      <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => act(k, "accept", [o.id])}>
                        {busy === k ? "Accepting…" : "Accept order"}
                      </button>
                    ) : null}
                    {o.status === 2 ? (
                      <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => act(k, "markReady", [o.id])}>
                        {busy === k ? "Updating…" : o.kind === 0 ? "Mark ready for pickup" : "Mark packed for the driver"}
                      </button>
                    ) : null}
                    {o.status === 3 && o.kind === 0 ? (
                      <>
                        <input
                          className="code-input"
                          value={codes[k] ?? ""}
                          onChange={(e) => setCodes({ ...codes, [k]: e.target.value.toUpperCase() })}
                          placeholder="Student's code"
                        />
                        <button type="button" className="btn primary sm" disabled={!!busy || !codes[k]} onClick={() => act(k, "complete", [o.id, codes[k]])}>
                          {busy === k ? "Checking…" : "Hand off & get paid"}
                        </button>
                      </>
                    ) : null}
                    {o.status === 3 && o.kind === 1 ? <span className="small muted">Waiting for a driver to claim it.</span> : null}
                    {o.status > 0 && o.status < 5 ? (
                      <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => act(`r${k}`, "refund", [o.id])}>
                        {busy === `r${k}` ? "Refunding…" : "Refund"}
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </main>
  );
}
