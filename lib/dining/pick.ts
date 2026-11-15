// Picks the dining hall plate that best fits the student: their diet and allergies (hard rules),
// their health goals, and the foods they love.
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

const HANDHELD = /pizza|calzone|burger|sandwich|wrap|burrito|quesadilla|sub\b|hoagie|panini|flatbread|hot dog/i;

export function kindOf(i: DiningItem): Kind {
  if (i.kcal < 20 || SKIP_STATION.test(i.station) || SKIP_NAME.test(i.name)) return "skip";
  if (HANDHELD.test(i.name) || /pizza/i.test(i.station)) return i.protein >= 8 ? "main" : "skip";
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

// ---------- what a dish offers, beyond macros ----------
const FERMENTED = /yogurt|kefir|kimchi|sauerkraut|miso|tempeh|kombucha|pickled/i;
const OMEGA3 = /salmon|tuna|sardine|mackerel|trout|walnut|chia|flax/i;
const IRON_FOOD = /beef|steak|brisket|lamb|spinach|lentil|bean|chickpea|tofu|kale|turkey|quinoa/i;
const SPICY = /spicy|buffalo|jalape|chipotle|szechuan|sriracha|cajun|habanero|nashville|diablo|hot wings|chili/i;
const CAFFEINE = /coffee|espresso|mocha|latte|cola|energy drink|matcha/i;

// Cuisines a student can name in "foods you love", and dishes that belong to them.
const CUISINES: Record<string, RegExp> = {
  mexican: /taco|burrito|fajita|enchilada|quesadilla|tamale|carnitas|birria|al pastor|chipotle|mexican|nacho|elote|pozole|ranchero|tex.?mex/i,
  italian: /pasta|penne|spaghetti|lasagna|marinara|pesto|risotto|parm|italian|ravioli|gnocchi|pizza|cacciatore|piccata|picatta|focaccia/i,
  asian: /teriyaki|stir.?fry|lo mein|fried rice|bulgogi|bibimbap|ramen|udon|pho|pad thai|sushi|dumpling|bao|szechuan|orange chicken|asian|korean|thai|japanese|chinese|vietnamese|banh|bahn|kimchi|katsu|yakisoba|tempeh|tofu|sesame|general tso|kung pao/i,
  indian: /masala|tikka|tandoori|dal\b|dahl|paneer|biryani|naan|chana|korma|vindaloo|samosa|indian/i,
  mediterranean: /falafel|hummus|shawarma|gyro|tzatziki|pita|tabbouleh|greek|mediterranean|kebab|couscous|moroccan|lemon herb/i,
  american: /burger|bbq|barbecue|mac and cheese|mac & cheese|meatloaf|wings|grilled cheese|pot roast|brisket|pulled pork|american/i,
  caribbean: /jerk|plantain|caribbean|jamaican|cuban|mojo/i,
};
const CUISINE_ALIASES: Record<string, string> = {
  chinese: "asian", japanese: "asian", korean: "asian", thai: "asian", vietnamese: "asian", sushi: "asian",
  greek: "mediterranean", "middle eastern": "mediterranean", "tex-mex": "mexican", southern: "american", bbq: "american", comfort: "american",
};

export interface Like {
  label: string;
  re: RegExp;
}

/** Turns "chicken, salmon, Mexican" into matchers for dish names and stations. */
export function likesOf(p: Profile): Like[] {
  return (p.likes || "")
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)
    .map((label) => {
      const w = label.toLowerCase();
      const cuisine = CUISINES[w.replace(/ food$/, "")] ? w.replace(/ food$/, "") : CUISINE_ALIASES[w];
      if (cuisine) return { label: cuisine === w ? `${label} food` : label, re: CUISINES[cuisine] };
      const stem = w.replace(/(es|s)$/, "");
      return { label, re: new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") };
    });
}

/** Which of the student's health goals are switched on, from their goal and the health goals they picked. */
export function goalFlags(p: Profile) {
  const g = p.healthGoals.join("|").toLowerCase();
  return {
    energy: /energy/.test(g) || p.goal === "focus",
    focus: /focus/.test(g) || p.goal === "focus",
    muscle: /muscle/.test(g) || p.goal === "gain",
    sport: /sport|practice/.test(g) || p.goal === "performance",
    sleep: /sleep/.test(g),
    sugar: /sugar/.test(g),
    fiber: /fiber|veg/.test(g),
    iron: /iron/.test(g),
    gut: /gut/.test(g),
    stress: /stress/.test(g),
    lose: p.goal === "lose",
  };
}
type Flags = ReturnType<typeof goalFlags>;

interface Totals extends Macros {
  fiber: number;
  sugar: number;
  sodium: number;
  satFat: number;
  iron: number;
  ironFoods: number; // dishes known to be iron-rich when the menu has no iron number
  points: number;
  veg: number;
  whole: number;
  processed: number;
  fried: number;
  fermented: number;
  omega3: number;
  spicy: number;
  caffeine: number;
  liked: string[]; // which of the student's favorites this plate includes
}

export interface PickContext {
  profile: Profile;
  setup: DiningSetup;
  target: Macros;
  pay: "swipe" | "points";
  mealType?: MealType;
  pointsCap?: number; // max points for this meal when paying à la carte
  used: Map<string, number>; // item name → times already picked this week
  likes?: Like[];
  flags?: Flags;
}

const ctxLikes = (c: PickContext) => (c.likes ??= likesOf(c.profile));
const ctxFlags = (c: PickContext) => (c.flags ??= goalFlags(c.profile));

function score(t: Totals, names: string[], c: PickContext): number {
  const { target: T, profile: p } = c;
  const f = ctxFlags(c);
  const dinner = c.mealType === "dinner";
  let s = 0;

  // Calories and protein for this meal
  const kErr = (t.kcal - T.kcal) / Math.max(150, T.kcal);
  s -= kErr > 0 ? kErr * (f.lose ? 80 : f.energy && c.mealType === "lunch" ? 55 : 40) : -kErr * (p.goal === "gain" || f.sport ? 70 : 35);
  s -= (Math.max(0, T.protein - t.protein) / Math.max(10, T.protein)) * (f.muscle ? 85 : f.lose || f.sport ? 70 : 45);
  s += Math.min(t.protein / Math.max(10, T.protein), 1.3) * (f.muscle ? 14 : 8);
  if (f.sport) s -= (Math.max(0, T.carbs - t.carbs) / Math.max(20, T.carbs)) * 25;
  s -= (Math.max(0, t.fat - T.fat * (f.sleep && dinner ? 1.0 : 1.25)) / Math.max(8, T.fat)) * 20;

  // General health
  s -= (Math.max(0, t.sodium - 900) / 100) * 1.5;
  s -= Math.max(0, t.satFat - 8) * 1.5;
  s -= Math.max(0, t.sugar - (f.sugar ? 8 : 15)) * (f.sugar ? 2.2 : f.energy || f.focus || f.stress ? 1.2 : 0.4);
  s += Math.min(t.fiber, 12) * (f.fiber || f.gut || f.stress ? 1.6 : 0.7);
  s += Math.min(t.veg, 2) * (f.fiber || f.gut ? 7 : 4);
  s += Math.min(t.whole, 1) * (f.energy || f.gut ? 6 : 3);
  s -= t.processed * 12 + t.fried * (f.stress ? 14 : 9);

  // Specific health goals
  if (f.iron) s += Math.min(t.iron, 8) * 2.5 + (t.iron ? 0 : Math.min(t.ironFoods, 2) * 5);
  if (f.gut) s += Math.min(t.fermented, 1) * 7;
  if (f.focus) s += Math.min(t.omega3, 1) * 7;
  if (f.sleep && dinner) s -= t.spicy * 7 + t.caffeine * 20;
  if (f.stress) s += Math.min(((t.protein + t.fiber * 2) / Math.max(200, t.kcal)) * 100, 20) * 0.6; // filling per calorie

  // Favorite foods: a real nudge, but never enough to pick an unhealthy plate over a good one
  s += Math.min(t.liked.length, 2) * 10;

  for (const n of names) s -= (c.used.get(n) || 0) * 9;
  if (c.pay === "points" && c.pointsCap != null) s -= Math.max(0, t.points - c.pointsCap) * 4;
  return s;
}

function totalsOf(parts: { i: DiningItem; k: Kind; n: number }[], c: PickContext): Totals {
  const t: Totals = {
    kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0, iron: 0, ironFoods: 0, points: 0,
    veg: 0, whole: 0, processed: 0, fried: 0, fermented: 0, omega3: 0, spicy: 0, caffeine: 0, liked: [],
  };
  const likes = ctxLikes(c);
  for (const { i, k, n } of parts) {
    t.kcal += i.kcal * n;
    t.protein += i.protein * n;
    t.carbs += i.carbs * n;
    t.fat += i.fat * n;
    t.fiber += (i.fiber || 0) * n;
    t.sugar += (i.sugar || 0) * n;
    t.sodium += (i.sodium || 0) * n;
    t.satFat += (i.satFat || 0) * n;
    t.iron += (i.iron || 0) * n;
    t.points += itemPoints(i, k, c.setup) * n;
    if (IRON_FOOD.test(i.name)) t.ironFoods += 1;
    if (VEG.test(i.name) || VEG.test(i.station)) t.veg += 1;
    if (WHOLE.test(i.name)) t.whole += 1;
    if (PROCESSED.test(i.name)) t.processed += 1;
    if (FRIED.test(i.name)) t.fried += 1;
    if (FERMENTED.test(i.name)) t.fermented += 1;
    if (OMEGA3.test(i.name)) t.omega3 += 1;
    if (SPICY.test(i.name)) t.spicy += 1;
    if (CAFFEINE.test(i.name)) t.caffeine += 1;
    const like = likes.find((l) => l.re.test(i.name) || l.re.test(i.station));
    if (like && !t.liked.includes(like.label)) t.liked.push(like.label);
  }
  return t;
}

/** Plain-language reasons this plate fits the student, most personal first. */
function reasonsFor(t: Totals, c: PickContext): string[] {
  const f = ctxFlags(c);
  const T = c.target;
  const r: string[] = [];
  if (t.liked.length) r.push(`has ${t.liked.join(" and ")}, which you love`);
  r.push(f.muscle ? `${Math.round(t.protein)}g protein for building muscle` : `${Math.round(t.protein)}g protein`);
  if (f.sport && t.carbs >= T.carbs * 0.85) r.push(`${Math.round(t.carbs)}g carbs to fuel practice`);
  if (f.iron && (t.iron >= 3 || (!t.iron && t.ironFoods))) r.push(t.iron >= 3 ? `${t.iron.toFixed(1)} mg iron` : "iron-rich foods");
  if (f.gut && t.fermented) r.push("fermented food for gut health");
  if ((f.fiber || f.gut || f.stress) && t.fiber >= 5) r.push(`${Math.round(t.fiber)}g fiber`);
  if (f.fiber && t.veg) r.push("veggies or fruit included");
  if (f.focus && t.omega3) r.push("omega-3s for focus");
  if (f.energy && t.whole) r.push("whole grains for steady energy");
  if (f.sugar && t.sugar <= 8) r.push("low in sugar");
  if (f.sleep && c.mealType === "dinner" && !t.spicy && t.fat <= T.fat * 1.1) r.push("a lighter, non-spicy dinner for better sleep");
  if (f.stress && t.fiber >= 5 && t.protein >= 20 && !t.fried) r.push("filling, so you're less likely to snack later");
  if (f.lose && t.kcal <= T.kcal * 1.05) r.push(`${Math.round(t.kcal)} kcal`);
  return r.slice(0, 4);
}

const STARCHES = [/rice/i, /potato|fries|tots|hash ?brown/i, /pasta|noodle|penne|spaghetti|mac/i, /bread|roll|naan|biscuit|bagel|toast|focaccia/i];
/** True when two sides are the same kind of starch (rice + rice, potato + sweet potato). */
const sameStarch = (a: DiningItem, b: DiningItem) => STARCHES.some((re) => re.test(a.name) && re.test(b.name));

/** Best plate (one main + up to two sides, main can be doubled) for this meal. */
export function pickPlate(items: DiningItem[], c: PickContext): { picks: DiningPick[]; totals: Totals; reasons: string[] } | null {
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
      for (let b = a + 1; b < sides.length; b++) {
        if (sameStarch(sides[a].i, sides[b].i)) continue;
        consider([...base, { ...sides[a], n: 1 }, { ...sides[b], n: 1 }]);
      }
    }
  }
  const b = best as { parts: { i: DiningItem; k: Kind; n: number }[]; t: Totals } | null;
  if (!b || !b.parts.length) return null;
  for (const x of b.parts) c.used.set(x.i.name, (c.used.get(x.i.name) || 0) + 1);
  return {
    totals: b.t,
    reasons: reasonsFor(b.t, c),
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

/** Single items ranked for the menu browser, with short tags saying why each one suits the student. */
export function rankItems(
  items: DiningItem[],
  c: Omit<PickContext, "used" | "pay" | "pointsCap">,
): { item: DiningItem; kind: Kind; score: number; tags: string[] }[] {
  const ctx: PickContext = { ...c, pay: "swipe", used: new Map() };
  const f = ctxFlags(ctx);
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
      const per = 100 / Math.max(50, t.kcal);
      let score =
        t.protein * per * (f.muscle ? 4 : 3) +
        t.fiber * per * (f.fiber || f.gut || f.stress ? 6 : 4) -
        (t.sodium * per) / 60 -
        t.satFat * per * 2 -
        t.sugar * per * (f.sugar ? 2 : 0.8);
      score += (t.veg ? 2 : 0) + (t.whole ? (f.energy ? 3 : 1) : 0) - t.processed * 4 - t.fried * (f.stress ? 4 : 2);
      if (f.iron) score += Math.min(t.iron, 6) * per * 3 + (t.iron ? 0 : t.ironFoods * 1.5);
      if (f.gut) score += t.fermented * 3;
      if (f.focus) score += t.omega3 * 3;
      score += t.liked.length * 4;

      const tags: string[] = [];
      if (t.liked.length) tags.push("you love it");
      if (t.protein >= 20 || (t.protein * per >= 8 && t.protein >= 8)) tags.push("high protein");
      if (t.fiber >= 4) tags.push("high fiber");
      if (f.iron && (t.iron >= 2.5 || (!t.iron && t.ironFoods))) tags.push("iron-rich");
      if (f.gut && t.fermented) tags.push("fermented");
      if (f.focus && t.omega3) tags.push("omega-3");
      if (f.energy && t.whole) tags.push("whole grain");
      if (f.sugar && x.item.sugar != null && t.sugar <= 3) tags.push("low sugar");
      return { ...x, score, tags: tags.slice(0, 3) };
    })
    .sort((a, b) => b.score - a.score);
}
