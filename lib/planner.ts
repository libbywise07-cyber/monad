import { RECIPES, type Recipe } from "./recipes";
import { findProduct, priceGroceries } from "./prices";
import { diningAllowance, withDiningDefaults } from "./dining/budget";
import type {
  DayIndex,
  DayPlan,
  FreeWindow,
  GroceryItem,
  Macros,
  MealPlan,
  MealType,
  PlannedMeal,
  Profile,
  ScheduleBlock,
} from "./types";

// ---------- time helpers ----------
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (m: number) => {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};
export const fmt12 = (t: string) => {
  const m = toMin(t);
  const h = Math.floor(m / 60);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")}${ap}`;
};

/** "45 min", "1 hr 30 min", "3 hr" */
export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} hr${m ? ` ${m} min` : ""}` : `${m} min`;
};

/**
 * How much free time a meal has, in plain words. Short breaks show a length ("45 min free").
 * Long stretches name what comes next ("free until Bio at 10:00am"), or return "" when the rest of the day is open.
 */
export function freeTimeLabel(windowMin: number, next?: { label: string; start: string }): string {
  if (windowMin < 180) return `${fmtDuration(windowMin)} free`;
  return next ? `free until ${next.label} at ${fmt12(next.start)}` : ""; // rest of the day is open: nothing worth saying
}

/** The next class, shift or other block that day after a given time, if any. */
export function nextBusy(p: Profile, day: DayIndex, time: string): { label: string; start: string } | undefined {
  const t = toMin(time);
  return p.schedule
    .filter((b) => b.days.includes(day) && toMin(b.start) > t)
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((b) => ({ label: b.label, start: b.start }))[0];
}

/** Short note on why a meal fits the time the student has. */
export const timeFitNote = (windowMin: number, type?: MealType) =>
  windowMin < 30
    ? `Only ${windowMin} min free, so it's portable and quick.`
    : windowMin >= 180
      ? type === "snack"
        ? "A quick snack to keep your energy steady between meals."
        : "You have time to cook it fresh and sit down to eat."
      : `Fits your ${fmtDuration(windowMin)} break.`;

// ---------- nutrition targets ----------
const ACTIVITY_FACTOR = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 } as const;
// Everyday movement only (no workouts). Used when the student tells us their steps or workouts.
export const STEP_FACTOR = { under5k: 1.25, "5to8k": 1.35, "8to12k": 1.45, over12k: 1.55 } as const;
export const STEP_LABEL = { under5k: "under 5,000 steps", "5to8k": "5,000–8,000 steps", "8to12k": "8,000–12,000 steps", over12k: "over 12,000 steps" } as const;
// Metabolic equivalents (Compendium of Physical Activities): calories/hour ≈ MET × body weight (kg).
// We add only the part above resting (MET − 1), since resting burn is already counted.
const MET_BY_ACTIVITY: Record<string, [number, number, number]> = {
  lifting: [3.5, 5, 6],
  running: [6, 9, 11.5],
  cycling: [4, 7, 10],
  swimming: [5, 7, 9.5],
  "sports practice": [5, 7, 9],
  "yoga / pilates": [2.5, 3, 4],
  dance: [4, 5.5, 7.5],
  hiking: [4.5, 6, 7.5],
  intramurals: [5, 7, 8],
  "hiit / class": [6, 8, 10],
};
const MET_DEFAULT: [number, number, number] = [4, 6, 8];
const INTENSITY_IDX = { light: 0, moderate: 1, hard: 2 } as const;
const GOAL_ADJ = { lose: -400, gain: 300, performance: 150, maintain: 0, focus: 0 } as const;
const PROTEIN_PER_KG = { gain: 1.8, performance: 1.8, lose: 1.6, maintain: 1.3, focus: 1.3 } as const;

const isExercise = (b: ScheduleBlock) => b.kind === "workout" || b.kind === "practice";
const blockHours = (b: ScheduleBlock) => Math.max(0, (toMin(b.end) - toMin(b.start)) / 60);

export function bmrOf(p: Profile) {
  const kg = p.weightLb * 0.4536;
  const cm = p.heightIn * 2.54;
  const sexAdj = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
  return 10 * kg + 6.25 * cm - 5 * p.age + sexAdj; // Mifflin–St Jeor
}

/** Calories a workout/practice block burns above resting. */
export function workoutKcal(p: Profile, b: ScheduleBlock) {
  const kg = p.weightLb * 0.4536;
  const mets = MET_BY_ACTIVITY[(b.activity || (b.kind === "practice" ? "sports practice" : "")).toLowerCase()] ?? MET_DEFAULT;
  return Math.round((mets[INTENSITY_IDX[b.intensity ?? "moderate"]] - 1) * kg * blockHours(b));
}

/** True when we can count workouts separately instead of guessing from the activity level. */
export const detailedActivity = (p: Profile) => Boolean(p.steps) || p.schedule.some(isExercise);

function macrosFor(p: Profile, kcal: number): Macros {
  const kg = p.weightLb * 0.4536;
  let protein = Math.round(kg * PROTEIN_PER_KG[p.goal]);
  let fat = Math.round((kcal * 0.28) / 9);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  const c = p.customMacros || {};
  if (c.protein) protein = c.protein;
  if (c.fat) fat = c.fat;
  if (c.carbs) carbs = c.carbs;
  else if (c.kcal || c.protein || c.fat) carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

/** Targets for one day: workout days get the calories that day's training burns (mostly as carbs). */
export function dayTargets(p: Profile, day: DayIndex): Macros & { burn: number; what: string[] } {
  const bmr = bmrOf(p);
  const custom = p.customMacros?.kcal;
  let base: number;
  let burn = 0;
  const what: string[] = [];
  if (detailedActivity(p)) {
    base = bmr * STEP_FACTOR[p.steps ?? "5to8k"];
    for (const b of p.schedule.filter((x) => x.days.includes(day) && isExercise(x))) {
      const k = workoutKcal(p, b);
      burn += k;
      what.push(`${b.activity || b.label} (+${k})`);
    }
  } else base = bmr * ACTIVITY_FACTOR[p.activity];
  let kcal = custom ? custom + (detailedActivity(p) ? burn : 0) : base + burn + GOAL_ADJ[p.goal];
  kcal = Math.max(1400, Math.round(kcal / 10) * 10);
  return { ...macrosFor(p, kcal), burn, what };
}

/** Weekly average targets (what we show as "your daily target"). */
export function nutritionTargets(p: Profile): Macros {
  const days = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => dayTargets(p, d));
  const avg = (k: keyof Macros) => Math.round(days.reduce((a, d) => a + d[k], 0) / 7);
  const kcal = Math.round(avg("kcal") / 10) * 10;
  return { kcal, protein: avg("protein"), carbs: avg("carbs"), fat: avg("fat") };
}

/** Plain-language explanation of where the numbers come from. */
export function calorieBreakdown(p: Profile) {
  const bmr = Math.round(bmrOf(p));
  const detailed = detailedActivity(p);
  const factor = detailed ? STEP_FACTOR[p.steps ?? "5to8k"] : ACTIVITY_FACTOR[p.activity];
  const everyday = Math.round(bmr * factor) - bmr;
  const workouts = p.schedule
    .filter(isExercise)
    .map((b) => ({ label: b.activity || b.label, perSession: workoutKcal(p, b), perWeek: workoutKcal(p, b) * b.days.length, days: b.days.length }));
  const weeklyWorkout = workouts.reduce((a, w) => a + w.perWeek, 0);
  const t = nutritionTargets(p);
  return {
    bmr,
    detailed,
    factor,
    everyday,
    everydayLabel: detailed ? `walking around (${STEP_LABEL[p.steps ?? "5to8k"]} a day)` : `your activity level (${p.activity})`,
    workouts,
    workoutAvg: detailed ? Math.round(weeklyWorkout / 7) : 0,
    goalAdj: p.customMacros?.kcal ? 0 : GOAL_ADJ[p.goal],
    custom: Boolean(p.customMacros?.kcal),
    proteinPerKg: PROTEIN_PER_KG[p.goal],
    targets: t,
    range: (() => {
      const ks = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => dayTargets(p, d).kcal);
      return { min: Math.min(...ks), max: Math.max(...ks) };
    })(),
  };
}

// ---------- free windows ----------
export function freeWindows(p: Profile, day: DayIndex): FreeWindow[] {
  const weekend = day >= 5;
  const wake = toMin(weekend ? p.wakeWeekend : p.wakeWeekday);
  let sleep = toMin(weekend ? p.sleepWeekend : p.sleepWeekday);
  if (sleep <= wake) sleep += 1440;

  // Getting there and back counts as busy time: no meals planned while walking to class.
  const busy = p.schedule
    .filter((b) => b.days.includes(day))
    .map((b) => {
      const travel = b.travelMin ?? p.travelMin ?? 10;
      return [toMin(b.start) - travel, toMin(b.end) + travel] as [number, number];
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const out: FreeWindow[] = [];
  let cursor = wake;
  for (const [s, e] of busy) {
    if (s > cursor) out.push({ start: toHHMM(cursor), end: toHHMM(s), minutes: s - cursor });
    cursor = Math.max(cursor, e);
  }
  if (sleep > cursor) out.push({ start: toHHMM(cursor), end: toHHMM(sleep), minutes: sleep - cursor });
  // keep only windows long enough to at least grab a snack
  return out.filter((w) => w.minutes >= 10);
}

interface Slot {
  type: MealType;
  time: number; // minutes
  windowMin: number; // remaining minutes in that window from `time`
  share: number; // share of daily kcal
}

const IDEAL: Record<Exclude<MealType, "snack">, [number, number, number]> = {
  // [earliest, ideal, latest] in minutes
  breakfast: [5 * 60, 8 * 60, 11 * 60],
  lunch: [11 * 60, 12.5 * 60, 15 * 60],
  dinner: [17 * 60, 18.5 * 60, 21.5 * 60],
};

/** Picks meal times inside free windows. Busy days get compressed into portable meals + snacks. */
export function mealSlots(p: Profile, day: DayIndex): Slot[] {
  const windows = freeWindows(p, day).map((w) => ({ s: toMin(w.start), e: toMin(w.start) + w.minutes }));
  const slots: Slot[] = [];
  const used: [number, number][] = [];

  const place = (type: Exclude<MealType, "snack">) => {
    const [lo, ideal, hi] = IDEAL[type];
    let best: { t: number; win: number; score: number } | null = null;
    for (const w of windows) {
      const s = Math.max(w.s, lo);
      const e = Math.min(w.e, hi + 30);
      if (e - s < 10) continue;
      // start as close to the ideal time as possible while leaving up to 30 min to eat
      const need = Math.min(30, w.e - s);
      const t = Math.min(Math.max(ideal, s), w.e - need);
      if (t > e) continue;
      const win = w.e - t;
      if (used.some(([a, b]) => t < b && t + 15 > a)) continue;
      // prefer near ideal time and longer windows
      const score = Math.abs(t - ideal) - Math.min(win, 45) * 1.5;
      if (!best || score < best.score) best = { t, win, score };
    }
    if (best) {
      slots.push({ type, time: best.t, windowMin: Math.round(best.win), share: 0 });
      used.push([best.t, best.t + Math.min(best.win, 40)]);
    }
  };
  place("breakfast");
  place("lunch");
  place("dinner");

  // snacks: fill long gaps between meals (> 4h) with a snack in a free window
  const sorted = () => [...slots].sort((a, b) => a.time - b.time);
  const firstWake = windows[0]?.s ?? 8 * 60;
  const lastSleep = windows[windows.length - 1]?.e ?? 23 * 60;
  const anchors = [firstWake, ...sorted().map((s) => s.time), lastSleep];
  for (let k = 0; k < anchors.length - 1; k++) {
    const gap = anchors[k + 1] - anchors[k];
    if (gap < 240) continue;
    const mid = anchors[k] + gap / 2;
    const w = windows
      .filter((w) => w.e > anchors[k] + 60 && w.s < anchors[k + 1] - 60)
      .sort((a, b) => Math.abs((a.s + a.e) / 2 - mid) - Math.abs((b.s + b.e) / 2 - mid))[0];
    if (!w) continue;
    const t = Math.min(Math.max(mid, w.s), w.e - 10);
    slots.push({ type: "snack", time: t, windowMin: Math.round(w.e - t), share: 0 });
  }
  if (slots.filter((s) => s.type !== "snack").length < 3 && slots.filter((s) => s.type === "snack").length === 0) {
    // missed a meal and no snack placed — add one in the longest window
    const w = [...windows].sort((a, b) => b.e - b.s - (a.e - a.s))[0];
    if (w) slots.push({ type: "snack", time: w.s + 5, windowMin: Math.round(w.e - w.s - 5), share: 0 });
  }

  const weights: Record<MealType, number> = { breakfast: 25, lunch: 32, dinner: 33, snack: 12 };
  const total = slots.reduce((a, s) => a + weights[s.type], 0) || 1;
  for (const s of slots) s.share = weights[s.type] / total;
  return sorted();
}

// ---------- recipe filtering ----------
export function recipeAllowed(r: Recipe, p: Profile): boolean {
  if (p.diet === "vegan" && !r.diet.vegan) return false;
  if (p.diet === "vegetarian" && !r.diet.vegetarian) return false;
  if (p.diet === "pescatarian" && !r.diet.pescatarian) return false;
  if ((p.diet === "halal" || p.diet === "kosher") && r.contains.includes("pork")) return false;
  if (p.allergies.some((a) => r.allergens.includes(a))) return false;
  if (r.skill > p.skill) return false;
  const has = new Set(p.appliances);
  if (r.needsFridge && !has.has("mini fridge") && !has.has("full fridge")) return false;
  if (r.appliances.some((a) => !has.has(a))) return false;
  const dislikes = p.dislikes
    .toLowerCase()
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const text = (r.name + " " + r.ingredients.map((x) => x.name).join(" ")).toLowerCase();
  if (dislikes.some((d) => text.includes(d))) return false;
  if (p.blockedMeals?.some((m) => m.name === r.name)) return false;
  return true;
}

const norm = (s: string) => s.toLowerCase().replace(/s\b/g, "").trim();
export function pantryMatches(r: Recipe, p: Profile): string[] {
  const pantry = p.pantry.map((x) => norm(x.name));
  return r.ingredients
    .filter((ing) => pantry.some((x) => x && (norm(ing.name).includes(x) || x.includes(norm(ing.name)))))
    .map((ing) => ing.name);
}

function toMeal(r: Recipe, slot: Slot, p: Profile, scale: number, why: string, source: PlannedMeal["source"] = "cook"): PlannedMeal {
  const usesPantry = pantryMatches(r, p);
  const s = Math.round(scale * 4) / 4;
  return {
    type: slot.type,
    time: toHHMM(slot.time),
    windowMin: slot.windowMin,
    name: s !== 1 ? `${r.name} (×${s})` : r.name,
    prepMin: r.prepMin,
    portable: r.portable,
    source,
    macros: {
      kcal: Math.round(r.macros.kcal * s),
      protein: Math.round(r.macros.protein * s),
      carbs: Math.round(r.macros.carbs * s),
      fat: Math.round(r.macros.fat * s),
    },
    cost: +r.ingredients
      .filter((x) => !usesPantry.includes(x.name))
      .reduce((a, x) => a + x.cost * s, 0)
      .toFixed(2),
    ingredients: r.ingredients.map((x) => ({ ...x, cost: +(x.cost * s).toFixed(2) })),
    servings: s,
    steps: r.steps,
    usesPantry,
    why,
  };
}

function diningMeal(slot: Slot, t: Macros): PlannedMeal {
  return {
    type: slot.type,
    time: toHHMM(slot.time),
    windowMin: slot.windowMin,
    name: "Dining Hall Plate",
    prepMin: 0,
    portable: false,
    source: "dining",
    // This is the target for the meal. When we know the dining hall's menu, the plan route swaps in real dishes.
    macros: {
      kcal: Math.round(t.kcal * slot.share),
      protein: Math.round(t.protein * slot.share),
      carbs: Math.round(t.carbs * slot.share),
      fat: Math.round(t.fat * slot.share),
    },
    cost: 0,
    ingredients: [],
    steps: [
      "Half plate: vegetables or salad bar.",
      "Quarter plate: lean protein (grilled chicken, tofu, eggs, beans, fish).",
      "Quarter plate: whole grains or potatoes. Add fruit + water.",
    ],
    usesPantry: [],
    why: "Eat at the dining hall — zero grocery cost.",
  };
}

/**
 * Chooses which meals happen at the dining hall: lunches and dinners first, then breakfasts,
 * spread across the week, only in breaks long enough to walk over and eat (25+ min).
 */
export function pickDiningSlots(allSlots: Slot[][], count: number): Set<Slot> {
  const chosen = new Set<Slot>();
  if (count <= 0) return chosen;
  const tiers: MealType[][] = [["lunch", "dinner"], ["breakfast"]];
  for (const tier of tiers) {
    const perDay = allSlots.map((slots) => slots.filter((s) => tier.includes(s.type) && s.windowMin >= 25).sort((a, b) => b.windowMin - a.windowMin));
    for (let round = 0; round < 3; round++)
      for (const list of perDay) {
        if (chosen.size >= count) return chosen;
        if (list[round]) chosen.add(list[round]);
      }
  }
  return chosen;
}

// ---------- rule-based planner ----------
export function buildRulePlan(p: Profile): MealPlan {
  const targets = nutritionTargets(p);
  const allowed = RECIPES.filter((r) => recipeAllowed(r, p));
  const usage = new Map<string, number>();
  const basket = new Set<string>(); // packages already on this week's list
  const productKey = (name: string) => findProduct(name)?.pkg + "|" + (findProduct(name)?.match[0] ?? name.toLowerCase());
  const dailyBudget = p.weeklyBudget / 7;
  const days: DayPlan[] = [];
  const allSlots = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => mealSlots(p, d));
  const diningSlots = pickDiningSlots(allSlots, diningAllowance(p.diningSwipes, withDiningDefaults(p.dining)).total);

  for (let d = 0 as DayIndex; d < 7; d = (d + 1) as DayIndex) {
    const slots = allSlots[d];
    const meals: PlannedMeal[] = [];
    let spentToday = 0;
    const dt = dayTargets(p, d); // workout days get more
    for (const slot of slots) {
      const target = dt.kcal * slot.share;
      if (diningSlots.has(slot)) {
        meals.push(diningMeal(slot, dt));
        continue;
      }
      const timeAvail = slot.windowMin - 10; // leave ~10 min to eat
      const cands = allowed.filter((r) => r.types.includes(slot.type));
      let best: { r: Recipe; score: number; why: string } | null = null;
      for (const r of cands) {
        const fitsTime = r.prepMin <= Math.min(timeAvail, p.maxCookMin) || (r.portable && r.prepMin <= 6);
        const preppable = r.portable && r.prepMin > timeAvail; // can be made in the weekly prep session
        if (!fitsTime && !preppable) continue;
        const pm = pantryMatches(r, p).length;
        const cost = r.ingredients.reduce((a, x) => a + x.cost, 0);
        const scale = Math.min(1.75, Math.max(0.75, target / r.macros.kcal));
        const proteinRatio = (r.macros.protein * 4) / r.macros.kcal;
        let score = 0;
        score += pm * 6;
        // Reusing a package already on the list is nearly free; a new package costs its full price.
        for (const ing of r.ingredients) {
          if (pantryMatches(r, p).includes(ing.name)) continue;
          if (basket.has(productKey(ing.name))) score += 2.5;
          else score -= Math.min(6, (findProduct(ing.name)?.price ?? 2.5) * 0.45);
        }
        score -= (usage.get(r.id) || 0) * 9;
        score -= Math.max(0, cost * scale - dailyBudget * slot.share * 1.2) * 4;
        score -= Math.abs(1 - scale) * 6;
        score += proteinRatio * (p.goal === "gain" || p.goal === "performance" || p.goal === "lose" ? 30 : 12);
        if (slot.windowMin < 30 && r.portable) score += 6;
        if (preppable) score -= 3;
        score += preferenceScore(r, p);
        score += Math.random() * 2; // variety
        const why =
          slot.windowMin < 30
            ? timeFitNote(slot.windowMin)
            : pm
              ? `Uses what you have: ${pantryMatches(r, p).join(", ")}.`
              : preppable
                ? "Make it during your prep session; reheat or eat cold."
                : timeFitNote(slot.windowMin, slot.type);
        if (!best || score > best.score) best = { r, score, why };
      }
      if (!best) continue;
      const scale = Math.min(1.75, Math.max(0.75, target / best.r.macros.kcal));
      usage.set(best.r.id, (usage.get(best.r.id) || 0) + 1);
      for (const ing of best.r.ingredients) basket.add(productKey(ing.name));
      const preppable = best.r.prepMin > slot.windowMin - 10;
      const meal = toMeal(best.r, slot, p, scale, best.why, preppable ? "prepped" : "cook");
      spentToday += meal.cost;
      meals.push(meal);
    }
    void spentToday;
    days.push({
      day: d,
      meals,
      totals: sumMacros(meals),
      target: { kcal: dt.kcal, protein: dt.protein, carbs: dt.carbs, fat: dt.fat },
      burn: dt.burn ? { kcal: dt.burn, what: dt.what } : undefined,
    });
  }

  trimToBudget(p, days, allowed);
  for (const d of days) d.totals = sumMacros(d.meals);
  const groceries = priceGroceries(days, p.pantry);
  const plan: MealPlan = {
    generatedAt: new Date().toISOString(),
    engine: "rules",
    targets,
    days,
    groceries,
    groceryTotal: +groceries.reduce((a, g) => a + g.cost, 0).toFixed(2),
    prepSession: prepSession(p, days),
    tips: baseTips(p, targets),
  };
  return plan;
}

/** What the student told us through meal feedback and favorite foods. */
export function preferenceScore(r: Recipe, p: Profile) {
  let score = 0;
  if (p.preferQuick) score += r.prepMin <= 10 ? 4 : r.prepMin >= 20 ? -4 : 0;
  if (p.preferFilling) score += (r.macros.protein >= 25 ? 3 : 0) + (r.macros.kcal >= 500 ? 2 : 0);
  const likes = (p.likes || "")
    .toLowerCase()
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const text = (r.name + " " + r.ingredients.map((x) => x.name).join(" ")).toLowerCase();
  if (likes.some((l) => text.includes(l))) score += 4;
  return score;
}

/**
 * "Choose a new meal": replace one meal with a different recipe that fits the same time slot,
 * the student's rules, and roughly the same calories and protein. Prefers recipes that reuse this
 * week's groceries. Returns null when nothing else fits.
 */
export function swapMeal(p: Profile, plan: MealPlan, dayIdx: number, mealIdx: number, exclude: string[] = []): MealPlan | null {
  const day = plan.days[dayIdx];
  const m = day?.meals[mealIdx];
  if (!m) return null;
  const baseName = (x: PlannedMeal) => x.name.replace(/ \(×.*\)$/, "");
  const onList = new Set(plan.groceries.map((g) => findProduct(g.name)?.pkg ?? g.name.toLowerCase()));
  const sameDay = new Set(day.meals.map(baseName));
  const cands = RECIPES.filter((r) => recipeAllowed(r, p) && canFill(r, m, p) && !sameDay.has(r.name) && !exclude.includes(r.name));
  if (!cands.length) return null;
  const target = m.macros.kcal || 450;
  const scored = cands.map((r) => {
    const scale = Math.min(1.75, Math.max(0.75, target / r.macros.kcal));
    let score = preferenceScore(r, p) + Math.random() * 3;
    score -= Math.abs(r.macros.protein * scale - m.macros.protein) / 4;
    for (const ing of r.ingredients) score += onList.has(findProduct(ing.name)?.pkg ?? ing.name.toLowerCase()) ? 1.5 : -0.8;
    if (m.windowMin < 30 && r.portable) score += 4;
    return { r, scale, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const { r, scale } = scored[0];
  const slot = { type: m.type, time: toMin(m.time), windowMin: m.windowMin, share: 0 };
  const meal = toMeal(r, slot, p, scale, m.windowMin < 30 ? timeFitNote(m.windowMin) : timeFitNote(m.windowMin, m.type), r.prepMin > m.windowMin - 10 ? "prepped" : "cook");
  const days = plan.days.map((d, i) => (i === dayIdx ? { ...d, meals: d.meals.map((x, j) => (j === mealIdx ? meal : x)) } : d));
  days[dayIdx].totals = sumMacros(days[dayIdx].meals);
  const groceries = priceGroceries(days, p.pantry);
  return { ...plan, days, groceries, groceryTotal: +groceries.reduce((a, g) => a + g.cost, 0).toFixed(2) };
}

// ---------- budget trimming ----------
const weekCost = (days: DayPlan[], p: Profile) => priceGroceries(days, p.pantry).reduce((a, g) => a + g.cost, 0);

function canFill(r: Recipe, m: PlannedMeal, p: Profile) {
  if (!r.types.includes(m.type)) return false;
  const timeAvail = (m.windowMin || 60) - 10;
  const fitsTime = r.prepMin <= Math.min(timeAvail, p.maxCookMin) || (r.portable && r.prepMin <= 6);
  const preppable = r.portable && r.prepMin > timeAvail;
  return fitsTime || preppable;
}

/**
 * Packages, not portions, drive the grocery bill. When the week is over budget:
 *  1. Drop whole packages: for each costly item, try re-planning every meal that uses it.
 *  2. Single swaps toward recipes that reuse packages already on the list.
 * Protein per meal stays within 80% of the original, lunches/dinners repeat at most 4×/week and
 * breakfasts/snacks at most 7× (people happily eat the same breakfast every day).
 */
function trimToBudget(p: Profile, days: DayPlan[], allowed: Recipe[]) {
  const budget = p.weeklyBudget;
  let total = weekCost(days, p);
  const baseName = (m: PlannedMeal) => m.name.replace(/ \(×.*\)$/, "");
  const countOf = (name: string) => days.reduce((n, d) => n + d.meals.filter((m) => baseName(m) === name).length, 0);
  const cap = (m: PlannedMeal) => (m.type === "breakfast" || m.type === "snack" ? 7 : 4);
  const keyOf = (ing: string) => findProduct(ing)?.pkg + "|" + (findProduct(ing)?.match[0] ?? ing.toLowerCase());
  const meals = () => days.flatMap((d) => d.meals.map((m, i) => ({ d, i, m })));

  const candidatesFor = (d: DayPlan, m: PlannedMeal, avoidKey?: string) =>
    allowed
      .filter((r) => r.name !== baseName(m) && canFill(r, m, p) && countOf(r.name) < cap(m))
      .filter((r) => !d.meals.some((x) => x !== m && baseName(x) === r.name)) // no repeats within a day
      .filter((r) => !avoidKey || !r.ingredients.some((x) => keyOf(x.name) === avoidKey))
      .map((r) => {
        const scale = Math.min(1.75, Math.max(0.75, m.macros.kcal / r.macros.kcal));
        return { r, scale };
      })
      .filter(({ r, scale }) => r.macros.protein * scale >= m.macros.protein * 0.8);

  const build = (m: PlannedMeal, r: Recipe, scale: number) => {
    const slot = { type: m.type, time: toMin(m.time), windowMin: m.windowMin, share: 0 };
    const meal = toMeal(r, slot, p, scale, "", m.source === "prepped" && r.portable ? "prepped" : "cook");
    meal.why = m.windowMin < 30 ? timeFitNote(m.windowMin) : "Shares groceries with your other meals this week.";
    return meal;
  };

  /** Replace meal i of day d with the candidate that gives the lowest week total. */
  const bestSwap = (d: DayPlan, i: number, avoidKey?: string) => {
    const m = d.meals[i];
    let best: { meal: PlannedMeal; total: number } | null = null;
    for (const { r, scale } of candidatesFor(d, m, avoidKey)) {
      const cand = build(m, r, scale);
      d.meals[i] = cand;
      const t = weekCost(days, p);
      d.meals[i] = m;
      if (!best || t < best.total) best = { meal: cand, total: t };
    }
    return best;
  };

  for (let pass = 0; pass < 6 && total > budget; pass++) {
    let improved = false;

    // 1) drop whole packages, most expensive first
    const items = priceGroceries(days, p.pantry).sort((a, b) => b.cost - a.cost);
    for (const item of items) {
      if (total <= budget) return;
      const key = keyOf(item.name);
      const users = meals().filter(({ m }) => m.source !== "dining" && m.ingredients.some((x) => keyOf(x.name) === key));
      if (!users.length) continue;
      const before = users.map(({ d, i }) => d.meals[i]);
      let ok = true;
      for (const { d, i } of users) {
        const s = bestSwap(d, i, key);
        if (!s) {
          ok = false;
          break;
        }
        d.meals[i] = s.meal;
      }
      const t = weekCost(days, p);
      if (ok && t < total - 0.5) {
        total = t;
        improved = true;
      } else users.forEach(({ d, i }, k) => (d.meals[i] = before[k]));
    }

    // 2) single swaps
    for (const { d, i, m } of meals()) {
      if (total <= budget) return;
      if (m.source === "dining") continue;
      const s = bestSwap(d, i);
      if (s && s.total < total - 0.5) {
        d.meals[i] = s.meal;
        total = s.total;
        improved = true;
      }
    }
    if (!improved) break;
  }
}

export function sumMacros(meals: PlannedMeal[]): Macros {
  return meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.macros.kcal, protein: a.protein + m.macros.protein, carbs: a.carbs + m.macros.carbs, fat: a.fat + m.macros.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function prepSession(p: Profile, days: DayPlan[]): MealPlan["prepSession"] {
  // choose the longest free window on Sat/Sun
  let best: { day: DayIndex; w: FreeWindow } | null = null;
  for (const d of [6, 5] as DayIndex[])
    for (const w of freeWindows(p, d)) if (!best || w.minutes > best.w.minutes) best = { day: d, w };
  if (!best) return undefined;
  const prepped = new Set<string>();
  for (const d of days) for (const m of d.meals) if (m.source === "prepped" || (m.portable && m.prepMin >= 10)) prepped.add(m.name.replace(/ \(×.*\)$/, ""));
  const tasks = [...prepped].slice(0, 5).map((n) => `Batch-make ${n}`);
  tasks.push("Portion snacks into grab bags", "Wash & chop produce for the week");
  const start = toMin(best.w.start) + (best.w.minutes > 240 ? 60 : 0);
  return { day: best.day, time: toHHMM(start), durationMin: Math.min(90, best.w.minutes), tasks };
}

function baseTips(p: Profile, t: Macros): string[] {
  const tips = [
    `Aim for ~${t.protein}g protein a day — spread across meals for steady energy in class.`,
    "Keep a water bottle on you; mild dehydration hurts focus more than skipped snacks.",
  ];
  if (p.housing === "dorm") tips.push("Dorm hack: a microwave + kettle can cook rice cups, oats, ramen upgrades and frozen veg.");
  const a = diningAllowance(p.diningSwipes, withDiningDefaults(p.dining));
  if (a.total > 0)
    tips.push(
      `We planned ${a.total} dining hall meal${a.total > 1 ? "s" : ""} this week${a.pointMeals ? ` (${a.swipeMeals} on swipes, ${a.pointMeals} on ${withDiningDefaults(p.dining).pointsLabel})` : ""}, on your longest lunch and dinner breaks.`,
    );
  if (p.goal === "focus") tips.push("Pair carbs with protein/fat before exams to avoid an energy crash.");
  if (p.schedule.some((b) => b.kind === "workout" || b.kind === "practice"))
    tips.push("On workout days we add the calories you burn, mostly as carbs, and put a snack before or after training.");
  return tips;
}
