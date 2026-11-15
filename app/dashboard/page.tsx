"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PantryEditor from "@/components/PantryEditor";
import StoreFinder from "@/components/StoreFinder";
import NutritionExplainer from "@/components/NutritionExplainer";
import ThemePicker from "@/components/ThemePicker";
import MealsToCalendar from "@/components/MealsToCalendar";
import { ProviderMark } from "@/components/CalendarConnect";
import MealFeedback, { REASON_LABEL, type Feedback } from "@/components/MealFeedback";
import DiningTab, { diningSummary } from "@/components/DiningTab";
import { fmtPoints } from "@/lib/dining/budget";
import { requestPlan, resetAll, useStored } from "@/lib/store";
import { fmt12, freeTimeLabel, nextBusy, STEP_LABEL, swapMeal, toMin } from "@/lib/planner";
import { DAYS, type DayIndex, type Macros, type MealPlan, type PlannedMeal, type Profile } from "@/lib/types";

type Tab = "today" | "week" | "dining" | "groceries" | "pantry" | "profile";
const todayIdx = () => ((new Date().getDay() + 6) % 7) as DayIndex;

function MacroBar({ label, val, target, unit = "g" }: { label: string; val: number; target: number; unit?: string }) {
  const pct = target ? Math.min(100, (val / target) * 100) : 0;
  return (
    <div>
      <div className="row between small">
        <b>{label}</b>
        <span className="muted">
          {Math.round(val)} / {target}
          {unit}
        </span>
      </div>
      <div className={`bar ${val > target * 1.12 ? "over" : ""}`}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Macrosline({ m }: { m: Macros }) {
  return (
    <span className="muted small">
      {m.kcal} kcal · {m.protein}g P · {m.carbs}g C · {m.fat}g F
    </span>
  );
}

function MealCard({
  m,
  pointsLabel,
  next,
  onSwap,
  onHide,
}: {
  m: PlannedMeal;
  pointsLabel: string;
  next?: { label: string; start: string };
  onSwap?: () => void;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`card tl-meal ${m.type === "snack" ? "snack" : ""}`} style={{ padding: 14 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="small muted">
            <span style={{ textTransform: "capitalize" }}>{m.type}</span>
            {m.windowMin && freeTimeLabel(m.windowMin, next) ? ` · ${freeTimeLabel(m.windowMin, next)}` : ""}
          </div>
          <h3 style={{ margin: "2px 0" }}>{m.name}</h3>
          <Macrosline m={m.macros} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          {m.source === "dining" ? (
            <span className="tag">{m.dining?.pay === "points" ? `🪙 ${fmtPoints(m.dining.points, pointsLabel)}` : "🍽️ swipe"}</span>
          ) : null}
          {m.source === "prepped" ? <span className="tag warn">🥡 prep ahead</span> : null}
          {m.portable ? <span className="tag">🎒 portable</span> : null}
          {m.prepMin ? <span className="tag">⏱ {m.prepMin}m</span> : null}
        </div>
      </div>
      <p className="small" style={{ margin: "8px 0 0" }}>
        {m.why}
      </p>
      {m.usesPantry.length ? <p className="small muted" style={{ margin: "4px 0 0" }}>✅ From your pantry: {m.usesPantry.join(", ")}</p> : null}
      <div className="row meal-actions">
        <button type="button" className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={() => setOpen(!open)}>
          {m.dining?.items.length ? (open ? "Hide plate ▲" : `What to get at ${m.dining.hall} ▼`) : open ? "Hide recipe ▲" : "Show recipe ▼"}
        </button>
        {onSwap ? (
          <button type="button" className="btn sm" onClick={onSwap}>
            ↻ New meal
          </button>
        ) : null}
        {onHide ? (
          <button type="button" className="btn ghost sm" onClick={onHide}>
            🚫 Don&apos;t show again
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="grid g2 small">
          {m.ingredients.length ? (
            <div>
              <b>Ingredients</b>
              <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                {m.ingredients.map((i) => (
                  <li key={i.name}>
                    {i.qty} {i.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <b>{m.dining?.items.length ? "Your plate" : "Steps"}</b>
            <ol style={{ margin: "4px 0", paddingLeft: 18 }}>
              {m.steps.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Today({
  plan,
  profile,
  day,
  setDay,
  setPlan,
  setProfile,
}: {
  plan: MealPlan;
  profile: Profile;
  day: DayIndex;
  setDay: (d: DayIndex) => void;
  setPlan: (p: MealPlan) => void;
  setProfile: (p: Profile) => void;
}) {
  const dp = plan.days.find((d) => d.day === day);
  const dayIdx = plan.days.findIndex((d) => d.day === day);
  const [hiding, setHiding] = useState<PlannedMeal | null>(null);
  const [toast, setToast] = useState("");
  const baseName = (m: PlannedMeal) => m.name.replace(/ \(×.*\)$/, "");

  const swap = (m: PlannedMeal, prof: Profile = profile, exclude: string[] = []) => {
    if (!dp) return;
    const next = swapMeal(prof, plan, dayIdx, dp.meals.indexOf(m), [baseName(m), ...exclude]);
    if (next) {
      setPlan(next);
      setToast(`Swapped in ${next.days[dayIdx].meals[dp.meals.indexOf(m)].name}.`);
    } else setToast("No other meal fits this time slot with your settings.");
  };

  const hide = (m: PlannedMeal, f: Feedback) => {
    const name = baseName(m);
    const reason = f.reason === "ingredient" ? `doesn't like ${f.ingredients.join(", ")}` : f.reason === "other" && f.note ? f.note : REASON_LABEL[f.reason];
    const next: Profile = {
      ...profile,
      blockedMeals: [...(profile.blockedMeals ?? []).filter((x) => x.name !== name), { name, reason }],
      dislikes: f.reason === "ingredient" ? [profile.dislikes, ...f.ingredients].filter(Boolean).join(", ") : profile.dislikes,
      preferQuick: profile.preferQuick || f.reason === "too-long",
      preferFilling: profile.preferFilling || f.reason === "not-filling",
    };
    setProfile(next);
    setHiding(null);
    swap(m, next);
    setToast(`Got it. We won't suggest ${name} again${f.reason === "ingredient" ? ` or anything with ${f.ingredients.join(", ")}` : ""}.`);
  };
  const items = useMemo(() => {
    const busy = profile.schedule
      .filter((b) => b.days.includes(day))
      .map((b) => ({ t: toMin(b.start), kind: "busy" as const, b }));
    const meals = (dp?.meals || []).map((m) => ({ t: toMin(m.time), kind: "meal" as const, m }));
    return [...busy, ...meals].sort((a, b) => a.t - b.t);
  }, [dp, profile.schedule, day]);

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      {profile.calendar?.addMealsToCalendar ? (
        <div className="row between">
          <span className="muted small">Your plan follows your {profile.calendar.provider === "google" ? "Google" : "Outlook"} calendar.</span>
          <MealsToCalendar link={profile.calendar} plan={plan} schedule={profile.schedule} day={day} />
        </div>
      ) : null}
      <div className="daypick">
        {DAYS.map((d, i) => (
          <button key={d} type="button" className={`chip ${i === day ? "on" : ""}`} onClick={() => setDay(i as DayIndex)}>
            {d}
            {i === todayIdx() ? " •" : ""}
          </button>
        ))}
      </div>
      {toast ? (
        <div className="notice small row between" role="status">
          <span>{toast}</span>
          <button type="button" className="btn ghost sm" onClick={() => setToast("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}
      {dp ? (
        <div className="card stack">
          {dp.burn?.kcal ? (
            <div className="small">
              🏋️ <b>Workout day:</b> +{dp.burn.kcal} kcal for {dp.burn.what.join(", ")}
            </div>
          ) : null}
          <div className="grid g2">
            <MacroBar label="Calories" val={dp.totals.kcal} target={(dp.target ?? plan.targets).kcal} unit="" />
            <MacroBar label="Protein" val={dp.totals.protein} target={(dp.target ?? plan.targets).protein} />
            <MacroBar label="Carbs" val={dp.totals.carbs} target={(dp.target ?? plan.targets).carbs} />
            <MacroBar label="Fat" val={dp.totals.fat} target={(dp.target ?? plan.targets).fat} />
          </div>
        </div>
      ) : null}
      {hiding ? <MealFeedback meal={hiding} onCancel={() => setHiding(null)} onSubmit={(f) => hide(hiding, f)} /> : null}
      {plan.prepSession && plan.prepSession.day === day ? (
        <div className="notice">
          <b>🧑‍🍳 Meal prep session · {fmt12(plan.prepSession.time)} ({plan.prepSession.durationMin} min)</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {plan.prepSession.tasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="timeline">
        {items.length ? (
          items.map((it, k) =>
            it.kind === "busy" ? (
              <div className="tl-item" key={`b${k}`}>
                <div className="tl-time">{fmt12(it.b.start)}</div>
                <div className="tl-busy">
                  {it.b.source ? <ProviderMark provider={it.b.source} /> : null} {it.b.label} <span style={{ fontWeight: 400 }}>· until {fmt12(it.b.end)}</span>
                </div>
              </div>
            ) : (
              <div className="tl-item" key={`m${k}`}>
                <div className="tl-time">{fmt12(it.m.time)}</div>
                <MealCard
                  m={it.m}
                  pointsLabel={plan.dining?.pointsLabel || "points"}
                  next={nextBusy(profile, day, it.m.time)}
                  onSwap={it.m.source !== "dining" ? () => swap(it.m) : undefined}
                  onHide={it.m.source !== "dining" ? () => setHiding(it.m) : undefined}
                />
              </div>
            ),
          )
        ) : (
          <p className="muted">Nothing scheduled for this day.</p>
        )}
      </div>
    </div>
  );
}

function Week({ plan }: { plan: MealPlan }) {
  return (
    <div className="week">
      {plan.days.map((d) => (
        <div className="col" key={d.day}>
          <b>{DAYS[d.day]}</b>
          <div className="muted small">
            {d.totals.kcal} kcal · {d.totals.protein}g P
          </div>
          {d.meals.map((m, k) => (
            <div className="m" key={k}>
              <div className="muted">{fmt12(m.time)}</div>
              {m.name}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Groceries({ plan, profile, setProfile }: { plan: MealPlan; profile: Profile; setProfile: (p: Profile) => void }) {
  const best = [...(profile.stores ?? [])].sort((a, b) => a.priceFactor - b.priceFactor || a.distanceMi - b.distanceMi)[0];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const over = plan.groceryTotal > profile.weeklyBudget;
  const aisles = [...new Set(plan.groceries.map((g) => g.aisle))];
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card stack">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Grocery list</h2>
          <button type="button" className="btn sm noprint" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <div>
          <div className="row between small">
            <b>Estimated total</b>
            <span>
              ${plan.groceryTotal.toFixed(2)} / ${profile.weeklyBudget}
            </span>
          </div>
          <div className={`bar ${over ? "over" : ""}`}>
            <div style={{ width: `${Math.min(100, (plan.groceryTotal / profile.weeklyBudget) * 100)}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            {over
              ? "A bit over budget. Try fewer cook-from-scratch meals, more dining swipes, or a lower-cost store."
              : `About $${(profile.weeklyBudget - plan.groceryTotal).toFixed(2)} under budget 🎉`}{" "}
            Priced by the package you buy at typical store-brand prices; leftovers carry into next week.
          </p>
        </div>
        {aisles.map((a) => (
          <div key={a}>
            <h3 style={{ marginBottom: 4 }}>{a}</h3>
            {plan.groceries
              .filter((g) => g.aisle === a)
              .map((g) => (
                <label key={g.name} className="grocery-row">
                  <input type="checkbox" style={{ width: "auto" }} checked={!!checked[g.name]} onChange={(e) => setChecked({ ...checked, [g.name]: e.target.checked })} />
                  <span className={checked[g.name] ? "done" : ""}>
                    <b>{g.name}</b>
                    <span className="muted small" style={{ display: "block" }}>
                      {g.pkg ? `${g.pkg}` : ""}
                      {g.forMeals ? ` · for ${g.forMeals} meal${g.forMeals > 1 ? "s" : ""}` : ""}
                      {g.usage ? ` · ${g.usage}` : ""}
                      {g.estimated ? " · price estimated" : ""}
                    </span>
                  </span>
                  <span className="grocery-price">${g.cost.toFixed(2)}</span>
                </label>
              ))}
          </div>
        ))}
      </div>
      <div className="card stack noprint">
        <h2 style={{ margin: 0 }}>Your stores</h2>
        {profile.address ? (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              Near {profile.address}
            </p>
            {best ? (
              <div className="notice small">
                Cheapest of your stores for this list: <b>{best.name}</b>, about ${(plan.groceryTotal * best.priceFactor).toFixed(0)}
                {best.distanceMi ? ` · ${best.distanceMi} mi` : ""}
              </div>
            ) : null}
            <StoreFinder
              address={profile.address}
              lat={profile.lat}
              lon={profile.lon}
              listTotal={plan.groceryTotal}
              auto
              selected={profile.stores ?? []}
              onSelectedChange={(stores) => setProfile({ ...profile, stores })}
            />
          </>
        ) : (
          <p className="muted">
            <Link href="/onboarding?step=7">Add your address</Link> to see nearby grocery stores.
          </p>
        )}
      </div>
    </div>
  );
}

function activitySummary(p: Profile) {
  const workouts = p.schedule.filter((b) => b.kind === "workout" || b.kind === "practice");
  const steps = p.steps ? STEP_LABEL[p.steps] : "steps not set";
  return workouts.length
    ? `${steps} · ${workouts.map((w) => `${w.activity || w.label} ${w.days.length}×/wk`).join(", ")}`
    : `${steps} · no workouts added`;
}

function ProfileTab({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const router = useRouter();
  const rows: [string, string, number][] = [
    ["About", `${profile.age} · ${Math.floor(profile.heightIn / 12)}'${profile.heightIn % 12}" · ${profile.weightLb} lb · ${profile.activity}`, 0],
    ["Activity", activitySummary(profile), 1],
    ["Goal", [profile.goal, ...profile.healthGoals].join(", "), 2],
    ["Diet", [profile.diet, ...profile.allergies.map((a) => `no ${a}`), profile.dislikes && `won't eat: ${profile.dislikes}`, profile.likes && `loves: ${profile.likes}`].filter(Boolean).join(", "), 3],
    ["Kitchen", `${profile.housing} · ${profile.appliances.join(", ") || "no appliances"} · skill ${profile.skill}/3`, 4],
    ["Dining", diningSummary(profile), 5],
    ["Calendar", profile.calendar ? `Connected to ${profile.calendar.provider === "google" ? "Google Calendar" : "Outlook"} (${profile.calendar.account})` : "Not connected", 6],
    ["Schedule", `${profile.schedule.length} blocks · weekdays ${fmt12(profile.wakeWeekday)}–${fmt12(profile.sleepWeekday)}`, 6],
    ["Budget", `$${profile.weeklyBudget}/week · ${profile.address || "no address"} · ${profile.stores?.length ?? 0} saved store${profile.stores?.length === 1 ? "" : "s"}`, 7],
    ["Pantry", `${profile.pantry.length} items`, 8],
  ];
  return (
    <div className="card">
      <table>
        <tbody>
          {rows.map(([k, v, s]) => (
            <tr key={k}>
              <th style={{ width: 110 }}>{k}</th>
              <td style={{ textTransform: k === "Budget" || k === "Schedule" || k === "Calendar" || k === "Dining" || k === "Activity" ? "none" : "capitalize" }}>{v}</td>
              <td style={{ textAlign: "right" }}>
                <Link className="btn sm" href={`/onboarding?step=${s}`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            if (confirm("Delete your profile and plan from this device?")) {
              resetAll();
              router.push("/");
            }
          }}
        >
          Reset everything
        </button>
      </div>
    </div>
  );
}

function ProfileExtras({ profile, setProfile }: { profile: Profile; setProfile: (p: Profile) => void }) {
  const blocked = profile.blockedMeals ?? [];
  return (
    <>
      <div className="card">
        <NutritionExplainer profile={profile} />
      </div>
      <div className="card">
        <ThemePicker />
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Meals you&apos;ve hidden</h3>
        {blocked.length ? (
          <ul className="plain-list">
            {blocked.map((m) => (
              <li key={m.name} className="row between">
                <span>
                  <b>{m.name}</b> <span className="muted small">· {m.reason}</span>
                </span>
                <button type="button" className="btn sm" onClick={() => setProfile({ ...profile, blockedMeals: blocked.filter((x) => x.name !== m.name) })}>
                  Show again
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            None yet. Tap &quot;Don&apos;t show again&quot; on any meal and we&apos;ll learn what you like.
          </p>
        )}
        {profile.preferQuick || profile.preferFilling ? (
          <p className="small" style={{ margin: 0 }}>
            We learned: {[profile.preferQuick && "you prefer quicker meals", profile.preferFilling && "you want more filling meals"].filter(Boolean).join(" and ")}.{" "}
            <button type="button" className="btn ghost sm" style={{ padding: 0 }} onClick={() => setProfile({ ...profile, preferQuick: false, preferFilling: false })}>
              Reset
            </button>
          </p>
        ) : null}
      </div>
    </>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { profile, plan, setProfile, setPlan } = useStored();
  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState<DayIndex>(todayIdx());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (profile === null) router.replace("/onboarding");
  }, [profile, router]);

  const rebuild = async (p: Profile) => {
    setBusy(true);
    setErr("");
    try {
      setPlan(await requestPlan(p));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to build plan");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (profile && plan === null && !busy) rebuild(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, plan]);

  if (!profile) return <main className="wrap muted">Loading…</main>;

  return (
    <main className="wrap">
      <nav className="row between" style={{ marginBottom: 12 }}>
        <Link href="/" className="brand">
          Campus<span>Fuel</span>
        </Link>
        <button type="button" className="btn sm primary" onClick={() => rebuild(profile)} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> Planning…
            </>
          ) : (
            "↻ New plan"
          )}
        </button>
      </nav>
      <h1 style={{ fontSize: 28 }}>Hey {profile.name} 👋</h1>
      {plan ? (
        <p className="muted">
          Daily target: <b>{plan.targets.kcal} kcal</b> · {plan.targets.protein}g protein · {plan.targets.carbs}g carbs · {plan.targets.fat}g fat ·{" "}
          {plan.engine === "ai" ? "✨ AI plan" : "Rule-based plan"}
        </p>
      ) : null}
      {plan?.note ? <div className="notice" style={{ marginBottom: 12 }}>{plan.note}</div> : null}
      {err ? <p className="err">{err}</p> : null}

      <div className="tabs" role="tablist">
        {(
          [
            ["today", "Day"],
            ["week", "Week"],
            ["dining", "Dining"],
            ["groceries", "Groceries"],
            ["pantry", "Pantry"],
            ["profile", "Profile"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      {!plan ? (
        <div className="row muted">
          <div className="spinner" /> Building your first plan…
        </div>
      ) : (
        <>
          {tab === "today" && <Today plan={plan} profile={profile} day={day} setDay={setDay} setPlan={setPlan} setProfile={setProfile} />}
          {tab === "week" && <Week plan={plan} />}
          {tab === "dining" && <DiningTab profile={profile} plan={plan} setProfile={setProfile} rebuild={rebuild} busy={busy} />}
          {tab === "groceries" && <Groceries plan={plan} profile={profile} setProfile={setProfile} />}
          {tab === "pantry" && (
            <div className="card stack">
              <h2>Your pantry</h2>
              <PantryEditor value={profile.pantry} onChange={(v) => setProfile({ ...profile, pantry: v })} />
              <button type="button" className="btn primary" onClick={() => rebuild(profile)} disabled={busy}>
                Rebuild plan with my pantry
              </button>
            </div>
          )}
          {tab === "profile" && (
            <div className="stack">
              <ProfileTab profile={profile} setProfile={setProfile} />
              <ProfileExtras profile={profile} setProfile={setProfile} />
            </div>
          )}
          {plan.tips.length && tab === "today" ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Tips for you</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
                {plan.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
