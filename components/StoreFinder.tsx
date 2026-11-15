"use client";
import { useEffect, useState } from "react";

interface Store {
  name: string;
  type: string;
  address: string;
  distanceMi: number;
  price: string;
  hours: string;
  mapUrl: string;
}

export default function StoreFinder({ address, auto = false }: { address: string; auto?: boolean }) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const search = async () => {
    if (!address.trim()) return setErr("Enter your address first.");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/stores?address=${encodeURIComponent(address)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStores(json.stores);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (auto && address) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, address]);

  return (
    <div className="stack">
      {!auto ? (
        <button type="button" className="btn sm" onClick={search} disabled={busy}>
          {busy ? "Searching…" : "🔍 Find stores near this address"}
        </button>
      ) : busy ? (
        <div className="row muted small">
          <div className="spinner" /> Finding stores near you…
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}
      {stores ? (
        stores.length ? (
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Distance</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.name + s.distanceMi}>
                  <td>
                    <a href={s.mapUrl} target="_blank" rel="noreferrer">
                      <b>{s.name}</b>
                    </a>
                    <div className="muted small">
                      {s.type}
                      {s.address ? ` · ${s.address}` : ""}
                      {s.hours ? ` · ${s.hours}` : ""}
                    </div>
                  </td>
                  <td>{s.distanceMi} mi</td>
                  <td>{s.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">No grocery stores found within ~3 miles.</p>
        )
      ) : null}
    </div>
  );
}
