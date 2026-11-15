"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface Store {
  name: string;
  type: string;
  address: string;
  distanceMi: number;
  price: string;
  hours: string;
  mapUrl: string;
}

interface Props {
  address: string;
  lat?: number;
  lon?: number;
  /** search automatically whenever a location is available */
  auto?: boolean;
}

export default function StoreFinder({ address, lat, lon, auto = false }: Props) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ctrlRef = useRef<AbortController | null>(null);
  const hasCoords = lat != null && lon != null;

  const search = useCallback(async () => {
    if (!hasCoords && !address.trim()) return setErr("Enter your address or use your current location first.");
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setBusy(true);
    setErr("");
    try {
      const params = hasCoords ? `lat=${lat}&lon=${lon}` : `address=${encodeURIComponent(address)}`;
      const res = await fetch(`/api/stores?${params}`, { signal: ctrl.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStores(json.stores);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(e instanceof Error && e.message ? e.message : "Store lookup failed.");
    } finally {
      if (ctrlRef.current === ctrl) setBusy(false);
    }
  }, [address, lat, lon, hasCoords]);

  // Auto-search when a picked location (coordinates) changes, or on the dashboard.
  useEffect(() => {
    if (hasCoords || (auto && address)) search();
    return () => ctrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, auto]);

  const mapsSearch = `https://www.google.com/maps/search/grocery+stores/@${lat ?? ""},${lon ?? ""},14z`;
  const mapsLink = hasCoords ? mapsSearch : `https://www.google.com/maps/search/${encodeURIComponent("grocery stores near " + address)}`;

  return (
    <div className="stack">
      {busy ? (
        <div className="row muted small">
          <div className="spinner" /> Finding grocery stores near you…
        </div>
      ) : !hasCoords && !auto ? (
        <button type="button" className="btn sm" onClick={search} disabled={!address.trim()}>
          🔍 Find stores near this address
        </button>
      ) : null}
      {err ? (
        <div className="row">
          <span className="err">{err}</span>
          <button type="button" className="btn sm" onClick={search}>
            Retry
          </button>
          <a className="btn sm" href={mapsLink} target="_blank" rel="noreferrer">
            Open in Google Maps
          </a>
        </div>
      ) : null}
      {stores && !busy ? (
        stores.length ? (
          <div style={{ overflowX: "auto" }}>
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
                    <td style={{ whiteSpace: "nowrap" }}>{s.distanceMi} mi</td>
                    <td>{s.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">
            No grocery stores found within ~3 miles.{" "}
            <a href={mapsLink} target="_blank" rel="noreferrer">
              Search Google Maps
            </a>
          </p>
        )
      ) : null}
    </div>
  );
}
