"use client";
import { useEffect, useRef, useState } from "react";

export interface PickedPlace {
  label: string;
  lat?: number;
  lon?: number;
}

interface Props {
  value: string;
  lat?: number;
  lon?: number;
  onChange: (p: PickedPlace) => void;
}

type Place = { label: string; lat: number; lon: number; distanceMi?: number };
type Row = { kind: "place"; place: Place } | { kind: "more" } | { kind: "typed" };

const fmtMi = (d?: number) => (d == null ? "" : d < 0.1 ? "here" : d < 10 ? `${d.toFixed(1)} mi` : `${Math.round(d)} mi`);

export default function AddressInput({ value, lat, lon, onChange }: Props) {
  const [results, setResults] = useState<Place[]>([]);
  const [searchedMore, setSearchedMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const typed = useRef(false); // only search after the user types, not when a suggestion is picked
  const boxRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const query = value.trim();
  const rows: Row[] = [
    ...results.map((place) => ({ kind: "place" as const, place })),
    ...(query.length >= 3 && !searchedMore ? [{ kind: "more" as const }] : []),
    ...(query.length >= 3 ? [{ kind: "typed" as const }] : []),
  ];

  const runSearch = async (q: string, more: boolean) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (more) params.set("more", "1");
      if (lat != null && lon != null) {
        params.set("lat", String(lat));
        params.set("lon", String(lon));
      }
      const res = await fetch(`/api/geocode?${params}`, { signal: ctrl.signal });
      const json = (await res.json()) as { places?: Place[]; error?: string; near?: string | null };
      setResults(json.places || []);
      setSearchedMore(more);
      setActive(-1);
      setOpen(true);
      setMsg(json.error || "");
      setNote(json.near ? `Showing places near ${json.near} first` : "");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Address suggestions are unavailable right now. You can still use what you typed.");
    } finally {
      if (ctrlRef.current === ctrl) setLoading(false);
    }
  };

  // Search as you type (debounced; stale requests cancelled)
  useEffect(() => {
    if (!typed.current) return;
    if (query.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => runSearch(query, false), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      ctrlRef.current?.abort();
    };
  }, []);

  const pick = (p: PickedPlace) => {
    typed.current = false;
    ctrlRef.current?.abort();
    setLoading(false);
    onChange(p);
    setOpen(false);
    setResults([]);
    setSearchedMore(false);
    setMsg("");
  };

  const choose = (r: Row) => {
    if (r.kind === "place") pick(r.place);
    else if (r.kind === "more") runSearch(query, true);
    else pick({ label: query }); // stores are found by looking this text up later
  };

  const useApproximate = async (why: string) => {
    try {
      const res = await fetch("/api/geocode?approx=1");
      const json = (await res.json()) as { place?: Place };
      if (!json.place) throw new Error();
      pick({ label: `${json.place.label} (approximate)`, lat: json.place.lat, lon: json.place.lon });
      setMsg(`${why} We used your approximate area instead. For exact results, type your address or apartment name.`);
    } catch {
      setMsg(`${why} Type your address or apartment name instead.`);
    } finally {
      setLocating(false);
    }
  };

  const useMyLocation = () => {
    setMsg("");
    setLocating(true);
    if (!("geolocation" in navigator) || !window.isSecureContext)
      return useApproximate("This browser can't share an exact location.");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`/api/geocode?lat=${latitude}&lon=${longitude}`);
          const json = (await res.json()) as { place?: Place };
          pick(json.place || { label: "My current location", lat: latitude, lon: longitude });
        } catch {
          pick({ label: "My current location", lat: latitude, lon: longitude });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        const why =
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked. To allow it, click the icon at the left of the address bar, and on Windows turn on Settings › Privacy & security › Location."
            : "Your device couldn't find its exact location. On Windows, check that Settings › Privacy & security › Location is on.";
        useApproximate(why);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !open && query.length >= 3) {
      e.preventDefault();
      runSearch(query, true);
      return;
    }
    if (!open || !rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) choose(rows[active]);
      else if (results.length) pick(results[0]);
      else runSearch(query, true);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="stack" ref={boxRef}>
      <div className="ac">
        <input
          id="address"
          value={value}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="address-list"
          placeholder="Apartment name or street address, e.g. 2125 Franklin Blvd"
          onChange={(e) => {
            typed.current = true;
            onChange({ label: e.target.value }); // typing clears saved coordinates
          }}
          onFocus={() => rows.length && query.length >= 3 && setOpen(true)}
          onKeyDown={onKey}
        />
        {loading ? <span className="spinner ac-spin" aria-hidden /> : null}
        {open && rows.length ? (
          <ul className="ac-list" id="address-list" role="listbox">
            {note && results.length ? <li className="ac-note">{note}</li> : null}
            {!results.length && !loading ? (
              <li className="ac-note">{searchedMore ? "Still no match. Try the street address, or use what you typed." : "No matches yet."}</li>
            ) : null}
            {rows.map((r, i) => (
              <li
                key={r.kind === "place" ? r.place.label + i : r.kind}
                role="option"
                aria-selected={i === active}
                className={`${i === active ? "on" : ""} ${r.kind !== "place" ? "ac-action" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {r.kind === "place" ? (
                  <>
                    <span>📍 {r.place.label}</span>
                    {r.place.distanceMi != null ? <span className="ac-dist">{fmtMi(r.place.distanceMi)}</span> : null}
                  </>
                ) : r.kind === "more" ? (
                  <span>🔎 Search more places for “{query}”</span>
                ) : (
                  <span>✏️ Use “{query}” as typed</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={useMyLocation} disabled={locating}>
          {locating ? (
            <>
              <span className="spinner" /> Finding you…
            </>
          ) : (
            "📍 Use my current location"
          )}
        </button>
        {lat != null && lon != null ? <span className="tag">✓ Location set</span> : null}
      </div>
      {msg ? <p className="small notice" style={{ margin: 0 }}>{msg}</p> : null}
    </div>
  );
}
