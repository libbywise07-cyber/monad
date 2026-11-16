"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import WalletBar, { useWallet } from "@/components/WalletBar";
import { useStored } from "@/lib/store";
import { cartAddress, connectWallet, friendlyError, placeOrder, storeAddress, storeNameOf, txUrl, usdToMon, type OrderDetails } from "@/lib/monad/client";
import { DELIVERY_FEE_USD, USD_PER_MON } from "@/lib/monad/config";
import type { Address } from "viem";

const SLOTS = ["Today 5–6pm", "Today 6–7pm", "Today 7–8pm", "Tomorrow 10–11am", "Tomorrow 12–1pm", "Tomorrow 5–6pm"];

export default function Checkout() {
  const router = useRouter();
  const { profile, plan } = useStored();
  const w = useWallet();
  const stores = profile?.stores ?? [];
  const [storeId, setStoreId] = useState("");
  const [method, setMethod] = useState<"pickup" | "delivery">("pickup");
  const [slot, setSlot] = useState(SLOTS[0]);
  const [address, setAddress] = useState("");
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<"" | "wallet" | "chain">("");
  const [err, setErr] = useState("");
  const [tx, setTx] = useState("");
  const [partner, setPartner] = useState<string | null>(null);
  const configured = Boolean(cartAddress() && storeAddress());

  useEffect(() => {
    if (!storeId && stores[0]) setStoreId([...stores].sort((a, b) => a.priceFactor - b.priceFactor)[0].id);
    if (!address && profile?.address) setAddress(profile.address);
  }, [stores, storeId, profile, address]);

  // Which store wallet receives the payment on Monad (the demo partner store).
  useEffect(() => {
    const a = storeAddress();
    if (a && cartAddress())
      storeNameOf(a as Address)
        .then((n) => setPartner(n || null))
        .catch(() => setPartner(null));
  }, []);

  const store = stores.find((s) => s.id === storeId);
  const factor = store?.priceFactor ?? 1;
  const items = useMemo(() => plan?.groceries ?? [], [plan]);
  const chosen = items.filter((g) => !skip[g.name]);
  const subtotal = chosen.reduce((a, g) => a + g.cost * factor, 0);
  const fee = method === "delivery" ? DELIVERY_FEE_USD : 0;
  const total = Math.round((subtotal + fee) * 100) / 100;
  const mon = usdToMon(total);

  const pay = async () => {
    setErr("");
    if (!chosen.length) return setErr("Pick at least one item.");
    if (method === "delivery" && !address.trim()) return setErr("Add a delivery address.");
    try {
      setBusy("wallet");
      const from = w.account ?? (await connectWallet());
      const details: OrderDetails = {
        store: store ? store.name : partner || "Campus grocery",
        where: store?.address || undefined,
        method,
        slot,
        address: method === "delivery" ? address.trim() : undefined,
        name: profile?.name || undefined,
        items: chosen.map((g) => [g.name, g.pkg, Math.round(g.cost * factor * 100) / 100]),
        subtotal: Math.round(subtotal * 100) / 100,
        fee,
        total,
        rate: USD_PER_MON,
      };
      setBusy("chain");
      const r = await placeOrder(from, storeAddress() as Address, details);
      setTx(r.hash);
      router.push(`/orders${r.id ? `?id=${r.id}&tx=${r.hash}` : ""}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy("");
    }
  };

  if (profile === undefined) return <main className="wrap muted">Loading…</main>;

  return (
    <main className="wrap narrow">
      <nav className="row between" style={{ marginBottom: 14 }}>
        <Link href="/dashboard" className="btn sm">
          ← Back to plan
        </Link>
        <Link href="/orders" className="btn sm ghost">
          My orders
        </Link>
      </nav>
      <h1 style={{ fontSize: 30 }}>Checkout</h1>
      <p className="muted">Pay the store on Monad. Your money is held safely until you have your groceries, then it goes to the store.</p>

      {!configured ? (
        <div className="notice">
          The Monad store isn&apos;t set up on this browser yet. <Link href="/monad">Open Monad setup</Link> to deploy the contract and register the demo store
          (about 2 minutes).
        </div>
      ) : null}

      {!plan || !items.length ? (
        <div className="card">
          <p>
            No grocery list yet. <Link href="/dashboard">Build your plan</Link> first.
          </p>
        </div>
      ) : (
        <div className="stack">
          <section className="card stack">
            <h3 style={{ margin: 0 }}>1. Store</h3>
            {stores.length ? (
              <select aria-label="Store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.priceTier} · {s.distanceMi} mi
                  </option>
                ))}
              </select>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                No saved stores. You&apos;re ordering from {partner ?? "our demo partner store"}. Save your stores on the Groceries tab to choose one.
              </p>
            )}
            {partner ? (
              <p className="small muted" style={{ margin: 0 }}>
                Payment goes to <b>{partner}</b>, a CampusFuel partner store on Monad testnet.
              </p>
            ) : null}
          </section>

          <section className="card stack">
            <h3 style={{ margin: 0 }}>2. Pickup or delivery</h3>
            <div className="option-grid">
              <button type="button" className={`option ${method === "pickup" ? "on" : ""}`} onClick={() => setMethod("pickup")}>
                <b>🛍️ Pickup</b>
                <small>Free · {store?.address || "at the store"}</small>
              </button>
              <button type="button" className={`option ${method === "delivery" ? "on" : ""}`} onClick={() => setMethod("delivery")}>
                <b>🚚 Delivery</b>
                <small>${DELIVERY_FEE_USD.toFixed(2)} · to your door</small>
              </button>
            </div>
            {method === "delivery" ? (
              <div>
                <label htmlFor="deliver-to">Deliver to</label>
                <input id="deliver-to" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="2125 Franklin Blvd, Eugene, OR 97401" />
              </div>
            ) : null}
            <div>
              <label htmlFor="slot">Time</label>
              <select id="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
                {SLOTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="card stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}>3. Items</h3>
              <span className="muted small">
                {chosen.length} of {items.length}
              </span>
            </div>
            <div>
              {items.map((g) => (
                <label key={g.name} className="grocery-row" style={{ cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={!skip[g.name]} onChange={(e) => setSkip({ ...skip, [g.name]: !e.target.checked })} />
                  <span>
                    <b>{g.name}</b>
                    <span className="muted small" style={{ display: "block" }}>
                      {g.pkg}
                    </span>
                  </span>
                  <span className="grocery-price">${(g.cost * factor).toFixed(2)}</span>
                </label>
              ))}
            </div>
            <p className="muted small" style={{ margin: 0 }}>Untick anything you already have.</p>
          </section>

          <section className="card stack checkout-total">
            <div className="row between">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {fee ? (
              <div className="row between">
                <span>Delivery</span>
                <span>${fee.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="row between" style={{ fontSize: 20 }}>
              <b>Total</b>
              <b>${total.toFixed(2)}</b>
            </div>
            <div className="row between small muted">
              <span>Paid in MON on Monad testnet (demo rate 1 MON = ${USD_PER_MON.toLocaleString()})</span>
              <span className="mono">{mon.toFixed(5)} MON</span>
            </div>
            <WalletBar w={w} label="Connect wallet to pay" />
            {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : null}
            <button type="button" className="btn primary" onClick={pay} disabled={Boolean(busy) || !configured || !chosen.length}>
              {busy === "wallet" ? (
                <>
                  <span className="spinner" /> Approve in your wallet…
                </>
              ) : busy === "chain" ? (
                <>
                  <span className="spinner" /> Confirming on Monad…
                </>
              ) : (
                `Pay ${mon.toFixed(4)} MON on Monad`
              )}
            </button>
            {tx ? (
              <a className="small" href={txUrl(tx)} target="_blank" rel="noreferrer">
                View payment on Monad explorer ↗
              </a>
            ) : null}
            <p className="small muted" style={{ margin: 0 }}>
              🔒 Your payment is held by the CampusCart contract, not the store. The store is paid only when you confirm you got your groceries. If the
              store rejects the order or doesn&apos;t accept it within an hour, you get a full refund.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
