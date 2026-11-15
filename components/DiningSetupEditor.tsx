"use client";
import { useEffect, useRef, useState } from "react";
import { diningAllowance, fmtPoints, usesPoints, usesSwipes, weeksLeft } from "@/lib/dining/budget";
import { parseMenuLink, searchSchools } from "@/lib/dining/schools";
import type { DiningHall, DiningSchoolRef, DiningSetup } from "@/lib/dining/types";

interface Props {
  value: DiningSetup;
  swipes: number;
  onChange: (v: DiningSetup) => void;
  onSwipes: (n: number) => void;
}

const PAYMENT: [DiningSetup["payment"], string, string][] = [
  ["none", "No meal plan", "I don't eat at a dining hall"],
  ["swipes", "Meal swipes", "A set number of meals each week"],
  ["points", "Points / dining dollars", "A balance I spend down"],
  ["both", "Swipes + points", "Some of each"],
];

const LABELS = ["Points", "Dining Dollars", "Flex Dollars", "Meal Points", "Duck Bucks", "Bonus Bucks"];

const qs = (s: DiningSchoolRef) => (s.provider === "link" ? `link=${encodeURIComponent(s.url || "")}` : `id=${encodeURIComponent(s.id)}`);

export default function DiningSetupEditor({ value: d, swipes, onChange, onSwipes }: Props) {
  const set = <K extends keyof DiningSetup>(k: K, v: DiningSetup[K]) => onChange({ ...d, [k]: v });
  const [q, setQ] = useState(d.school?.name || "");
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = searchSchools(q).slice(0, 8);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Load the dining halls whenever the school changes.
  useEffect(() => {
    if (!d.school) return setHalls([]);
    const ctrl = new AbortController();
    setLoading(true);
    setMsg("");
    fetch(`/api/dining/halls?${qs(d.school)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { halls?: DiningHall[]; error?: string }) => {
        setHalls(j.halls || []);
        if (j.error) setMsg(j.error);
        else if (!j.halls?.length) setMsg("No dining halls with menus were found for this school.");
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setMsg("Couldn't load dining halls right now.");
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [d.school]);

  const pickSchool = (s: DiningSchoolRef) => {
    onChange({ ...d, school: s, hall: undefined });
    setQ(s.name);
    setOpen(false);
  };

  const useLink = () => {
    const s = parseMenuLink(link);
    if (!s) return setMsg("That doesn't look like a web link.");
    pickSchool(s);
    setLink("");
  };

  const allow = diningAllowance(swipes, d);
  const label = d.pointsLabel || "points";

  return (
    <div className="stack">
      <div>
        <label>How does your dining plan work?</label>
        <div className="option-grid">
          {PAYMENT.map(([v, t, s]) => (
            <button key={v} type="button" className={`option ${d.payment === v ? "on" : ""}`} onClick={() => set("payment", v)}>
              <b>{t}</b>
              <small>{s}</small>
            </button>
          ))}
        </div>
      </div>

      {d.payment !== "none" ? (
        <>
          <div ref={boxRef}>
            <label htmlFor="school">Your school</label>
            <div className="ac">
              <input
                id="school"
                value={q}
                placeholder="Start typing, e.g. Oregon"
                autoComplete="off"
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
              />
              {open ? (
                <ul className="ac-list" role="listbox">
                  {matches.map((s) => (
                    <li key={s.id} role="option" aria-selected={d.school?.id === s.id} className={d.school?.id === s.id ? "on" : ""} onMouseDown={() => pickSchool(s)}>
                      {s.name}
                    </li>
                  ))}
                  {!matches.length ? <li className="muted">Not in our list yet. Paste your dining menu link below.</li> : null}
                </ul>
              ) : null}
            </div>
            {d.school ? (
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                ✓ {d.school.name}
                {d.school.provider === "link" ? " · menu read by AI from your link (estimates may be rough)" : " · live menus with nutrition info"}
              </p>
            ) : null}
          </div>

          <details>
            <summary className="small">Don&apos;t see your school? Paste your dining menu link</summary>
            <p className="small muted" style={{ margin: "6px 0" }}>
              Works best with Nutrislice links (yourschool.nutrislice.com) or Nutrition Calculator links (app.mynutritioncalculator.net/yourschool). Other menu pages are read by
              AI and need an API key.
            </p>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), useLink())} />
              <button type="button" className="btn" onClick={useLink} disabled={!link.trim()}>
                Use link
              </button>
            </div>
          </details>

          {d.school ? (
            <div>
              <label htmlFor="hall">Dining hall you eat at most</label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select
                  id="hall"
                  value={d.hall?.id || ""}
                  onChange={(e) => set("hall", halls.find((h) => h.id === e.target.value))}
                  disabled={loading || !halls.length}
                >
                  <option value="">{loading ? "Loading dining halls…" : "Choose one"}</option>
                  {halls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                {loading ? <span className="spinner" /> : null}
              </div>
            </div>
          ) : null}
          {msg ? <p className="err">{msg}</p> : null}

          {usesSwipes(d) ? (
            <div>
              <label>Meal swipes per week</label>
              <input type="number" min={0} max={21} value={swipes} onChange={(e) => onSwipes(Math.max(0, Math.min(21, +e.target.value)))} />
            </div>
          ) : null}

          {usesPoints(d) ? (
            <div className="stack">
              <div className="grid g3">
                <div>
                  <label>What your school calls them</label>
                  <input list="point-labels" value={d.pointsLabel} onChange={(e) => set("pointsLabel", e.target.value)} />
                  <datalist id="point-labels">
                    {LABELS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label>Balance right now</label>
                  <input type="number" min={0} step="0.01" value={d.pointsBalance} onChange={(e) => set("pointsBalance", Math.max(0, +e.target.value))} />
                </div>
                <div>
                  <label>Term ends</label>
                  <input type="date" value={d.termEnd} onChange={(e) => set("termEnd", e.target.value)} />
                </div>
              </div>
              <div>
                <label>How are you charged at the dining hall?</label>
                <div className="option-grid">
                  <button type="button" className={`option ${d.pricing === "items" ? "on" : ""}`} onClick={() => set("pricing", "items")}>
                    <b>Per item</b>
                    <small>Each dish has its own price (à la carte)</small>
                  </button>
                  <button type="button" className={`option ${d.pricing === "door" ? "on" : ""}`} onClick={() => set("pricing", "door")}>
                    <b>One price to get in</b>
                    <small>Pay once, eat all you want</small>
                  </button>
                </div>
              </div>
              {d.pricing === "door" ? (
                <div className="grid g3">
                  {(["breakfast", "lunch", "dinner"] as const).map((m) => (
                    <div key={m}>
                      <label style={{ textTransform: "capitalize" }}>{m} price</label>
                      <input
                        type="number"
                        min={0}
                        step="0.25"
                        value={d.doorPrice[m]}
                        onChange={(e) => set("doorPrice", { ...d.doorPrice, [m]: Math.max(0, +e.target.value) })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid g2">
                  <div>
                    <label>Typical main dish price</label>
                    <input type="number" min={0} step="0.25" value={d.itemPrice.main} onChange={(e) => set("itemPrice", { ...d.itemPrice, main: Math.max(0, +e.target.value) })} />
                  </div>
                  <div>
                    <label>Typical side price</label>
                    <input type="number" min={0} step="0.25" value={d.itemPrice.side} onChange={(e) => set("itemPrice", { ...d.itemPrice, side: Math.max(0, +e.target.value) })} />
                  </div>
                  <p className="small muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                    We use these when the menu doesn&apos;t list prices. You can fix the price of any dish on the Dining tab.
                  </p>
                </div>
              )}
              <div className="notice">
                {d.pointsBalance > 0 ? (
                  <>
                    <b>
                      {fmtPoints(+allow.pointsPerWeek.toFixed(2), label)} a week
                    </b>{" "}
                    for the next {weeksLeft(d)} weeks{d.termEnd ? "" : " (we assumed a 10-week term; add your term end date)"}. That covers about{" "}
                    <b>{allow.pointMeals} dining meals</b> a week{usesSwipes(d) ? `, on top of your ${swipes} swipes` : ""}.
                  </>
                ) : (
                  <>Enter your balance and we&apos;ll spread it across the rest of your term so you don&apos;t run out early.</>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
