"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { directionsUrl, storeSearchUrl } from "@/lib/storeLinks";
import { cheapestBrand, savingsTips } from "@/lib/storeBrands";
import type { MealPlan, Profile } from "@/lib/types";

const CHECK_KEY = "campusfuel.checked.v1";

function loadChecks(planId: string): Record<string, boolean> {
  try {
    const all = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}");
    return all[planId] ?? {};
  } catch {
    return {};
  }
}
function saveChecks(planId: string, v: Record<string, boolean>) {
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify({ [planId]: v })); // only keep the current week
  } catch {
    /* storage unavailable */
  }
}

/** The week's shopping list: pick a store, check items off, copy it, find each item on the store's site. */
export default function GroceryList({ plan, profile }: { plan: MealPlan; profile: Profile }) {
  const stores = profile.stores ?? [];
  const cheapest = [...stores].sort((a, b) => a.priceFactor - b.priceFactor || a.distanceMi - b.distanceMi)[0];
  const [storeId, setStoreId] = useState<string>("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hideDone, setHideDone] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => setChecked(loadChecks(plan.generatedAt)), [plan.generatedAt]);
  useEffect(() => {
    if (!storeId && cheapest) setStoreId(cheapest.id);
  }, [cheapest, storeId]);

  const store = stores.find((s) => s.id === storeId);
  const factor = store?.priceFactor ?? 1;
  const priced = (c: number) => c * factor;
  const total = priced(plan.groceryTotal);
  const left = plan.groceries.filter((g) => !checked[g.name]);
  const leftCost = priced(left.reduce((a, g) => a + g.cost, 0));
  const over = total > profile.weeklyBudget;
  const aisles = useMemo(() => [...new Set(plan.groceries.map((g) => g.aisle))], [plan.groceries]);
  const brandOf = (aisle: string, item = "") => cheapestBrand(store?.name, aisle, item);
  // A searchable brand name (skip generic labels like "store brand")
  const searchBrand = (aisle: string, item = "") => {
    const b = brandOf(aisle, item);
    return b && !/brand$/i.test(b) ? `${b} ` : "";
  };

  // The whole list priced at every saved store, cheapest first.
  const compare = [...stores]
    .map((s) => ({ s, total: plan.groceryTotal * s.priceFactor }))
    .sort((a, b) => a.total - b.total);
  const best = compare[0];
  const savings = store && best && best.s.id !== store.id ? total - best.total : 0;
  const tips = savingsTips(store?.name);

  const toggle = (name: string, on: boolean) => {
    const next = { ...checked, [name]: on };
    setChecked(next);
    saveChecks(plan.generatedAt, next);
  };

  const copy = async () => {
    const text = [
      `Grocery list${store ? ` for ${store.name}` : ""} (≈$${total.toFixed(0)})`,
      ...aisles.flatMap((a) => [
        "",
        a.toUpperCase(),
        ...plan.groceries
          .filter((g) => g.aisle === a)
          .map((g) => `${checked[g.name] ? "[x]" : "[ ]"} ${g.name}${brandOf(g.aisle, g.name) ? ` (${brandOf(g.aisle, g.name)})` : ""}, ${g.pkg} ~$${priced(g.cost).toFixed(2)}`),
      ]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied. Paste it into Notes or a group chat.");
    } catch {
      setCopied("Couldn't copy automatically. Select the list and copy it.");
    }
    setTimeout(() => setCopied(""), 4000);
  };

  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Grocery list</h2>
        <div className="row noprint" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={copy}>
            Copy list
          </button>
          <button type="button" className="btn sm" onClick={() => setHideDone(!hideDone)}>
            {hideDone ? "Show checked" : "Hide checked"}
          </button>
        </div>
      </div>
      {copied ? <p className="small notice" style={{ margin: 0 }}>{copied}</p> : null}

      {stores.length ? (
        <div className="shop-at noprint">
          <label htmlFor="shop-at">Shopping at</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select id="shop-at" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Any store (average prices)</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.priceTier} · {s.distanceMi} mi{s.id === cheapest?.id ? " · cheapest" : ""}
                </option>
              ))}
            </select>
          </div>
          {store ? (
            <div className="row small" style={{ gap: 8, marginTop: 6 }}>
              <span className="muted">Get there:</span>
              <a href={directionsUrl(store, "transit", profile)} target="_blank" rel="noreferrer">
                Bus
              </a>
              <a href={directionsUrl(store, "walking", profile)} target="_blank" rel="noreferrer">
                Walk
              </a>
              <a href={directionsUrl(store, "bicycling", profile)} target="_blank" rel="noreferrer">
                Bike
              </a>
              <a href={directionsUrl(store, "driving", profile)} target="_blank" rel="noreferrer">
                Drive{store.driveMin ? ` (${store.driveMin} min)` : ""}
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>Pick your stores on the right to price this list at them and get bus directions.</p>
      )}

      <div>
        <div className="row between small">
          <b>
            {store ? `About $${total.toFixed(2)} at ${store.name}` : `Estimated total $${total.toFixed(2)}`} / ${profile.weeklyBudget} budget
          </b>
          <span className="muted">
            {plan.groceries.length - left.length} of {plan.groceries.length} in your cart
          </span>
        </div>
        <div className={`bar ${over ? "over" : ""}`}>
          <div style={{ width: `${Math.min(100, (total / profile.weeklyBudget) * 100)}%` }} />
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          {over ? "A bit over budget. Try a cheaper store, more dining hall meals, or swapping a meal or two." : `About $${(profile.weeklyBudget - total).toFixed(2)} under budget`}{" "}
          {left.length && left.length < plan.groceries.length ? `$${leftCost.toFixed(2)} left to buy. ` : ""}
          Priced by the package you buy; leftovers carry into next week.
        </p>
      </div>

      <div className="monad-cta noprint">
        <div>
          <b>Order this list with Monad</b>
          <div className="small muted">Pickup or delivery, paid onchain in one tap. Your money waits in escrow until you get your groceries.</div>
        </div>
        <Link className="btn primary sm" href={`/checkout${store ? `?store=${encodeURIComponent(store.id)}` : ""}`}>
          Checkout
        </Link>
      </div>

      {compare.length > 1 ? (
        <div className="compare noprint">
          <div className="row between">
            <b>Your list at each store</b>
            {savings >= 1 ? (
              <span className="tag">
                Save ~${savings.toFixed(2)} at {best.s.name}
              </span>
            ) : store && best?.s.id === store.id ? (
              <span className="tag">Cheapest of your stores</span>
            ) : null}
          </div>
          <ul className="compare-list">
            {compare.map(({ s: st, total: t }) => (
              <li key={st.id} className={st.id === store?.id ? "on" : ""}>
                <span>
                  {st.name}
                  <span className="muted small"> · {st.distanceMi} mi</span>
                </span>
                <span className="grocery-price">${t.toFixed(2)}</span>
                {st.id === store?.id ? (
                  <span className="small muted">shopping here</span>
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => setStoreId(st.id)}>
                    Shop here
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>
            Estimates from each store&apos;s typical prices. Want to stay at a pricier store? Some stores will match a competitor&apos;s advertised price, so pull up the
            cheaper store&apos;s app or ad at checkout and ask.
          </p>
        </div>
      ) : null}

      <div className="tips noprint">
        <b>Ways to save{store ? ` at ${store.name}` : ""}</b>
        <ul>
          {tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      {aisles.map((a) => {
        const items = plan.groceries.filter((g) => g.aisle === a && !(hideDone && checked[g.name]));
        if (!items.length) return null;
        return (
          <div key={a}>
            <h3 style={{ marginBottom: 4 }}>{a}</h3>
            {items.map((g) => {
              const link = store ? storeSearchUrl(store.name, `${searchBrand(g.aisle, g.name)}${g.name}`) : null;
              return (
                <div key={g.name} className="grocery-row">
                  <input type="checkbox" id={`g-${g.name}`} style={{ width: "auto" }} checked={!!checked[g.name]} onChange={(e) => toggle(g.name, e.target.checked)} />
                  <label htmlFor={`g-${g.name}`} className={checked[g.name] ? "done" : ""} style={{ fontWeight: 400, margin: 0 }}>
                    <b>{g.name}</b>
                    <span className="muted small" style={{ display: "block" }}>
                      {brandOf(g.aisle, g.name) ? <span className="buy-brand">{brandOf(g.aisle, g.name)}</span> : null}
                      {brandOf(g.aisle, g.name) ? " · " : ""}
                      {g.pkg}
                      {g.forMeals ? ` · for ${g.forMeals} meal${g.forMeals > 1 ? "s" : ""}` : ""}
                      {g.usage ? ` · ${g.usage}` : ""}
                      {g.estimated ? " · price estimated" : ""}
                    </span>
                    {link ? (
                      <a className="small noprint" href={link.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        {link.direct ? `Find at ${store!.name} ↗` : `Search ${store!.name} ↗`}
                      </a>
                    ) : null}
                  </label>
                  <span className="grocery-price">${priced(g.cost).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="muted small" style={{ margin: 0 }}>
        Prices are estimates. Store links search each store&apos;s own website for the cheapest brand, so you can check the exact price and what&apos;s in stock near you.
      </p>
    </div>
  );
}
