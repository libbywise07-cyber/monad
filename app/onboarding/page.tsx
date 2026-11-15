"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ScheduleEditor from "@/components/ScheduleEditor";
import PantryEditor from "@/components/PantryEditor";
import StoreFinder from "@/components/StoreFinder";
import { DEFAULT_PROFILE, loadProfile, requestPlan, saveProfile, savePlan } from "@/lib/store";
import { nutritionTargets } from "@/lib/planner";
import {
  ALLERGENS,
  APPLIANCES,
  HOUSING_DEFAULTS,
  type Activity,
  type Allergen,
  type Appliance,
  type Diet,
  type Goal,
  type Housing,
  type Profile,
  type Sex,
  type Skill,
} from "@/lib/types";

const STEPS = ["About you", "Goals", "Diet", "Kitchen", "Schedule", "Budget & location", "Pantry"];

const HEALTH_GOALS = [
  "More energy for class",
  "Better focus while studying",
  "Build muscle",
  "Fuel for sports / practice",
  "Better sleep",
  "Less added sugar",
  "More fiber & veggies",
  "Iron-rich foods",
  "Gut health",
  "Manage stress eating",
];

function Option<T extends string | number>({ v, cur, set, title, sub }: { v: T; cur: T; set: (v: T) => void; title: string; sub?: string }) {
  return (
    <button type="button" className={`option ${cur === v ? "on" : ""}`} onClick={() => set(v)}>
      <b>{title}</b>
      {sub ? <small>{sub}</small> : null}
    </button>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [p, setP] = useState<Profile>(DEFAULT_PROFILE);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const saved = loadProfile();
    if (saved) {
      setP(saved);
      setEditing(true);
    }
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    if (s >= 0 && s < STEPS.length) setStep(s);
  }, []);

  const up = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const targets = nutritionTargets(p);

  const canNext = step !== 0 || p.name.trim().length > 0;

  const finish = async () => {
    setBusy(true);
    setErr("");
    saveProfile(p);
    try {
      const plan = await requestPlan(p);
      savePlan(plan);
      router.push("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  const ft = Math.floor(p.heightIn / 12);
  const inch = p.heightIn % 12;

  return (
    <main className="wrap narrow">
      <nav className="row between" style={{ marginBottom: 18 }}>
        <Link href="/" className="brand">
          Campus<span>Fuel</span>
        </Link>
        {editing ? (
          <Link href="/dashboard" className="btn sm">
            Back to plan
          </Link>
        ) : null}
      </nav>

      <div className="progress" aria-hidden>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className="daypick" style={{ margin: "12px 0 18px" }}>
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={`chip ${i === step ? "on" : ""}`} onClick={() => (editing || i < step ? setStep(i) : null)} disabled={!editing && i > step}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <section className="card stack">
        {step === 0 && (
          <>
            <h2>Hey! Let&apos;s get to know you.</h2>
            <p className="muted">We use this to estimate your calorie and protein needs. It stays on your device.</p>
            <div>
              <label>First name</label>
              <input value={p.name} onChange={(e) => up("name", e.target.value)} placeholder="Alex" autoFocus />
            </div>
            <div className="grid g3">
              <div>
                <label>Age</label>
                <input type="number" min={15} max={80} value={p.age} onChange={(e) => up("age", +e.target.value)} />
              </div>
              <div>
                <label>Sex (for energy estimate)</label>
                <select value={p.sex} onChange={(e) => up("sex", e.target.value as Sex)}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label>Weight (lb)</label>
                <input type="number" min={70} max={450} value={p.weightLb} onChange={(e) => up("weightLb", +e.target.value)} />
              </div>
              <div>
                <label>Height (ft)</label>
                <input type="number" min={4} max={7} value={ft} onChange={(e) => up("heightIn", +e.target.value * 12 + inch)} />
              </div>
              <div>
                <label>Height (in)</label>
                <input type="number" min={0} max={11} value={inch} onChange={(e) => up("heightIn", ft * 12 + +e.target.value)} />
              </div>
            </div>
            <label>How active are you?</label>
            <div className="option-grid">
              {(
                [
                  ["sedentary", "Mostly sitting", "Class + desk"],
                  ["light", "Light", "Walk around campus"],
                  ["moderate", "Moderate", "Gym 3–4×/week"],
                  ["active", "Very active", "Daily training"],
                  ["athlete", "Student athlete", "Practice + lifts"],
                ] as [Activity, string, string][]
              ).map(([v, t, s]) => (
                <Option key={v} v={v} cur={p.activity} set={(x) => up("activity", x)} title={t} sub={s} />
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>What are you going for?</h2>
            <div className="option-grid">
              {(
                [
                  ["focus", "Energy & focus", "Steady fuel for long days"],
                  ["maintain", "Maintain", "Eat balanced, stay the same"],
                  ["lose", "Lose fat", "Gentle deficit, high protein"],
                  ["gain", "Build muscle", "Surplus + high protein"],
                  ["performance", "Athletic performance", "Fuel training & recovery"],
                ] as [Goal, string, string][]
              ).map(([v, t, s]) => (
                <Option key={v} v={v} cur={p.goal} set={(x) => up("goal", x)} title={t} sub={s} />
              ))}
            </div>
            <label>Health goals (pick any)</label>
            <div className="chips">
              {HEALTH_GOALS.map((g) => (
                <button type="button" key={g} className={`chip ${p.healthGoals.includes(g) ? "on" : ""}`} onClick={() => up("healthGoals", toggle(p.healthGoals, g))}>
                  {g}
                </button>
              ))}
            </div>
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="row between">
                <b>Your daily targets</b>
                <span className="muted small">Leave blank to use our estimate</span>
              </div>
              <div className="grid g3" style={{ marginTop: 10 }}>
                {(
                  [
                    ["kcal", "Calories"],
                    ["protein", "Protein (g)"],
                    ["carbs", "Carbs (g)"],
                    ["fat", "Fat (g)"],
                  ] as const
                ).map(([k, l]) => (
                  <div key={k}>
                    <label>{l}</label>
                    <input
                      type="number"
                      placeholder={String(targets[k])}
                      value={p.customMacros?.[k] ?? ""}
                      onChange={(e) => up("customMacros", { ...p.customMacros, [k]: e.target.value ? +e.target.value : undefined })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Dietary restrictions</h2>
            <label>Eating style</label>
            <div className="option-grid">
              {(["omnivore", "vegetarian", "vegan", "pescatarian", "halal", "kosher"] as Diet[]).map((d) => (
                <Option key={d} v={d} cur={p.diet} set={(x) => up("diet", x)} title={d[0].toUpperCase() + d.slice(1)} />
              ))}
            </div>
            <label>Allergies & intolerances</label>
            <div className="chips">
              {ALLERGENS.map((a) => (
                <button type="button" key={a} className={`chip ${p.allergies.includes(a) ? "on" : ""}`} onClick={() => up("allergies", toggle<Allergen>(p.allergies, a))}>
                  {a}
                </button>
              ))}
            </div>
            <div>
              <label>Foods you won&apos;t eat (comma separated)</label>
              <input value={p.dislikes} onChange={(e) => up("dislikes", e.target.value)} placeholder="mushrooms, tuna, olives" />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Where do you live and cook?</h2>
            <div className="option-grid">
              {(
                [
                  ["dorm", "🏢 Dorm", "Microwave + mini fridge"],
                  ["apartment", "🏠 Apartment", "Full kitchen"],
                  ["greek", "🏛️ Sorority / frat house", "Shared kitchen or house chef"],
                  ["home", "🏡 Living at home", "Family kitchen"],
                ] as [Housing, string, string][]
              ).map(([v, t, s]) => (
                <Option
                  key={v}
                  v={v}
                  cur={p.housing}
                  set={(x) => setP((pp) => ({ ...pp, housing: x, appliances: HOUSING_DEFAULTS[x] }))}
                  title={t}
                  sub={s}
                />
              ))}
            </div>
            <label>Appliances you can use</label>
            <div className="chips">
              {APPLIANCES.map((a) => (
                <button type="button" key={a} className={`chip ${p.appliances.includes(a) ? "on" : ""}`} onClick={() => up("appliances", toggle<Appliance>(p.appliances, a))}>
                  {a}
                </button>
              ))}
            </div>
            <label>Cooking skill</label>
            <div className="option-grid">
              {(
                [
                  [1, "Beginner", "Microwave, assemble, boil water"],
                  [2, "Getting there", "Can follow a simple recipe"],
                  [3, "Confident", "Comfortable at the stove"],
                ] as [Skill, string, string][]
              ).map(([v, t, s]) => (
                <Option key={v} v={v} cur={p.skill} set={(x) => up("skill", x)} title={t} sub={s} />
              ))}
            </div>
            <div className="grid g2">
              <div>
                <label>Max time to cook one meal: {p.maxCookMin} min</label>
                <input type="range" min={5} max={60} step={5} value={p.maxCookMin} onChange={(e) => up("maxCookMin", +e.target.value)} />
              </div>
              <div>
                <label>Dining hall / house meal swipes per week</label>
                <input type="number" min={0} max={21} value={p.diningSwipes} onChange={(e) => up("diningSwipes", +e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Your weekly schedule</h2>
            <p className="muted">We only schedule meals in your free time. Add every class, shift, practice and study block.</p>
            <div className="grid g2">
              <div>
                <label>Weekday wake / sleep</label>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="time" value={p.wakeWeekday} onChange={(e) => up("wakeWeekday", e.target.value)} />
                  <input type="time" value={p.sleepWeekday} onChange={(e) => up("sleepWeekday", e.target.value)} />
                </div>
              </div>
              <div>
                <label>Weekend wake / sleep</label>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="time" value={p.wakeWeekend} onChange={(e) => up("wakeWeekend", e.target.value)} />
                  <input type="time" value={p.sleepWeekend} onChange={(e) => up("sleepWeekend", e.target.value)} />
                </div>
              </div>
            </div>
            <ScheduleEditor value={p.schedule} onChange={(v) => up("schedule", v)} />
          </>
        )}

        {step === 5 && (
          <>
            <h2>Budget & location</h2>
            <div>
              <label>Weekly grocery budget: ${p.weeklyBudget}</label>
              <input type="range" min={20} max={200} step={5} value={p.weeklyBudget} onChange={(e) => up("weeklyBudget", +e.target.value)} />
              <p className="muted small">About ${(p.weeklyBudget / 7).toFixed(2)} a day. Dining swipes don&apos;t count toward this.</p>
            </div>
            <div>
              <label>Your address (or campus + city)</label>
              <input value={p.address} onChange={(e) => up("address", e.target.value)} placeholder="e.g. 100 University Ave, Austin, TX" />
              <p className="muted small">Only used to find grocery stores near you.</p>
            </div>
            <StoreFinder address={p.address} />
          </>
        )}

        {step === 6 && (
          <>
            <h2>What&apos;s already in your kitchen?</h2>
            <p className="muted">We plan around what you have so you buy less and waste less.</p>
            <PantryEditor value={p.pantry} onChange={(v) => up("pantry", v)} />
          </>
        )}

        {err ? <p className="err">{err}</p> : null}
        <div className="row between footer-nav">
          <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
            ← Back
          </button>
          <div className="row">
            {editing && step < STEPS.length - 1 ? (
              <button type="button" className="btn" onClick={finish} disabled={busy || !canNext}>
                Save & rebuild plan
              </button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next →
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={finish} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" /> Building your week…
                  </>
                ) : editing ? (
                  "Save & rebuild plan"
                ) : (
                  "Build my meal plan 🎉"
                )}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
