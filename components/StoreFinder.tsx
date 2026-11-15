"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_STORES, type SavedStore } from "@/lib/types";
import { directionsUrl } from "@/lib/storeLinks";

interface Store extends SavedStore {
  hours: string;
  straightMi: number;
  distanceKind: "drive" | "straight";
  mapUrl: string;
}

interface Props {
  address: string;
  lat?: number;
  lon?: number;
  /** search automatically whenever an address is available */
  auto?: boolean;
  /** estimated grocery list total, used to show what the list would cost at each store */
  listTotal?: number;
  /** when given, rows get checkboxes and the student can save up to 10 stores */
  selected?: SavedStore[];
  onSelectedChange?: (stores: SavedStore[]) => void;
}

const sameStore = (a: { name: string; lat: number; lon: number }, b: { name: string; lat: number; lon: number }) =>
  a.name.toLowerCase() === b.name.toLowerCase() && Math.abs(a.lat - b.lat) < 0.0015 && Math.abs(a.lon - b.lon) < 0.002;

const toSaved = (s: Store): SavedStore => ({
  id: s.id,
  name: s.name,
  type: s.type,
  address: s.address,
  lat: s.lat,
  lon: s.lon,
  distanceMi: s.distanceMi,
  driveMin: s.driveMin,
  priceTier: s.priceTier,
  priceFactor: s.priceFactor,
  priceKnown: s.priceKnown,
});

export default function StoreFinder({ address, lat, lon, auto = false, listTotal, selected, onSelectedChange }: Props) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);
  const [err, setErr] = useState("");
  const ctrlRef = useRef<AbortController | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const hasCoords = lat != null && lon != null;
  const selectable = Boolean(onSelectedChange);
  const picked = selected ?? [];

  const refreshSaved = (list: Store[]) => {
    // keep saved stores' distance/drive time current when better data arrives
    const cur = selectedRef.current;
    if (!onSelectedChange || !cur?.length) return;
    let changed = false;
    const next = cur.map((s) => {
      const m = list.find((x) => sameStore(x, s));
      if (m && (m.distanceMi !== s.distanceMi || m.driveMin !== s.driveMin || m.address !== s.address)) {
        changed = true;
        return { ...toSaved(m), address: m.address || s.address };
      }
      return s;
    });
    if (changed) onSelectedChange(next);
  };

  const search = useCallback(async () => {
    if (!hasCoords && !address.trim()) return setErr("Enter your address or use your current location first.");
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setBusy(true);
    setRefining(false);
    setErr("");
    const where = hasCoords ? `lat=${lat}&lon=${lon}` : `address=${encodeURIComponent(address)}`;
    try {
      // 1) fast answer
      const res = await fetch(`/api/stores?${where}&mode=fast`, { signal: ctrl.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStores(json.stores);
      setBusy(false);
      if (json.complete) return refreshSaved(json.stores);
      // 2) fuller answer with driving distances, swapped in when ready
      setRefining(true);
      const res2 = await fetch(`/api/stores?${where}&mode=full`, { signal: ctrl.signal });
      const json2 = await res2.json();
      if (res2.ok && json2.stores?.length) {
        setStores(json2.stores);
        refreshSaved(json2.stores);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (!stores) setErr(e instanceof Error && e.message ? e.message : "Store lookup failed.");
    } finally {
      if (ctrlRef.current === ctrl) {
        setBusy(false);
        setRefining(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, lat, lon, hasCoords]);

  useEffect(() => {
    if (hasCoords || (auto && address)) search();
    return () => ctrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, auto]);

  const toggle = (s: Store | SavedStore) => {
    if (!onSelectedChange) return;
    const on = picked.some((p) => sameStore(p, s));
    if (on) onSelectedChange(picked.filter((p) => !sameStore(p, s)));
    else if (picked.length < MAX_STORES) onSelectedChange([...picked, "hours" in s ? toSaved(s as Store) : s]);
  };

  // Keep results in distance order so rows don't jump when checked. Saved stores that aren't in
  // the current results (e.g. after changing address) are listed first so they can still be removed.
  const results = stores ?? [];
  const missingSaved: (Store | SavedStore)[] = picked.filter((p) => !results.some((r) => sameStore(r, p)));
  const rows: (Store | SavedStore)[] = selectable ? [...missingSaved, ...results] : results;

  const mapsLink = hasCoords
    ? `https://www.google.com/maps/search/grocery+stores/@${lat},${lon},14z`
    : `https://www.google.com/maps/search/${encodeURIComponent("grocery stores near " + address)}`;

  return (
    <div className="stack">
      {selectable ? (
        <div className="row between">
          <div>
            <h3 style={{ margin: 0 }}>Where do you shop?</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Pick up to {MAX_STORES} stores. We&apos;ll price your grocery list at them.
            </p>
          </div>
          <span className={`tag ${picked.length >= MAX_STORES ? "warn" : ""}`}>
            {picked.length} of {MAX_STORES} selected
          </span>
        </div>
      ) : null}

      {busy ? (
        <div className="row muted small">
          <div className="spinner" /> Finding grocery stores near you…
        </div>
      ) : !hasCoords && !auto && !stores ? (
        <button type="button" className="btn sm" onClick={search} disabled={!address.trim()}>
          Find stores near this address
        </button>
      ) : null}
      {refining ? (
        <div className="row muted small">
          <div className="spinner" /> Adding driving times and smaller shops…
        </div>
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

      {rows.length && !busy ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="stores">
              <thead>
                <tr>
                  {selectable ? <th style={{ width: 32 }} /> : null}
                  <th>Store</th>
                  <th>Distance</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const on = picked.some((p) => sameStore(p, s));
                  const full = !on && picked.length >= MAX_STORES;
                  const hours = "hours" in s ? (s as Store).hours : "";
                  const kind = "distanceKind" in s ? (s as Store).distanceKind : s.driveMin != null ? "drive" : "straight";
                  return (
                    <tr key={s.id} className={on ? "picked" : ""} onClick={selectable && !full ? () => toggle(s) : undefined} style={selectable ? { cursor: full ? "not-allowed" : "pointer" } : undefined}>
                      {selectable ? (
                        <td>
                          <input
                            type="checkbox"
                            id={`store-${s.id}`}
                            aria-label={`Shop at ${s.name}`}
                            style={{ width: "auto" }}
                            checked={on}
                            disabled={full}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggle(s)}
                          />
                        </td>
                      ) : null}
                      <td style={{ minWidth: 0 }}>
                        <a href={"mapUrl" in s ? (s as Store).mapUrl : `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          <b>{s.name}</b>
                        </a>
                        <div className="muted small">
                          {s.address || s.type}
                          {hours ? ` · ${hours}` : ""}
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {s.distanceMi} mi
                        <div className="muted small">{s.driveMin != null ? `${s.driveMin} min drive` : kind === "straight" ? "straight line" : ""}</div>
                        <div className="row travel-links" onClick={(e) => e.stopPropagation()}>
                          <a href={directionsUrl(s, "transit", { lat, lon, address })} target="_blank" rel="noreferrer" title="Bus directions in Google Maps">
                            Bus
                          </a>
                          <a href={directionsUrl(s, "walking", { lat, lon, address })} target="_blank" rel="noreferrer" title="Walking directions in Google Maps">
                            Walk
                          </a>
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {s.priceTier}
                        {listTotal ? <div className="muted small">your list ≈ ${(listTotal * s.priceFactor).toFixed(0)}</div> : null}
                        {!s.priceKnown ? <div className="muted small">est.</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            $ = budget, $$ = mid-range, $$$ = premium, based on each chain&apos;s typical prices.
            {listTotal ? " List costs are estimates, so check the store's app for exact prices." : ""}
          </p>
        </>
      ) : stores && !busy && !err ? (
        <p className="muted small">
          No grocery stores found within ~3 miles.{" "}
          <a href={mapsLink} target="_blank" rel="noreferrer">
            Search Google Maps
          </a>
        </p>
      ) : null}
    </div>
  );
}
