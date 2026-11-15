"use client";
import { useEffect, useRef, useState } from "react";
import NumberInput from "./NumberInput";
import { diningAllowance, fmtPoints, usesPoints, usesSwipes, weeksLeft } from "@/lib/dining/budget";
import { parseMenuLink, searchSchools } from "@/lib/dining/schools";
import type { DiningHall, DiningSchoolRef, DiningSetup } from "@/lib/dining/types";

interface Props {
  value: DiningSetup;
  swipes: number;
  onChange: (v: DiningSetup) => void;
  onSwipes: (n: number) => void;
}

type PlanInfo = {
  found: boolean;
  schoolName: string;
  menuUrl: string | null;
  pointsLabel: string | null;
  payment: "swipes" | "points" | "both" | null;
  balancePeriod: "term" | "week" | null;
  termType: "semester" | "quarter" | null;
  termEnd: string | null;
  pricing: "door" | "items" | null;
  doorPrice: { breakfast: number; lunch: number; dinner: number } | null;
  typicalSwipesPerWeek: number | null;
  notes: string;
  sources: string[];
};

const PAYMENT: [DiningSetup["payment"], string, string][] = [
  ["none", "No meal plan", "I don't eat at a dining hall"],
  ["swipes", "Meal swipes", "A set number of meals each week"],
  ["points", "Points / dining dollars", "A balance I spend"],
  ["both", "Swipes + points", "Some of each"],
];

const LABELS = ["Points", "Dining Dollars", "Flex Dollars", "Meal Points", "Duck Bucks", "Bonus Bucks"];

const qs = (s: DiningSchoolRef) => (s.provider === "link" ? `link=${encodeURIComponent(s.url || "")}` : `id=${encodeURIComponent(s.id)}`);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default function DiningSetupEditor({ value: d, swipes, onChange, onSwipes }: Props) {
  const set = <K extends keyof DiningSetup>(k: K, v: DiningSetup[K]) => onChange({ ...d, [k]: v });
  const [q, setQ] = useState(d.school?.name || "");
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [halls, setHalls] = useState<DiningHall[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const latest = useRef(d);
  latest.current = d;
  const matches = searchSchools(q).slice(0, 8);
  const exact = matches.some((s) => s.name.toLowerCase() === q.trim().toLowerCase());

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Load the dining halls whenever the school changes.
  useEffect(() => {
    if (!d.school || d.school.provider === "none") {
      setHalls([]);
      setMsg("");
      return;
    }
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

  /** Ask the server to look up how this school's dining plan works, then pre-fill the form. */
  const lookup = async (school: DiningSchoolRef) => {
    setLooking(true);
    setLookErr("");
    try {
      const res = await fetch("/api/dining/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school: school.name }),
      });
      const info = (await res.json()) as PlanInfo & { error?: string };
      if (info.error) throw new Error(info.error);
      const cur = latest.current;
      if (cur.school?.id !== school.id) return; // student picked another school meanwhile
      const next: DiningSetup = { ...cur };
      // Prefer a menu source we can read dish by dish.
      const found = info.menuUrl ? parseMenuLink(info.menuUrl) : null;
      if (found && found.provider !== "link" && (school.provider === "none" || school.provider === "link")) {
        next.school = { ...found, name: info.schoolName || school.name };
        next.hall = undefined;
      } else if (found && school.provider === "none") {
        next.school = { ...found, name: info.schoolName || school.name };
      }
      if (info.payment) next.payment = info.payment;
      if (info.pointsLabel) next.pointsLabel = info.pointsLabel;
      if (info.balancePeriod) next.balancePeriod = info.balancePeriod;
      if (info.termType) next.termType = info.termType;
      if (info.termEnd) next.termEnd = info.termEnd;
      if (info.pricing) next.pricing = info.pricing;
      if (info.doorPrice) next.doorPrice = info.doorPrice;
      next.planInfo = { notes: info.notes, sources: info.sources, checked: new Date().toISOString().slice(0, 10) };
      onChange(next);
      if (info.typicalSwipesPerWeek && (info.payment === "swipes" || info.payment === "both") && !swipes) onSwipes(Math.min(21, Math.round(info.typicalSwipesPerWeek)));
    } catch (e) {
      setLookErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  };

  const pickSchool = (s: DiningSchoolRef) => {
    const next = { ...d, school: s, hall: undefined, planInfo: undefined };
    onChange(next);
    latest.current = next;
    setQ(s.name);
    setOpen(false);
    void lookup(s);
  };

  const useLink = () => {
    const s = parseMenuLink(link);
    if (!s) return setMsg("That doesn't look like a web link.");
    onChange({ ...d, school: { ...s, name: d.school?.name && d.school.provider === "none" ? d.school.name : s.name }, hall: undefined });
    setLink("");
  };

  const allow = diningAllowance(swipes, d);
  const label = d.pointsLabel || "points";
  const weekly = d.balancePeriod === "week";

  return (
    <div className="stack">
      <div ref={boxRef}>
        <label htmlFor="school">Where do you go to school?</label>
        <div className="ac">
          <input
            id="school"
            value={q}
            placeholder="Start typing your college's name"
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
          />
          {open && q.trim().length > 0 ? (
            <ul className="ac-list" role="listbox">
              {matches.map((s) => (
                <li key={s.id} role="option" aria-selected={d.school?.id === s.id} className={d.school?.id === s.id ? "on" : ""} onMouseDown={() => pickSchool(s)}>
                  {s.name} <span className="muted small">· menus ready</span>
                </li>
              ))}
              {!exact && q.trim().length >= 3 ? (
                <li role="option" aria-selected={false} onMouseDown={() => pickSchool({ id: `name:${q.trim().toLowerCase()}`, name: q.trim(), provider: "none", slug: "" })}>
                  Use “{q.trim()}” <span className="muted small">· we&apos;ll look it up</span>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        {d.school ? (
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            ✓ {d.school.name}
            {d.school.provider === "none"
              ? " · no online menu found yet"
              : d.school.provider === "link"
                ? " · menu read by AI from a link (estimates may be rough)"
                : " · live menus with nutrition info"}
          </p>
        ) : null}
      </div>

      {d.school ? (
        <div className="notice stack" style={{ gap: 6 }}>
          {looking ? (
            <div className="row">
              <span className="spinner" /> Looking up how dining works at {d.school.name}…
            </div>
          ) : d.planInfo ? (
            <>
              <div>
                <b>How dining works at {d.school.name}: </b>
                {d.planInfo.notes}
              </div>
              <div className="small muted">
                We filled in what we found below. Check it matches your plan and fix anything that&apos;s different.
                {d.planInfo.sources.length ? (
                  <>
                    {" "}
                    Sources:{" "}
                    {d.planInfo.sources.map((s, i) => (
                      <span key={s}>
                        {i ? ", " : ""}
                        <a href={s} target="_blank" rel="noreferrer noopener">
                          {host(s)}
                        </a>
                      </span>
                    ))}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="row between">
              <span className="small">{lookErr || `We can look up how ${d.school.name}'s meal plan works.`}</span>
              <button type="button" className="btn sm" onClick={() => d.school && lookup(d.school)}>
                {lookErr ? "Try again" : "Look it up"}
              </button>
            </div>
          )}
        </div>
      ) : null}

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

      {d.payment !== "none" && d.school ? (
        <>
          {d.school.provider !== "nutritionaddition" && d.school.provider !== "nutrislice" ? (
            <details open={d.school.provider === "none"}>
              <summary className="small">Paste your dining menu link for dish-by-dish picks</summary>
              <p className="small muted" style={{ margin: "6px 0" }}>
                Works best with Nutrislice links (yourschool.nutrislice.com) or Nutrition Calculator links (app.mynutritioncalculator.net/yourschool). Other menu pages are read
                by AI.
              </p>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), useLink())} />
                <button type="button" className="btn" onClick={useLink} disabled={!link.trim()}>
                  Use link
                </button>
              </div>
            </details>
          ) : null}

          {d.school.provider !== "none" ? (
            <div>
              <label htmlFor="hall">Dining hall you eat at most</label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select id="hall" value={d.hall?.id || ""} onChange={(e) => set("hall", halls.find((h) => h.id === e.target.value))} disabled={loading || !halls.length}>
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
        </>
      ) : null}

      {d.payment !== "none" ? (
        <>
          {usesSwipes(d) ? (
            <div>
              <label>Meal swipes per week</label>
              <NumberInput min={0} max={21} value={swipes} onChange={(n) => onSwipes(Math.max(0, Math.min(21, n)))} />
            </div>
          ) : null}

          {usesPoints(d) ? (
            <div className="stack">
              <div>
                <label>How do you get your {label}?</label>
                <div className="option-grid">
                  <button type="button" className={`option ${!weekly ? "on" : ""}`} onClick={() => set("balancePeriod", "term")}>
                    <b>One balance for the term</b>
                    <small>Loaded once per semester or quarter</small>
                  </button>
                  <button type="button" className={`option ${weekly ? "on" : ""}`} onClick={() => set("balancePeriod", "week")}>
                    <b>A weekly amount</b>
                    <small>Resets every week, so use it or lose it</small>
                  </button>
                </div>
              </div>
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
                  <label>{weekly ? "Amount you get each week" : "Balance right now"}</label>
                  <NumberInput min={0} decimals value={d.pointsBalance} onChange={(n) => set("pointsBalance", Math.max(0, n))} />
                </div>
                {!weekly ? (
                  <div>
                    <label>Term ends</label>
                    <input type="date" value={d.termEnd} onChange={(e) => set("termEnd", e.target.value)} />
                  </div>
                ) : null}
              </div>
              {!weekly && !d.termEnd ? (
                <div className="row small" style={{ gap: 6 }}>
                  <span className="muted">No end date? Your school is on:</span>
                  {(["semester", "quarter"] as const).map((t) => (
                    <button key={t} type="button" className={`chip ${d.termType === t ? "on" : ""}`} onClick={() => set("termType", t)} style={{ textTransform: "capitalize" }}>
                      {t}s
                    </button>
                  ))}
                </div>
              ) : null}
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
                      <NumberInput min={0} decimals value={d.doorPrice[m]} onChange={(n) => set("doorPrice", { ...d.doorPrice, [m]: Math.max(0, n) })} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid g2">
                  <div>
                    <label>Typical main dish price</label>
                    <NumberInput min={0} decimals value={d.itemPrice.main} onChange={(n) => set("itemPrice", { ...d.itemPrice, main: Math.max(0, n) })} />
                  </div>
                  <div>
                    <label>Typical side price</label>
                    <NumberInput min={0} decimals value={d.itemPrice.side} onChange={(n) => set("itemPrice", { ...d.itemPrice, side: Math.max(0, n) })} />
                  </div>
                  <p className="small muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                    When the menu lists prices we use those. Otherwise we use these estimates, and you can fix any dish&apos;s price on the Dining tab.
                  </p>
                </div>
              )}
              <div className="notice">
                {d.pointsBalance > 0 ? (
                  weekly ? (
                    <>
                      Your <b>{fmtPoints(d.pointsBalance, label)}</b> reset every week, so we plan to use all of them: about <b>{allow.pointMeals} dining meals</b> a week
                      {usesSwipes(d) ? `, on top of your ${swipes} swipes` : ""}, plus a healthy snack with whatever&apos;s left.
                    </>
                  ) : (
                    <>
                      <b>{fmtPoints(+allow.pointsPerWeek.toFixed(2), label)} a week</b> for the next {weeksLeft(d)} weeks
                      {d.termEnd ? "" : ` (a guess for a ${d.termType}; add your term end date to be exact)`}. That covers about <b>{allow.pointMeals} dining meals</b> a week
                      {usesSwipes(d) ? `, on top of your ${swipes} swipes` : ""}.
                    </>
                  )
                ) : weekly ? (
                  <>Enter how much you get each week and we&apos;ll plan to use all of it.</>
                ) : (
                  <>Enter your balance and we&apos;ll split it evenly across the weeks left in your term so you don&apos;t run out early.</>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
