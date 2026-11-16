"use client";
import { fmtMon, short, txUrl, type Order } from "@/lib/monad/client";

const STEPS: Record<"pickup" | "delivery", { key: Order["status"]; label: string }[]> = {
  pickup: [
    { key: "Paid", label: "Paid on Monad" },
    { key: "Accepted", label: "Store is packing it" },
    { key: "Ready", label: "Ready for pickup" },
    { key: "Completed", label: "Picked up, store paid" },
  ],
  delivery: [
    { key: "Paid", label: "Paid on Monad" },
    { key: "Accepted", label: "Store is packing it" },
    { key: "Ready", label: "Out for delivery" },
    { key: "Completed", label: "Delivered, store paid" },
  ],
};
const ORDER: Order["status"][] = ["Paid", "Accepted", "Ready", "Completed"];

/** One order with its live status timeline. `actions` renders the buttons for whoever is viewing. */
export default function OrderCard({ o, actions, lastTx, view }: { o: Order; actions?: React.ReactNode; lastTx?: string; view: "buyer" | "store" }) {
  const d = o.details;
  const reached = ORDER.indexOf(o.status);
  const time = new Date(o.placedAt * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className="card stack order-card">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="muted small">
            Order #{o.id.toString()} · {time} · {o.method === "delivery" ? "🚚 Delivery" : "🛍️ Pickup"}
          </div>
          <h3 style={{ margin: "2px 0" }}>{d?.store ?? "Grocery order"}</h3>
          <div className="small muted">
            {view === "store" ? `Customer ${d?.name ? d.name + " · " : ""}${short(o.buyer)}` : d?.where || ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <b>${d?.total.toFixed(2) ?? "–"}</b>
          <div className="small muted">{fmtMon(o.amount)}</div>
        </div>
      </div>

      {o.status === "Refunded" ? (
        <div className="notice small">↩️ Cancelled. {fmtMon(o.amount)} went back to the student&apos;s wallet.</div>
      ) : (
        <ol className="order-steps">
          {STEPS[o.method].map((s, i) => (
            <li key={s.key} className={i < reached ? "done" : i === reached ? "now" : ""}>
              <span className="dot" aria-hidden />
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {d ? (
        <div className="small">
          {o.method === "delivery" ? (
            <div>
              <b>Deliver to:</b> {d.address || "—"} · {d.slot}
            </div>
          ) : (
            <div>
              <b>Pickup:</b> {d.where || d.store} · {d.slot}
            </div>
          )}
          <details style={{ marginTop: 6 }}>
            <summary>
              {d.items.length} item{d.items.length === 1 ? "" : "s"} · subtotal ${d.subtotal.toFixed(2)}
              {d.fee ? ` + $${d.fee.toFixed(2)} delivery` : ""}
            </summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {d.items.map(([name, pkg, usd]) => (
                <li key={name}>
                  {name} <span className="muted">({pkg})</span> · ${usd.toFixed(2)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          {actions}
        </div>
        {lastTx ? (
          <a className="small" href={txUrl(lastTx)} target="_blank" rel="noreferrer">
            View on Monad explorer ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
