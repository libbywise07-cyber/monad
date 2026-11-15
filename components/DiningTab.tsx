"use client";
import { useEffect, useMemo, useState } from "react";
import DiningSetupEditor from "./DiningSetupEditor";
import { diningAllowance, fmtPoints, spentThisWeek as spentWeek, usesPoints, usesSwipes, weeksLeft, withDiningDefaults } from "@/lib/dining/budget";
import { itemPoints, rankItems } from "@/lib/dining/pick";
import type { DiningMenu, DiningSchoolRef, DiningSetup } from "@/lib/dining/types";
import { fmt12, nutritionTargets } from "@/lib/planner";
import { DAYS, type MealPlan, type Profile } from "@/lib/types";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const qs = (s: DiningSchoolRef) => (s.provider === "link" ? `link=${encodeURIComponent(s.url || "")}` : `id=${encodeURIComponent(s.id)}`);

export function diningSummary(p: Profile): string {
  const d = withDiningDefaults(p.dining);
  if (d.payment === "none") return p.diningSwipes ? `${p.diningSwipes} swipes/wk` : "No meal plan";
  const parts = [d.hall ? `${d.hall.name}, ${d.school?.name}` : d.school?.name || "No school picked"];
  if (usesSwipes(d)) parts.push(`${p.diningSwipes} swipes/wk`);
  if (usesPoints(d)) parts.push(d.balancePeriod === "week" ? `${fmtPoints(d.pointsBalance, d.pointsLabel)}/week` : `${fmtPoints(d.pointsBalance, d.pointsLabel)} left`);
  return parts.join(" · ");
}

function Balance({ profile, plan, setProfile }: { profile: Profile; plan: MealPlan; setProfile: (p: Profile) => void }) {
  const d = withDiningDefaults(profile.dining);
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const allow = diningAllowance(profile.diningSwipes, d);
  const label = d.pointsLabel || "points";
  const planned = plan.dining?.points ?? 0;
  const save = (dining: DiningSetup) => setProfile({ ...profile, dining });
  const today = ymd(new Date());
  const weekly = d.balancePeriod === "week";
  const spentThisWeek = spentWeek(d);

  // A term balance goes down as you spend. A weekly allowance stays the same; we just count this week's spending.
  const log = () => {
    const n = +amt;
    if (!(n > 0)) return;
    const entry = { date: today, amount: n, note: note.trim() };
    save({ ...d, pointsBalance: weekly ? d.pointsBalance : +Math.max(0, d.pointsBalance - n).toFixed(2), log: [entry, ...d.log].slice(0, 100) });
    setAmt("");
    setNote("");
  };
  const undo = (k: number) => {
    const l = d.log[k];
    save({ ...d, pointsBalance: weekly ? d.pointsBalance : +(d.pointsBalance + l.amount).toFixed(2), log: d.log.filter((_, i) => i !== k) });
  };

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>Your {label}</h2>
      <div className="grid g3">
        {weekly ? (
          <>
            <div>
              <div className="small muted">You get each week</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtPoints(d.pointsBalance, "")}</div>
              <div className="small muted">Resets weekly</div>
            </div>
            <div>
              <div className="small muted">Left this week</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtPoints(+Math.max(0, d.pointsBalance - spentThisWeek).toFixed(2), "")}</div>
              <div className="small muted">Use it before it resets</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="small muted">Balance</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtPoints(d.pointsBalance, "")}</div>
            </div>
            <div>
              <div className="small muted">Safe to spend per week</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtPoints(+allow.pointsPerWeek.toFixed(2), "")}</div>
              <div className="small muted">
                {weeksLeft(d)} weeks left{d.termEnd ? ` (term ends ${d.termEnd})` : ` (guess for a ${d.termType})`}
              </div>
            </div>
          </>
        )}
        <div>
          <div className="small muted">This plan uses</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtPoints(planned, "")}</div>
          <div className="small muted">{plan.dining?.swipes ? `+ ${plan.dining.swipes} swipes` : "this week"}</div>
        </div>
      </div>
      <div>
        <div className="row between small">
          <b>Spent this week</b>
          <span className="muted">
            {fmtPoints(+spentThisWeek.toFixed(2), "")} / {fmtPoints(+allow.pointsPerWeek.toFixed(2), label)}
          </span>
        </div>
        <div className={`bar ${spentThisWeek > allow.pointsPerWeek ? "over" : ""}`}>
          <div style={{ width: `${allow.pointsPerWeek ? Math.min(100, (spentThisWeek / allow.pointsPerWeek) * 100) : 0}%` }} />
        </div>
        {weekly && spentThisWeek < allow.pointsPerWeek && new Date().getDay() === 0 ? (
          <p className="small" style={{ marginTop: 6 }}>
            Your {label} reset after today. Grab fruit, yogurt or a salad with the {fmtPoints(+(allow.pointsPerWeek - spentThisWeek).toFixed(2), label)} left so they don&apos;t go to
            waste.
          </p>
        ) : null}
        {spentThisWeek > allow.pointsPerWeek ? (
          <p className="small err" style={{ marginTop: 6 }}>
            You&apos;re over this week&apos;s pace. Rebuild your plan and we&apos;ll lean on cheaper plates and home meals.
          </p>
        ) : null}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="number" min={0} step="0.01" placeholder={`${label} spent`} value={amt} onChange={(e) => setAmt(e.target.value)} style={{ maxWidth: 150 }} />
        <input placeholder="What for? (optional)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && log()} />
        <button type="button" className="btn primary" onClick={log} disabled={!(+amt > 0)}>
          Log
        </button>
      </div>
      {d.log.length ? (
        <table className="small">
          <tbody>
            {d.log.slice(0, 8).map((l, k) => (
              <tr key={k}>
                <td className="muted" style={{ width: 100 }}>
                  {l.date}
                </td>
                <td>{l.note || "Dining hall"}</td>
                <td style={{ textAlign: "right" }}>−{fmtPoints(l.amount, "")}</td>
                <td style={{ textAlign: "right", width: 60 }}>
                  <button type="button" className="btn ghost sm" onClick={() => undo(k)}>
                    Undo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Log what you spend after each visit (or just update your balance below) and your weekly budget adjusts.
        </p>
      )}
    </div>
  );
}

function MenuBrowser({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const d = withDiningDefaults(profile.dining);
  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner">(() => {
    const h = new Date().getHours();
    return h < 10 ? "breakfast" : h < 15 ? "lunch" : "dinner";
  });
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const priced = usesPoints(d) && d.pricing === "items";
  const label = d.pointsLabel || "points";

  useEffect(() => {
    if (!d.school || !d.hall) return;
    const ctrl = new AbortController();
    setLoading(true);
    setErr("");
    fetch(`/api/dining/menu?${qs(d.school)}&hall=${encodeURIComponent(d.hall.id)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: DiningMenu & { error?: string }) => (j.error ? setErr(j.error) : setMenu(j)))
      .catch((e) => (e as Error).name !== "AbortError" && setErr("Couldn't load the menu right now."))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [d.school, d.hall]);

  const ranked = useMemo(() => {
    if (!menu) return [];
    const today = ymd(new Date());
    let items = menu.items.filter((i) => i.meal === meal || i.meal === "all");
    if (menu.dated) {
      const t = items.filter((i) => i.date === today);
      items = t.length ? t : items;
    }
    const targets = nutritionTargets(profile);
    return rankItems(items, { profile, setup: d, target: targets });
  }, [menu, meal, profile, d]);

  if (!d.school || !d.hall) return null;
  const setPrice = (name: string, v: string) => {
    const o = { ...d.priceOverrides };
    if (v === "") delete o[name.toLowerCase()];
    else o[name.toLowerCase()] = Math.max(0, +v);
    setProfile({ ...profile, dining: { ...d, priceOverrides: o } });
  };
  const list = showAll ? ranked : ranked.slice(0, 12);

  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Healthiest at {d.hall.name}</h2>
        <div className="row" style={{ gap: 6 }}>
          {(["breakfast", "lunch", "dinner"] as const).map((m) => (
            <button key={m} type="button" className={`chip ${meal === m ? "on" : ""}`} onClick={() => setMeal(m)} style={{ textTransform: "capitalize" }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {menu?.dated ? "Today's menu" : "Everything this location serves"}, ranked for your goals: most protein and fiber per calorie, less sodium, saturated fat and sugar. Dishes that
        break your diet or allergies are hidden.
        {priced ? ` Tap a price to fix it; we'll use your number from now on.` : ""}
      </p>
      {loading ? (
        <div className="row muted">
          <span className="spinner" /> Loading menu…
        </div>
      ) : err ? (
        <p className="err">{err}</p>
      ) : !ranked.length ? (
        <p className="muted">Nothing on this menu fits your diet for {meal} today.</p>
      ) : (
        <>
          <table className="small">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Dish</th>
                <th style={{ textAlign: "right" }}>kcal</th>
                <th style={{ textAlign: "right" }}>Protein</th>
                <th style={{ textAlign: "right" }}>Fiber</th>
                {priced ? <th style={{ textAlign: "right" }}>{label}</th> : null}
              </tr>
            </thead>
            <tbody>
              {list.map(({ item: i, kind }) => (
                <tr key={i.id + i.name}>
                  <td>
                    <b>{i.name}</b>
                    <div className="muted">
                      {i.station !== "Menu" ? `${i.station} · ` : ""}
                      {kind === "main" ? "main" : "side"}
                      {i.vegan ? " · vegan" : i.vegetarian ? " · vegetarian" : ""}
                      {i.serving ? ` · ${i.serving}` : ""}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{i.kcal}</td>
                  <td style={{ textAlign: "right" }}>{Math.round(i.protein)}g</td>
                  <td style={{ textAlign: "right" }}>{i.fiber != null ? `${Math.round(i.fiber)}g` : "–"}</td>
                  {priced ? (
                    <td style={{ textAlign: "right", width: 90 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.25"
                        aria-label={`${i.name} price`}
                        value={d.priceOverrides[i.name.toLowerCase()] ?? ""}
                        placeholder={String(itemPoints(i, kind, d))}
                        onChange={(e) => setPrice(i.name, e.target.value)}
                        style={{ width: 80, padding: "4px 6px", textAlign: "right" }}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {ranked.length > 12 ? (
            <button type="button" className="btn ghost sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${ranked.length}`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function DiningTab({
  profile,
  plan,
  setProfile,
  rebuild,
  busy,
}: {
  profile: Profile;
  plan: MealPlan;
  setProfile: (p: Profile) => void;
  rebuild: (p: Profile) => void;
  busy: boolean;
}) {
  const d = withDiningDefaults(profile.dining);
  const [draft, setDraft] = useState<{ dining: DiningSetup; swipes: number } | null>(null);
  const meals = plan.days.flatMap((day) => day.meals.filter((m) => m.source === "dining").map((m) => ({ day: day.day, m })));
  const label = d.pointsLabel || "points";

  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="stack">
        {usesPoints(d) ? <Balance profile={profile} plan={plan} setProfile={setProfile} /> : null}
        <MenuBrowser profile={profile} setProfile={setProfile} />
        {d.payment === "none" && !profile.diningSwipes ? (
          <div className="card">
            <h2>No dining plan yet</h2>
            <p className="muted">Have a meal plan? Set it up here and we&apos;ll pick the healthiest dishes at your dining hall and track your swipes and points.</p>
          </div>
        ) : null}
      </div>
      <div className="stack">
        {meals.length ? (
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Dining hall meals this week</h2>
            {meals.map(({ day, m }, k) => (
              <div key={k} className="row between small" style={{ borderTop: k ? "1px solid var(--line)" : "none", paddingTop: k ? 8 : 0, flexWrap: "nowrap" }}>
                <div>
                  <b>
                    {DAYS[day]} {m.type} · {fmt12(m.time)}
                  </b>
                  <div>{m.name}</div>
                  <div className="muted">
                    {m.macros.kcal} kcal · {m.macros.protein}g protein
                  </div>
                </div>
                <span className="tag" style={{ whiteSpace: "nowrap" }}>
                  {m.dining?.pay === "points" ? `🪙 ${fmtPoints(m.dining.points, label)}` : "🍽️ swipe"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="card stack">
          <h2 style={{ margin: 0 }}>Dining plan settings</h2>
          <DiningSetupEditor
            value={draft?.dining ?? d}
            swipes={draft?.swipes ?? profile.diningSwipes}
            onChange={(v) => setDraft((x) => ({ dining: v, swipes: x?.swipes ?? profile.diningSwipes }))}
            onSwipes={(n) => setDraft((x) => ({ dining: x?.dining ?? d, swipes: n }))}
          />
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => {
                const next = draft ? { ...profile, dining: draft.dining, diningSwipes: draft.swipes } : profile;
                setProfile(next);
                setDraft(null);
                rebuild(next);
              }}
            >
              {busy ? "Planning…" : "Save & rebuild plan"}
            </button>
            {draft ? (
              <button type="button" className="btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
