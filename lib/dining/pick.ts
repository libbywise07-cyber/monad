// Picks the healthiest plate a dining hall serves for one meal, tuned to the student's goal.
import type { Allergen, Macros, MealType, Profile } from "../types";
import type { DiningItem, DiningPick, DiningSetup } from "./types";

export type Kind = "main" | "side" | "skip";

const SKIP_STATION = /dressing|sauce|condiment|beverage|drink|coffee|dessert|bakery|sweet|cookie|topping|extras|spice|bread|cereal bar|creamer/i;
const SKIP_NAME =
  /\b(sauce|dressing|vinaigrette|syrup|gravy|ketchup|mustard|mayo|aioli|salsa|creamer|cookie|cake|cupcake|brownie|donut|doughnut|pie|ice cream|soda|juice|lemonade|tea|coffee|frosting|whipped|sprinkles|jam|jelly|butter|margarine|croutons?|bun|roll|tortilla|crackers?|chips)\b/i;
const MAIN_STATION = /entr|grill|main|homestyle|home ?style|pizza|sandwich|deli|burger|wok|stir|pasta|taco|kitchen|bowl|chef|carv|exhibition|global|international|comfort|protein|rotisserie|smokehouse|breakfast|egg|omelet/i;
const VEG = /veg|salad|greens|broccoli|spinach|kale|carrot|green bean|brussels|zucchini|squash|asparagus|cauliflower|peppers|fruit|berr|apple|banana|melon|orange|grape/i;
const PROCESSED = /sausage|bacon|chorizo|smokies|hot dog|pepperoni|salami|bologna|bratwurst|corn dog|spam\b/i;
const FRIED = /fried|crispy|nuggets?|tenders|fries|tots|battered|breaded|fritter|onion rings|mozzarella sticks/i;
const WHOLE = /brown rice|quinoa|whole wheat|whole grain|oat|farro|barley|bean|lentil|chickpea|sweet potato/i;

export function kindOf(i: DiningItem): Kind {
  if (i.kcal < 20 || SKIP_STATION.test(i.station) || SKIP_NAME.test(i.name)) return "skip";
  if (i.category === "entree" && i.protein >= 8) return "main";
  if (i.protein >= 15) return "main";
  if (MAIN_STATION.test(i.station) && i.protein >= 8) return "main";
  if (i.kcal > 450) return "skip"; // heavy items that aren't a protein (fries baskets, desserts…)
  return "side";
}

const MEAT = /\b(chicken|beef|pork|bacon|ham|sausage|turkey|steak|brisket|lamb|pepperoni|meatball|chorizo|bratwurst|hot dog|burger patty|carnitas|birria|veal|duck)\b/i;
const SEAFOOD = /\b(fish|salmon|tuna|cod|tilapia|shrimp|crab|lobster|pollock|catfish|halibut|mahi|scallop|clam|mussel|seafood)\b/i;
const SHELLFISH = /\b(shrimp|crab|lobster|scallop|clam|mussel|oyster|crawfish)\b/i;
const ALCOHOL = /\b(wine|beer|bourbon|rum|vodka|sake|mirin)\b/i;
// Backup check on the dish name, in case a menu's allergen flags are missing.
const NAME_ALLERGEN: Partial<Record<Allergen, RegExp>> = {
  peanut: /peanut/i,
  "tree nut": /almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia/i,
  dairy: /\b(milk|cheese|cheesy|cream|creamy|yogurt|butter|alfredo|queso|parmesan|mozzarella)\b/i,
  egg: /\beggs?\b|omelet|quiche|frittata/i,
  soy: /\bsoy|tofu|edamame|tempeh|miso/i,
  shellfish: SHELLFISH,
  fish: /\b(fish|salmon|tuna|cod|tilapia|pollock|catfish|halibut|mahi|anchov)/i,
  sesame: /sesame|tahini/i,
};

/** Hard rules: diet, allergies and dislikes. Anything that breaks one is never picked. */
export function itemAllowed(i: DiningItem, p: Profile): boolean {
  if (p.allergies.some((a) => i.allergens.includes(a))) return false;
  if (p.allergies.some((a) => NAME_ALLERGEN[a]?.test(i.name))) return false;
  const dislikes = p.dislikes
    .split(/[,;\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 2);
  if (dislikes.some((d) => i.name.toLowerCase().includes(d))) return false;
  switch (p.diet) {
    case "vegan":
      return i.vegan;
    case "vegetarian":
      return i.vegetarian && !MEAT.test(i.name) && !SEAFOOD.test(i.name);
    case "pescatarian":
      return i.vegetarian || (SEAFOOD.test(i.name) && !MEAT.test(i.name));
    case "halal":
      return !i.pork && !ALCOHOL.test(i.name);
    case "kosher":
      return !i.pork && !SHELLFISH.test(i.name) && !i.allergens.includes("shellfish") && !(MEAT.test(i.name) && /cheese|cream|alfredo|parmesan/i.test(i.name));
    default:
      return true;
  }
}

export function itemPoints(i: DiningItem, kind: Kind, d: DiningSetup): number {
  const o = d.priceOverrides[i.name.toLowerCase()];
  if (o != null) return o;
  if (i.price) return i.price;
  return kind === "main" ? d.itemPrice.main : d.itemPrice.side;
}

interface Totals extends Macros {
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
  points: number;
  veg: number;
  whole: number;
  processed: number;
  fried: number;
}

export interface PickContext {
  profile: Profile;
  setup: DiningSetup;
  target: Macros;
  pay: "swipe" | "points";
  pointsCap?: number; // max points for this meal when paying à la carte
  used: Map<string, number>; // item name → times already picked this week
}

function score(t: Totals, names: string[], c: PickContext): number {
  const { target: T, profile: p } = c;
  const goals = p.healthGoals.join(" ").toLowerCase();
  let s = 0;
  const kErr = (t.kcal - T.kcal) / Math.max(150, T.kcal);
  s -= kErr > 0 ? kErr * (p.goal === "lose" ? 80 : 40) : -kErr * (p.goal === "gain" || p.goal === "performance" ? 70 : 35);
  s -= (Math.max(0, T.protein - t.protein) / Math.max(10, T.protein)) * (p.goal === "gain" || p.goal === "lose" || p.goal === "performance" ? 70 : 45);
  s += Math.min(t.protein / Math.max(10, T.protein), 1.3) * 8;
  if (p.goal === "performance" || /sport|practice/.test(goals)) s -= (Math.max(0, T.carbs - t.carbs) / Math.max(20, T.carbs)) * 25;
  s -= (Math.max(0, t.fat - T.fat * 1.25) / Math.max(8, T.fat)) * 20;
  s -= (Math.max(0, t.sodium - 900) / 100) * 1.5;
  s -= Math.max(0, t.satFat - 8) * 1.5;
  s -= Math.max(0, t.sugar - 15) * (/sugar|focus|energy/.test(goals) || p.goal === "focus" ? 1.2 : 0.4);
  s += Math.min(t.fiber, 12) * (/fiber|veg|gut/.test(goals) ? 1.6 : 0.7);
  s += Math.min(t.veg, 2) * (/fiber|veg|gut/.test(goals) ? 7 : 4);
  s += Math.min(t.whole, 1) * 3;
  s -= t.processed * 12 + t.fried * 9;
  for (const n of names) s -= (c.used.get(n) || 0) * 9;
  if (c.pay === "points" && c.pointsCap != null) s -= Math.max(0, t.points - c.pointsCap) * 4;
  return s;
}

function totalsOf(parts: { i: DiningItem; k: Kind; n: number }[], c: PickContext): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0, points: 0, veg: 0, whole: 0, processed: 0, fried: 0 };
  for (const { i, k, n } of parts) {
    t.kcal += i.kcal * n;
    t.protein += i.protein * n;
    t.carbs += i.carbs * n;
    t.fat += i.fat * n;
    t.fiber += (i.fiber || 0) * n;
    t.sugar += (i.sugar || 0) * n;
    t.sodium += (i.sodium || 0) * n;
    t.satFat += (i.satFat || 0) * n;
    t.points += itemPoints(i, k, c.setup) * n;
    if (VEG.test(i.name) || VEG.test(i.station)) t.veg += 1;
    if (WHOLE.test(i.name)) t.whole += 1;
    if (PROCESSED.test(i.name)) t.processed += 1;
    if (FRIED.test(i.name)) t.fried += 1;
  }
  return t;
}

/** Best plate (one main + up to two sides, main can be doubled) for this meal. */
export function pickPlate(items: DiningItem[], c: PickContext): { picks: DiningPick[]; totals: Totals } | null {
  const seen = new Set<string>();
  const ok = items.filter((i) => {
    const key = i.name.toLowerCase();
    if (seen.has(key) || !itemAllowed(i, c.profile)) return false;
    seen.add(key);
    return true;
  });
  const typed = ok.map((i) => ({ i, k: kindOf(i) })).filter((x) => x.k !== "skip");
  const solo = (x: { i: DiningItem; k: Kind }) => score(totalsOf([{ ...x, n: 1 }], c), [x.i.name], c);
  const top = (k: Kind, n: number) =>
    typed
      .filter((x) => x.k === k)
      .map((x) => ({ ...x, s: solo(x) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, n);
  const mains = top("main", 30);
  const sides = top("side", 18);
  if (!mains.length && !sides.length) return null;

  let best: { parts: { i: DiningItem; k: Kind; n: number }[]; t: Totals; s: number } | null = null;
  const consider = (parts: { i: DiningItem; k: Kind; n: number }[]) => {
    const t = totalsOf(parts, c);
    const s = score(t, parts.map((x) => x.i.name), c);
    if (!best || s > best.s) best = { parts, t, s };
  };
  const bases = mains.length ? mains.flatMap((m) => [[{ ...m, n: 1 }], [{ ...m, n: 2 }]]) : [[]];
  for (const base of bases) {
    consider(base);
    for (let a = 0; a < sides.length; a++) {
      consider([...base, { ...sides[a], n: 1 }]);
      for (let b = a + 1; b < sides.length; b++) consider([...base, { ...sides[a], n: 1 }, { ...sides[b], n: 1 }]);
    }
  }
  const b = best as { parts: { i: DiningItem; k: Kind; n: number }[]; t: Totals } | null;
  if (!b || !b.parts.length) return null;
  for (const x of b.parts) c.used.set(x.i.name, (c.used.get(x.i.name) || 0) + 1);
  return {
    totals: b.t,
    picks: b.parts.map(({ i, k, n }) => ({
      name: i.name,
      station: i.station,
      servings: n,
      kcal: Math.round(i.kcal * n),
      protein: Math.round(i.protein * n),
      carbs: Math.round(i.carbs * n),
      fat: Math.round(i.fat * n),
      points: +(itemPoints(i, k, c.setup) * n).toFixed(2),
    })),
  };
}

/** Items for one meal on one day. Falls back to the whole week (or everything) when that day has no menu. */
export function itemsFor(items: DiningItem[], type: MealType, date?: string): DiningItem[] {
  const meal = type === "snack" ? "lunch" : type;
  const forMeal = items.filter((i) => i.meal === meal || i.meal === "all");
  if (date) {
    const today = forMeal.filter((i) => i.date === date);
    if (today.length) return today;
  }
  return forMeal.length ? forMeal : items;
}

/** Single items ranked for the menu browser. */
export function rankItems(items: DiningItem[], c: Omit<PickContext, "used" | "pay" | "pointsCap">): { item: DiningItem; kind: Kind; score: number }[] {
  const ctx: PickContext = { ...c, pay: "swipe", used: new Map() };
  const seen = new Set<string>();
  return items
    .filter((i) => {
      const k = i.name.toLowerCase();
      return itemAllowed(i, c.profile) && (seen.has(k) ? false : (seen.add(k), true));
    })
    .map((i) => ({ item: i, kind: kindOf(i) }))
    .filter((x) => x.kind !== "skip")
    .map((x) => {
      const t = totalsOf([{ i: x.item, k: x.kind, n: 1 }], ctx);
      // judge each item per 100 kcal so small sides aren't punished for being small
      const scale = 100 / Math.max(50, t.kcal);
      const density = t.protein * scale * 3 + t.fiber * scale * 4 - (t.sodium * scale) / 60 - t.satFat * scale * 2 - t.sugar * scale * 0.8;
      return { ...x, score: density + (t.veg ? 2 : 0) + (t.whole ? 1 : 0) - t.processed * 4 - t.fried * 2 };
    })
    .sort((a, b) => b.score - a.score);
}
