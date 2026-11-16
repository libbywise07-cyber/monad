"use client";
// Checkout with Monad: the week's grocery list → pickup or delivery → pay into escrow onchain.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MonadHeader, useRoleAddress, OrderSummary, StatusTimeline, TxLink, useInterval, WalletCard } from "@/components/monad/MonadUI";
import { cheapestBrand } from "@/lib/storeBrands";
import { useStored } from "@/lib/store";
import { fmtUsd, isDeployed, toUnits } from "@/lib/monad/config";
import {
  explain,
  getOrder,
  handoffHash,
  itemsHash,
  listStores,
  newHandoffCode,
  orderIdFromTx,
  prepareToPay,
  saveCode,
  saveItems,
  writeCheckout,
  type CartLine,
  type OnchainOrder,
} from "@/lib/monad/client";

const DELIVERY_FEE = 3.99;
const TIPS = [0, 1, 2, 3, 5];

function loadChecked(planId: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem("campusfuel.checked.v1") || "{}")[planId] ?? {};
  } catch {
    return {};
  }
}

export default function Checkout() {
  const { profile, plan } = useStored();
  const [storeParam, setStoreParam] = useState<string | null>(null);
  const [stores, setStores] = useState<{ id: number; name: string }[] | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [kind, setKind] = useState<0 | 1>(1);
  const [tip, setTip] = useState(2);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [err, setErr] = useState("");
  const [placed, setPlaced] = useState<{ id: bigint; hash: string; ms: number; code: string } | null>(null);
  const [order, setOrder] = useState<OnchainOrder | null>(null);
  const student = useRoleAddress("student");

  useEffect(() => {
    setStoreParam(new URLSearchParams(window.location.search).get("store"));
    if (isDeployed) listStores().then(setStores).catch(() => setStores([]));
    else setStores([]);
  }, []);

  // The grocery store the student picked on the Groceries tab (prices and brands follow it).
  const shopAt = profile?.stores?.find((s) => s.id === storeParam) ?? profile?.stores?.[0];
  const factor = shopAt?.priceFactor ?? 1;

  // Default the onchain store to the one whose name matches where they're shopping.
  useEffect(() => {
    if (!stores?.length || storeId != null) return;
    const want = shopAt?.name.toLowerCase().split(" ")[0] ?? "";
    setStoreId((stores.find((s) => want && s.name.toLowerCase().includes(want)) ?? stores[stores.length - 1]).id);
  }, [stores, storeId, shopAt]);

  const cart: CartLine[] = useMemo(() => {
    if (!plan) return [];
    const done = loadChecked(plan.generatedAt);
    return plan.groceries
      .filter((g) => !done[g.name])
      .map((g) => {
        const brand = cheapestBrand(shopAt?.name, g.aisle, g.name);
        return { name: brand && !/brand$/i.test(brand) ? `${brand} ${g.name}` : g.name, pkg: g.pkg, price: +(g.cost * factor).toFixed(2) };
      });
  }, [plan, factor, shopAt]);

  const subtotal = +cart.reduce((a, c) => a + c.price, 0).toFixed(2);
  const fee = kind === 1 ? DELIVERY_FEE : 0;
  const total = subtotal + fee + tip;

  const pay = async () => {
    if (storeId == null || !student) return;
    setBusy(true);
    setErr("");
    try {
      const units = toUnits(subtotal) + toUnits(fee) + toUnits(tip);
      await prepareToPay(units, setStep);
      const code = newHandoffCode();
      setStep("Paying with Monad");
      const { hash, ms } = await writeCheckout("student", "placeOrder", [
        BigInt(storeId),
        kind,
        toUnits(subtotal),
        toUnits(fee),
        toUnits(tip),
        itemsHash(cart),
        handoffHash(student, code),
      ]);
      const id = await orderIdFromTx(hash);
      saveCode(id, code);
      saveItems(id, cart);
      setPlaced({ id, hash, ms, code });
    } catch (e) {
      setErr(explain(e));
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  useInterval(() => {
    if (placed) getOrder(placed.id).then(setOrder).catch(() => {});
  }, 1000, Boolean(placed));

  const cancel = async () => {
    if (!placed) return;
    setBusy(true);
    try {
      await writeCheckout("student", "cancel", [placed.id]);
    } catch (e) {
      setErr(explain(e));
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return <main className="wrap muted">Loading…</main>;

  return (
    <main className="wrap narrow">
      <MonadHeader title="checkout with Monad" sub="Pay for this week's groceries in one tap. Your money waits in escrow until you get your order." />
      {student ? <WalletCard role="student" label="Your wallet" address={student} tick={placed ? 1 : 0} /> : null}

      {placed ? (
        <section className="card stack" style={{ marginTop: 14 }}>
          <div className="paid-banner">
            <b>Paid {fmtUsd(total)}</b>
            <TxLink hash={placed.hash} ms={placed.ms} />
          </div>
          {order ? <OrderSummary order={order} storeName={stores?.find((s) => s.id === order.storeId)?.name} /> : null}
          {order ? <StatusTimeline order={order} /> : <p className="muted small">Loading order status…</p>}
          {order && order.status < 5 ? (
            <div className="handoff">
              <div className="small muted">Your handoff code: show it to the {kind === 0 ? "store at pickup" : "driver at your door"}</div>
              <div className="handoff-code">{placed.code}</div>
              <div className="small muted">Only a hash of this code is on Monad, so nobody can finish your order without you.</div>
            </div>
          ) : null}
          {order?.status === 1 ? (
            <button type="button" className="btn" onClick={cancel} disabled={busy}>
              Cancel for a full refund
            </button>
          ) : null}
          {err ? <p className="err">{err}</p> : null}
          <div className="row small">
            <Link href="/orders">See all my orders</Link>
            <Link href="/store">Open the store screen</Link>
            {kind === 1 ? <Link href="/driver">Open the driver screen</Link> : null}
          </div>
        </section>
      ) : (
        <section className="card stack" style={{ marginTop: 14 }}>
          {!plan || !cart.length ? (
            <p className="muted">
              Your grocery list is empty. <Link href="/dashboard">Build a plan</Link> first.
            </p>
          ) : (
            <>
              <div>
                <label>How do you want it?</label>
                <div className="option-grid">
                  <button type="button" className={`option ${kind === 0 ? "on" : ""}`} onClick={() => (setKind(0), setTip(0))}>
                    <b>Pickup</b>
                    <small>Grab it at the store · free</small>
                  </button>
                  <button type="button" className={`option ${kind === 1 ? "on" : ""}`} onClick={() => (setKind(1), setTip(2))}>
                    <b>Delivery</b>
                    <small>To your door · {fmtUsd(DELIVERY_FEE)} + tip</small>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="mstore">Store (accepting Monad orders)</label>
                {stores == null ? (
                  <p className="muted small">Loading stores from Monad…</p>
                ) : stores.length ? (
                  <select id="mstore" value={storeId ?? ""} onChange={(e) => setStoreId(+e.target.value)}>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="notice small" style={{ margin: 0 }}>
                    No stores on Monad yet. <Link href="/store">Open the store screen</Link> to set one up, then come back.
                  </p>
                )}
              </div>

              <div>
                <div className="row between">
                  <label style={{ margin: 0 }}>Your cart · {cart.length} items</label>
                  <span className="small muted">{shopAt ? `${shopAt.name} prices` : "average prices"}</span>
                </div>
                <ul className="cart-lines">
                  {cart.map((c) => (
                    <li key={c.name}>
                      <span>
                        {c.name} <span className="muted small">· {c.pkg}</span>
                      </span>
                      <span className="grocery-price">${c.price.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {kind === 1 ? (
                <div>
                  <label>Tip your driver</label>
                  <div className="chips">
                    {TIPS.map((t) => (
                      <button key={t} type="button" className={`chip ${tip === t ? "on" : ""}`} onClick={() => setTip(t)}>
                        {t ? `$${t}` : "No tip"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="totals">
                <div>
                  <span>Groceries</span>
                  <span>{fmtUsd(subtotal)}</span>
                </div>
                {kind === 1 ? (
                  <div>
                    <span>Delivery</span>
                    <span>{fmtUsd(fee)}</span>
                  </div>
                ) : null}
                {tip ? (
                  <div>
                    <span>Tip</span>
                    <span>{fmtUsd(tip)}</span>
                  </div>
                ) : null}
                <div className="grand">
                  <span>Total</span>
                  <span>{fmtUsd(total)}</span>
                </div>
              </div>

              <button type="button" className="btn primary pay-btn" onClick={pay} disabled={busy || !isDeployed || storeId == null}>
                {busy ? (
                  <>
                    <span className="spinner" /> {step || "Working"}…
                  </>
                ) : (
                  `Pay ${fmtUsd(total)} with Monad`
                )}
              </button>
              {err ? <p className="err">{err}</p> : null}
              <p className="small muted" style={{ margin: 0 }}>
                Testnet demo: you pay in free test dollars (cfUSD). The payment is held by the GroceryCheckout contract and released to the store
                {kind === 1 ? " and driver" : ""} only when you hand over your code.
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
