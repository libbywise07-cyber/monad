"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import PantryEditor from "@/components/PantryEditor";
import StoreFinder from "@/components/StoreFinder";
import GroceryList from "@/components/GroceryList";
import NutritionExplainer from "@/components/NutritionExplainer";
import ThemePicker from "@/components/ThemePicker";
import MealsToCalendar from "@/components/MealsToCalendar";
import PrepScheduler from "@/components/PrepScheduler";
import CalendarSync from "@/components/CalendarSync";
import MealFeedback, { REASON_LABEL, type Feedback } from "@/components/MealFeedback";
import DiningTab, { diningSummary, hasMealPlan } from "@/components/DiningTab";
import Icon, { type IconName } from "@/components/Icons";
import { fmtPoints } from "@/lib/dining/budget";
import { requestPlan, resetAll, useStored } from "@/lib/store";
import { fmt12, fmtDuration, freeTimeLabel, nextBusy, STEP_LABEL, swapMeal, toMin } from "@/lib/planner";
import { DAYS, type DayIndex, type Macros, type MealPlan, type PlannedMeal, type Profile } from "@/lib/types";

type Tab = "today" | "week" | "dining" | "groceries" | "pantry" | "profile";
const todayIdx = () => ((new Date().getDay() + 6) % 7) as DayIndex;

const NAV: [Tab, string, IconName][] = [
  ["today", "Day", "home"],
  ["week", "Week", "calendar"],
  ["dining", "Dining", "dining"],
  ["groceries", "Groceries", "cart"],
  ["pantry", "Pantry", "pantry"],
  ["profile", "Profile", "user"],
];
const TAB_TITLES: Record<Tab, [string, string]> = {
  today: ["what's on", "your plate today"],
  week: ["your week", "of eats"],
  dining: ["dining hall", "+ your points"],
  groceries: ["the grocery", "run"],
  pantry: ["what's in", "your kitchen"],
  profile: ["you,", "in a nutshell"],
};
const REC_BG = ["var(--t-sky)", "var(--t-leaf)", "var(--t-lav)", "var(--t-peony)", "var(--t-rose)"];
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
};


/** Date (day of month) for a plan day: the next time that weekday comes up, starting today. */
function dateFor(d: DayIndex): Date {
  const x = new Date();
  x.setDate(x.getDate() + ((d - todayIdx() + 7) % 7));
  return x;
}

function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card)" strokeWidth={8} opacity={0.8} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${Math.min(1, pct) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

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

/** The four pastel stat tiles at the top of the Day view. */
function DayTiles({ plan, day, profile }: { plan: MealPlan; day: DayIndex; profile: Profile }) {
  const dp = plan.days.find((d) => d.day === day);
  if (!dp) return null;
  const t = dp.target ?? plan.targets;
  const proteinByMeal = dp.meals.map((m) => m.macros.protein);
  const maxP = Math.max(1, ...proteinByMeal);
  const dining = plan.dining;
  const diningMeals = plan.days.reduce((a, d) => a + d.meals.filter((m) => m.source === "dining").length, 0);
  return (
    <div className="tiles">
      <div className="tile peony">
        <div className="tile-top">
          <span className="tile-ic">
            <Icon name="flame" size={18} />
          </span>
          <span className="tile-label">Calories</span>
        </div>
        <div className="tile-val">
          {dp.totals.kcal.toLocaleString()}
          <small>/ {t.kcal.toLocaleString()}</small>
        </div>
        <Ring pct={dp.totals.kcal / t.kcal} />
      </div>
      <div className="tile lav">
        <div className="tile-top">
          <span className="tile-ic">
            <Icon name="dumbbell" size={18} />
          </span>
          <span className="tile-label">Protein</span>
        </div>
        <div className="tile-val">
          {dp.totals.protein}g<small>/ {t.protein}g</small>
        </div>
        <div className="mini-bars tile-foot" aria-label="Protein per meal">
          {proteinByMeal.map((v, k) => (
            <span key={k} className={v === maxP ? "hi" : ""} style={{ height: `${Math.max(12, (v / maxP) * 100)}%` }} />
          ))}
        </div>
      </div>
      <div className="tile sky">
        <div className="tile-top">
          <span className="tile-ic">
            <Icon name="grain" size={18} />
          </span>
          <span className="tile-label">Carbs & fat</span>
        </div>
        <div className="tile-foot stack" style={{ display: "grid", gap: 8 }}>
          <MacroBar label="Carbs" val={dp.totals.carbs} target={t.carbs} />
          <MacroBar label="Fat" val={dp.totals.fat} target={t.fat} />
        </div>
      </div>
      {dining && dining.pointsPerWeek > 0 ? (
        <div className="tile leaf">
          <div className="tile-top">
            <span className="tile-ic">
              <Icon name="coin" size={18} />
            </span>
            <span className="tile-label">{dining.pointsLabel} this week</span>
          </div>
          <div className="tile-val">
            {Math.round(dining.points)}
            <small>/ {Math.round(dining.pointsPerWeek)}</small>
          </div>
          <div className="tile-foot small muted">
            {dining.swipes ? `+ ${dining.swipes} swipes · ` : ""}
            {dining.hall}
          </div>
        </div>
      ) : diningMeals ? (
        <div className="tile leaf">
          <div className="tile-top">
            <span className="tile-ic">
              <Icon name="dining" size={18} />
            </span>
            <span className="tile-label">Dining hall</span>
          </div>
          <div className="tile-val">
            {diningMeals}
            <small>meals this week</small>
          </div>
          <div className="tile-foot small muted">{dining?.hall || "Swipes"}</div>
        </div>
      ) : (
        <div className="tile leaf">
          <div className="tile-top">
            <span className="tile-ic">
              <Icon name="cart" size={18} />
            </span>
            <span className="tile-label">Groceries</span>
          </div>
          <div className="tile-val">
            ${plan.groceryTotal.toFixed(0)}
            <small>/ ${profile.weeklyBudget}</small>
          </div>
          <div className="tile-foot small muted">{plan.groceries.length} items this week</div>
        </div>
      )}
    </div>
  );
}

/** "10:00 AM" */
const fmtTime = (t: string) => fmt12(t).replace(/(am|pm)$/, " $1").toUpperCase();

/** When a meal fits around the day's classes: "Right after Bio · 45 min before Chem at 1:00 PM". */
function whenNote(profile: Profile, day: DayIndex, m: PlannedMeal): string {
  const t = toMin(m.time);
  const blocks = profile.schedule.filter((b) => b.days.includes(day));
  const prev = blocks.filter((b) => toMin(b.end) <= t && t - toMin(b.end) <= 30).sort((a, b) => toMin(b.end) - toMin(a.end))[0];
  const next = blocks.filter((b) => toMin(b.start) > t).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
  const parts: string[] = [];
  if (m.source === "dining") parts.push(`At ${m.dining?.hall || "the dining hall"}`);
  if (prev) parts.push(`Right after ${prev.label}`);
  if (next && toMin(next.start) - t <= 180) parts.push(`${fmtDuration(toMin(next.start) - t)} before ${next.label} at ${fmtTime(next.start)}`);
  if (m.source === "prepped") parts.push("Made ahead in your prep session");
  return parts.join(" · ");
}

const splitTime = (t: string) => {
  const f = fmt12(t);
  return { time: f.slice(0, -2), ap: f.slice(-2).toUpperCase() };
};

function MealRow({
  m,
  when,
  free,
  pointsLabel,
  onSwap,
  onHide,
}: {
  m: PlannedMeal;
  when: string;
  free: string;
  pointsLabel: string;
  onSwap?: () => void;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPlate = Boolean(m.dining?.items.length);
  const t = splitTime(m.time);
  return (
    <li className={`dp-row ${m.type}`}>
      <div className="dp-time">
        <b>{t.time}</b>
        <small>{t.ap}</small>
      </div>
      <div className="dp-main">
        <div className="dp-type">
          {m.type}
          {free ? <span className="dp-free"> · {free}</span> : null}
        </div>
        <div className="dp-name">{m.name}</div>
        {when ? (
          <div className="dp-when">
            <Icon name="clock" size={14} /> {when}
          </div>
        ) : null}
        <div className="dp-meta">
          {m.macros.kcal} kcal · {m.macros.protein}g protein · {m.macros.carbs}g carbs · {m.macros.fat}g fat
        </div>
        <div className="dp-tags">
          {m.source === "dining" ? (
            <span className="tag sky">{m.dining?.pay === "points" ? fmtPoints(m.dining.points, pointsLabel) : "Meal swipe"}</span>
          ) : null}
          {m.source === "prepped" ? <span className="tag warn">Prep ahead</span> : null}
          {m.portable ? <span className="tag lav">Portable</span> : null}
          {m.prepMin ? <span className="tag">{m.prepMin} min</span> : null}
        </div>
        {m.why ? <p className="dp-why">{m.why}</p> : null}
        {m.usesPantry.length ? <p className="dp-why muted">From your pantry: {m.usesPantry.join(", ")}</p> : null}
        <div className="dp-actions">
          {m.steps.length || m.ingredients.length ? (
            <button type="button" className="dp-link" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Hide recipe" : "Show recipe"}
              <span className={`dp-caret ${open ? "up" : ""}`} aria-hidden>
                <Icon name="chevronDown" size={14} />
              </span>
            </button>
          ) : null}
          {onSwap ? (
            <button type="button" className="dp-link quiet" onClick={onSwap}>
              <Icon name="refresh" size={14} /> New meal
            </button>
          ) : null}
          {onHide ? (
            <button type="button" className="dp-link quiet" onClick={onHide}>
              Don&apos;t show again
            </button>
          ) : null}
        </div>
        {open ? (
          <div className="meal-detail small grid g2">
            {m.ingredients.length ? (
              <div>
                <b>Ingredients</b>
                <ul className="dp-steps">
                  {m.ingredients.map((x) => (
                    <li key={x.name}>
                      {x.qty} {x.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <b>{isPlate ? "Your plate" : "Steps"}</b>
              <ol className="dp-steps">
                {m.steps.map((st, k) => (
                  <li key={k}>{st}</li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Today's next meal at a glance: what it is, when, and how long until then. */
function UpNext({ plan, profile }: { plan: MealPlan; profile: Profile }) {
  const [now, setNow] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);
  const day = todayIdx();
  const meals = [...(plan.days.find((d) => d.day === day)?.meals || [])].sort((a, b) => toMin(a.time) - toMin(b.time));
  const next = meals.find((m) => toMin(m.time) >= now - 15); // still "up next" for the first 15 minutes
  if (!next) return null;
  const diff = toMin(next.time) - now;
  const t = splitTime(next.time);
  const when = whenNote(profile, day, next);
  return (
    <div className="upnext">
      <div className="upnext-time">
        <b>{t.time}</b>
        <small>{t.ap}</small>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="upnext-label">
          up next · {next.type} · {diff > 0 ? `in ${fmtDuration(diff)}` : "now"}
        </div>
        <div className="upnext-name">{next.name}</div>
        <div className="upnext-meta">
          {next.macros.kcal} kcal · {next.macros.protein}g protein
          {when ? ` · ${when}` : ""}
        </div>
      </div>
    </div>
  );
}

/** The day's meals in time order: when to eat, what it is, and the recipe if there's something to make. */
function DayPlan({
  plan,
  profile,
  day,
  onSwap,
  onHide,
}: {
  plan: MealPlan;
  profile: Profile;
  day: DayIndex;
  onSwap: (m: PlannedMeal) => void;
  onHide: (m: PlannedMeal) => void;
}) {
  const dp = plan.days.find((d) => d.day === day);
  const meals = [...(dp?.meals || [])].sort((a, b) => toMin(a.time) - toMin(b.time));
  const prep = plan.prepSession && plan.prepSession.day === day ? plan.prepSession : null;
  if (!meals.length && !prep) return <p className="muted">No meals planned for this day.</p>;
  const pointsLabel = plan.dining?.pointsLabel || "points";
  return (
    <ol className="dayplan">
      {meals.map((m, k) => (
        <MealRow
          key={k}
          m={m}
          when={whenNote(profile, day, m)}
          free={m.windowMin ? freeTimeLabel(m.windowMin, nextBusy(profile, day, m.time)) : ""}
          pointsLabel={pointsLabel}
          onSwap={m.source !== "dining" ? () => onSwap(m) : undefined}
          onHide={m.source !== "dining" ? () => onHide(m) : undefined}
        />
      ))}
      {prep ? (
        <li className="dp-row prep">
          <div className="dp-time">
            <b>{splitTime(prep.time).time}</b>
            <small>{splitTime(prep.time).ap}</small>
          </div>
          <div className="dp-main">
            <div className="dp-type">meal prep · {fmtDuration(prep.durationMin)}</div>
            <ul className="dp-steps small" style={{ marginTop: 4 }}>
              {prep.tasks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </li>
      ) : null}
    </ol>
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

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      {profile.calendar?.addMealsToCalendar ? (
        <div className="row between">
          <span className="muted small">Your plan follows your {profile.calendar.provider === "google" ? "Google" : "Outlook"} calendar.</span>
          <MealsToCalendar link={profile.calendar} plan={plan} schedule={profile.schedule} day={day} />
        </div>
      ) : null}
      <PrepScheduler profile={profile} plan={plan} onPlan={setPlan} />
      <div className="datepick" role="tablist" aria-label="Day">
        {DAYS.map((_, k) => (k + todayIdx()) % 7).map((i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === day}
            className={`${i === day ? "on" : ""} ${i === todayIdx() ? "today" : ""}`}
            onClick={() => setDay(i as DayIndex)}
          >
            <small>{i === todayIdx() ? "Today" : DAYS[i]}</small>
            <b>{dateFor(i as DayIndex).getDate()}</b>
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
      {day === todayIdx() ? <UpNext plan={plan} profile={profile} /> : null}
      {dp?.burn?.kcal ? (
        <div className="notice small">
          <b>Workout day:</b> +{dp.burn.kcal} kcal for {dp.burn.what.join(", ")}
        </div>
      ) : null}
      <DayTiles plan={plan} day={day} profile={profile} />
      {hiding ? <MealFeedback meal={hiding} onCancel={() => setHiding(null)} onSubmit={(f) => hide(hiding, f)} /> : null}
      <div className="section-head">
        <h2>{day === todayIdx() ? "today's plan" : `${DAYS[day]}'s plan`}</h2>
        <span className="small muted">{dp?.meals.length ?? 0} meals planned</span>
      </div>
      <DayPlan plan={plan} profile={profile} day={day} onSwap={(m) => swap(m)} onHide={(m) => setHiding(m)} />
    </div>
  );
}

function Week({ plan }: { plan: MealPlan }) {
  return (
    <div className="week">
      {plan.days.map((d) => (
        <div className={`col ${d.day === todayIdx() ? "today" : ""}`} key={d.day}>
          <b>
            {DAYS[d.day]} {dateFor(d.day).getDate()}
          </b>
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
  return (
    <div className="grid g2" style={{ alignItems: "start" }}>
      <GroceryList plan={plan} profile={profile} />
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
  // Open a specific tab from a link, e.g. /dashboard?tab=groceries (used by "Back to groceries").
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && NAV.some(([k]) => k === t)) setTab(t);
  }, []);
  // The Dining tab only shows for students on a meal plan.
  const showDining = profile ? hasMealPlan(profile) : false;
  const nav = NAV.filter(([t]) => t !== "dining" || showDining);
  useEffect(() => {
    if (tab === "dining" && profile && !showDining) setTab("today");
  }, [tab, profile, showDining]);
  const [day, setDay] = useState<DayIndex>(todayIdx());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pendingRebuild = useRef<Profile | null>(null);

  useEffect(() => {
    if (profile === null) router.replace("/onboarding");
  }, [profile, router]);

  const rebuild = async (p: Profile) => {
    setBusy(true);
    setErr("");
    try {
      const next = await requestPlan(p);
      // Keep a prep time the student already picked (and maybe put on their calendar).
      const picked = plan?.prepSession?.scheduledAt && Date.parse(plan.prepSession.scheduledAt) > Date.now() ? plan.prepSession : undefined;
      setPlan(picked ? { ...next, prepSession: { ...picked, tasks: next.prepSession?.tasks ?? picked.tasks } } : next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to build plan");
    } finally {
      setBusy(false);
      const again = pendingRebuild.current;
      pendingRebuild.current = null;
      if (again) void rebuild(again);
    }
  };

  useEffect(() => {
    if (profile && plan === null && !busy) rebuild(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, plan]);

  if (!profile) return <main className="wrap muted">Loading…</main>;

  return (
    <main className="wrap has-nav">
      <header className="row between">
        <div className="greet">
          <span className="avatar" aria-hidden>
            {(profile.name || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="small muted">{greeting()}</div>
            <div style={{ fontWeight: 600, fontSize: 17 }}>hey {profile.name}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/" className="brand hide-sm" style={{ marginRight: 6 }} aria-label="CampusFuel home">
            campus<span>fuel</span>
          </Link>
          <Link href="/orders" className="btn sm" title="Your grocery orders on Monad">
            Orders
          </Link>
          <button type="button" className="icon-btn dark" onClick={() => rebuild(profile)} disabled={busy} aria-label="Build a new plan" title="New plan">
            {busy ? <span className="spinner" /> : <Icon name="refresh" />}
          </button>
        </div>
      </header>
      <h1 className="headline">
        {TAB_TITLES[tab][0]}
        <br />
        <b>{TAB_TITLES[tab][1]}</b>
      </h1>
      {plan && tab === "today" ? (
        <p className="muted small" style={{ marginTop: -8 }}>
          Daily target {plan.targets.kcal} kcal · {plan.targets.protein}g protein · {plan.engine === "ai" ? "AI plan" : "built-in planner"}
        </p>
      ) : null}
      {plan?.note ? <div className="notice" style={{ marginBottom: 14 }}>{plan.note}</div> : null}
      {err ? <p className="err">{err}</p> : null}
      <CalendarSync
        profile={profile}
        onSynced={(p, changed) => {
          setProfile(p);
          if (!changed) return;
          if (busy) pendingRebuild.current = p; // finish the current build first, then redo it
          else void rebuild(p);
        }}
      />

      <nav className="bottom-nav" role="tablist" aria-label="Sections">
        {nav.map(([t, label, icon]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>

      {!plan ? (
        <div className="row muted">
          <div className="spinner" /> Building your first plan…
        </div>
      ) : (
        <>
          {tab === "today" && <Today plan={plan} profile={profile} day={day} setDay={setDay} setPlan={setPlan} setProfile={setProfile} />}
          {tab === "week" && <Week plan={plan} />}
          {tab === "dining" && showDining && <DiningTab profile={profile} plan={plan} setProfile={setProfile} rebuild={rebuild} busy={busy} />}
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
            <>
              <div className="section-head">
                <h2>Daily recommendations</h2>
              </div>
              <div className="recs">
                {plan.tips.map((t, k) => (
                  <div className="rec" key={t}>
                    <span className="rec-ic" style={{ background: REC_BG[k % REC_BG.length] }} aria-hidden>
                      <Icon name="check" size={16} />
                    </span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
