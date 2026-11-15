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

type Place = { label: string; lat: number; lon: number };

export default function AddressInput({ value, lat, lon, onChange }: Props) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState("");
  const typed = useRef(false); // only search after the user types, not when a suggestion is picked
  const boxRef = useRef<HTMLDivElement>(null);

  // Search as you type (debounced; stale requests cancelled)
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q });
        if (lat != null && lon != null) {
          params.set("lat", String(lat));
          params.set("lon", String(lon));
        }
        const res = await fetch(`/api/geocode?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { places?: Place[]; error?: string };
        setResults(json.places || []);
        setActive(-1);
        setOpen(true);
        setMsg(json.error || "");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMsg("Address suggestions are unavailable right now.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // lat/lon only bias results; don't re-run when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // close the list when clicking elsewhere
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (p: Place) => {
    typed.current = false;
    onChange(p);
    setOpen(false);
    setResults([]);
    setMsg("");
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setMsg("Your browser can't share its location. Type your address instead.");
    setLocating(true);
    setMsg("");
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
        setLocating(false);
        setMsg(
          err.code === err.PERMISSION_DENIED
            ? "Location access was blocked. Allow it in your browser's address bar, or type your address."
            : "Couldn't get your location. Type your address instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active]);
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
          placeholder="Start typing, e.g. 2125 Franklin Blvd"
          onChange={(e) => {
            typed.current = true;
            onChange({ label: e.target.value }); // typing clears saved coordinates
          }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKey}
        />
        {loading ? <span className="spinner ac-spin" aria-hidden /> : null}
        {open && (results.length || !loading) ? (
          <ul className="ac-list" id="address-list" role="listbox">
            {results.length ? (
              results.map((r, i) => (
                <li
                  key={r.label}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? "on" : ""}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  📍 {r.label}
                </li>
              ))
            ) : (
              <li className="muted">No matches yet. Keep typing or add your city.</li>
            )}
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
      {msg ? <p className="err">{msg}</p> : null}
    </div>
  );
}
