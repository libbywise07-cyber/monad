// Grocery pricing by the PACKAGE you actually buy, not the slice of it a meal uses.
// The week's recipes are added up per ingredient, converted to the package's unit, and rounded
// up to whole packages: 9 eggs across the week -> 1 dozen ($3.49), 20 eggs -> 2 dozen.
//
// Prices are typical US store-brand prices at a mid-range supermarket (Kroger / Safeway / Target
// tier) in 2025–26. They are estimates; real prices vary by store and region.

import type { DayPlan, GroceryItem, PantryItem } from "./types";

type Unit = "each" | "cup" | "tbsp" | "tsp" | "oz" | "slice" | "can" | "block" | "scoop" | "cube" | "serving";

interface Product {
  match: string[]; // ingredient names this covers (lowercase substrings)
  pkg: string; // what you buy
  price: number; // USD per package
  unit: Unit; // unit the size is measured in
  size: number; // amount of `unit` in one package
  aisle: string;
}

const P = (match: string | string[], pkg: string, price: number, unit: Unit, size: number, aisle: string): Product => ({
  match: Array.isArray(match) ? match : [match],
  pkg,
  price,
  unit,
  size,
  aisle,
});

// Most specific names first: the first match wins.
export const CATALOG: Product[] = [
  // Dairy & eggs
  P("eggs", "1 dozen", 3.49, "each", 12, "Dairy & eggs"),
  P("soy milk", "half gallon", 3.49, "cup", 8, "Dairy & eggs"),
  P("coconut milk", "13.5 oz can", 1.99, "can", 1, "Canned & jarred"),
  P("milk", "half gallon", 2.79, "cup", 8, "Dairy & eggs"),
  P("greek yogurt", "32 oz tub", 5.49, "cup", 4, "Dairy & eggs"),
  P("string cheese", "12-pack", 4.49, "each", 12, "Dairy & eggs"),
  P("shredded cheese", "8 oz bag", 2.49, "cup", 2, "Dairy & eggs"),
  P("parmesan", "8 oz grated", 3.79, "tbsp", 40, "Dairy & eggs"),
  P("peanut butter", "16 oz jar", 2.79, "tbsp", 28, "Canned & jarred"), // before "butter"
  P("butter", "1 lb (4 sticks)", 4.49, "tbsp", 32, "Dairy & eggs"),
  P("tzatziki", "8 oz tub", 3.99, "tbsp", 16, "Deli"),
  P("hummus", "10 oz tub", 3.49, "tbsp", 18, "Deli"),
  P("firm tofu", "14 oz block", 2.29, "block", 1, "Produce"),

  // Meat & fish
  P("rotisserie chicken", "whole chicken (~24 oz meat)", 6.99, "oz", 24, "Deli"),
  P("sliced turkey", "9 oz deli pack", 4.49, "oz", 9, "Deli"),
  P("ground turkey", "1 lb pack", 4.99, "oz", 16, "Meat & seafood"),
  P("ground beef", "1 lb pack (93% lean)", 6.49, "oz", 16, "Meat & seafood"),
  P("chicken thighs", "1.5 lb pack, boneless", 5.99, "oz", 24, "Meat & seafood"),
  P("chicken breast", "1.5 lb pack", 6.49, "oz", 24, "Meat & seafood"),
  P("salmon", "12 oz frozen fillets (3)", 8.49, "oz", 12, "Meat & seafood"),
  P("tuna", "5 oz can", 1.19, "can", 1, "Canned & jarred"),

  // Produce
  P("banana", "each", 0.27, "each", 1, "Produce"),
  P("apple", "each", 0.79, "each", 1, "Produce"),
  P("avocado", "each", 1.0, "each", 1, "Produce"),
  P("lemon", "each", 0.69, "each", 1, "Produce"),
  P("bell pepper", "each", 0.99, "each", 1, "Produce"),
  P("cucumber", "each", 0.79, "each", 1, "Produce"),
  P("sweet potato", "each (~1/2 lb)", 1.1, "each", 1, "Produce"),
  P("baby potatoes", "1.5 lb bag", 3.49, "oz", 24, "Produce"),
  P("spinach", "5 oz clamshell", 2.79, "cup", 5, "Produce"),
  P("cherry tomatoes", "10 oz pint", 2.99, "cup", 2, "Produce"),
  P("green beans", "12 oz bag", 2.49, "cup", 4, "Produce"),
  P("baby carrots", "1 lb bag", 1.29, "cup", 5, "Produce"),
  P("shredded lettuce", "8 oz bag", 1.99, "cup", 6, "Produce"),

  // Frozen
  P("frozen berries", "16 oz bag", 3.49, "cup", 3.5, "Frozen"),
  P("frozen broccoli", "12 oz bag", 1.79, "cup", 4, "Frozen"),
  P("frozen corn", "12 oz bag", 1.49, "cup", 3, "Frozen"),
  P("frozen peas & carrots", "12 oz bag", 1.49, "cup", 3, "Frozen"),
  P("frozen peas", "12 oz bag", 1.49, "cup", 3, "Frozen"),
  P("frozen stir-fry", "16 oz bag", 2.29, "cup", 5, "Frozen"),
  P("frozen edamame", "12 oz bag, shelled", 2.49, "cup", 3, "Frozen"),

  // Grains & bread
  P("rolled oats", "18 oz canister", 3.29, "cup", 6.5, "Grains & pasta"),
  P("microwave rice", "2-pack cups", 2.29, "each", 2, "Grains & pasta"),
  P("red lentils", "1 lb bag", 2.29, "cup", 2.5, "Grains & pasta"),
  P("rice", "2 lb bag", 2.49, "cup", 4.75, "Grains & pasta"), // dry cups
  P("pasta", "1 lb box", 1.49, "oz", 16, "Grains & pasta"),
  P("instant ramen", "6-pack", 2.49, "each", 6, "Grains & pasta"),
  P("granola", "12 oz bag", 3.49, "cup", 3, "Grains & pasta"),
  P("panko", "8 oz canister", 2.49, "cup", 3, "Grains & pasta"),
  P("whole wheat bread", "20 oz loaf", 2.49, "slice", 20, "Bakery"),
  P("pita", "6-pack", 2.49, "each", 6, "Bakery"),
  P("corn tortillas", "30-pack", 2.49, "each", 30, "Bakery"),
  P("tortillas", "10-pack, burrito size", 2.99, "each", 10, "Bakery"),

  // Canned & jarred
  P("black beans", "15 oz can", 0.99, "can", 1, "Canned & jarred"),
  P("chickpeas", "15 oz can", 1.09, "can", 1, "Canned & jarred"),
  P("refried beans", "16 oz can", 1.29, "can", 1, "Canned & jarred"),
  P("diced tomatoes", "14.5 oz can", 1.09, "can", 1, "Canned & jarred"),
  P("marinara", "24 oz jar", 2.79, "cup", 3, "Canned & jarred"),
  P("salsa", "16 oz jar", 2.79, "tbsp", 32, "Canned & jarred"),
  P("pesto", "6.7 oz jar", 3.49, "tbsp", 12, "Canned & jarred"),

  // Oils, sauces, spices
  P("olive oil", "17 oz bottle", 6.99, "tbsp", 34, "Oils & sauces"),
  P("mayo", "15 oz jar", 3.49, "tbsp", 30, "Oils & sauces"),
  P("soy sauce", "15 oz bottle", 2.49, "tbsp", 30, "Oils & sauces"),
  P("teriyaki", "10 oz bottle", 2.99, "tbsp", 18, "Oils & sauces"),
  P("cornstarch", "16 oz box", 1.99, "tbsp", 60, "Baking & spices"),
  P("curry powder", "1.75 oz jar", 2.99, "tsp", 24, "Baking & spices"),
  P("taco seasoning", "1 oz packet", 0.99, "tbsp", 2.5, "Baking & spices"),
  P("everything bagel seasoning", "2.3 oz jar", 2.49, "tsp", 22, "Baking & spices"),
  P("chicken bouillon", "8 cubes", 1.29, "cube", 8, "Baking & spices"),
  P("chia seeds", "12 oz bag", 4.99, "tbsp", 26, "Baking & spices"),

  // Snacks
  P("protein powder", "2 lb tub (~28 scoops)", 24.99, "scoop", 28, "Snacks"),
  P("protein bar", "box of 5", 7.49, "each", 5, "Snacks"),
  P("trail mix", "16 oz bag", 5.49, "cup", 3.5, "Snacks"),
  P("whole grain crackers", "9 oz box (~90 crackers)", 3.49, "each", 90, "Snacks"),
  P("roasted chickpea snack", "5 oz bag (5 servings)", 3.99, "serving", 5, "Snacks"),
];

export function findProduct(name: string): Product | undefined {
  const n = name.toLowerCase();
  return CATALOG.find((p) => p.match.some((m) => n.includes(m)));
}

// ---------- quantity parsing ----------
const VOLUME_IN_CUPS: Partial<Record<Unit, number>> = { cup: 1, tbsp: 1 / 16, tsp: 1 / 48 };

function parseNumber(s: string): number | null {
  const m = s.match(/^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  if (m[1]) return +m[1] + +m[2] / +m[3];
  if (m[4]) return +m[4] / +m[5];
  return +m[6];
}

/** "3/4 cup cooked" -> { n: 0.75, unit: "cup", cooked: true } */
export function parseQty(qty: string): { n: number; unit: Unit | null; cooked: boolean } {
  const q = qty.toLowerCase().trim();
  const n = parseNumber(q) ?? 1;
  const rest = q.replace(/^[\d\s./]+/, "");
  const cooked = /\bcooked\b/.test(rest);
  const unit: Unit | null = /\bcups?\b/.test(rest)
    ? "cup"
    : /\btbsp|tablespoon/.test(rest)
      ? "tbsp"
      : /\btsp|teaspoon/.test(rest)
        ? "tsp"
        : /\boz\b|ounce/.test(rest)
          ? "oz"
          : /\bslices?\b/.test(rest)
            ? "slice"
            : /\bcans?\b/.test(rest)
              ? "can"
              : /\bblocks?\b/.test(rest)
                ? "block"
                : /\bscoops?\b/.test(rest)
                  ? "scoop"
                  : /\bcubes?\b/.test(rest)
                    ? "cube"
                    : /\bhandfuls?\b/.test(rest)
                      ? "cup" // a handful of greens is about a cup
                      : /\bservings?\b|\bpacks?\b/.test(rest)
                        ? "serving"
                        : rest === "" || /^(large|medium|small|\(|ct\b)/.test(rest)
                          ? "each"
                          : null;
  return { n, unit, cooked };
}

/** Amount of `qty` expressed in the product's unit, or null if the units can't be compared. */
export function toProductUnits(qty: string, product: Product): number | null {
  const { n, unit, cooked } = parseQty(qty);
  if (!unit) return null;
  let amount = n;
  // cooked rice/grains are ~3x the dry volume
  if (cooked && product.unit === "cup") amount = n / 3;
  if (unit === product.unit) return amount;
  const a = VOLUME_IN_CUPS[unit];
  const b = VOLUME_IN_CUPS[product.unit];
  if (a != null && b != null) return (amount * a) / b;
  // single items sold as packs (ramen "1 pack", snack "1 serving") count as one each
  if ((unit === "serving" && product.unit === "each") || (unit === "each" && product.unit === "serving")) return amount;
  return null;
}

// ---------- grocery list ----------
function usageNote(used: number, packages: number, size: number, unit: Unit): string {
  const share = used / (packages * size);
  if (unit === "each" && size === 1) return "";
  if (unit === "each" && size > 1) return `you'll use ${Math.round(used)} of ${packages * size}`;
  if (share >= 0.9) return "you'll use all of it";
  if (share >= 0.6) return "you'll use most of it";
  if (share >= 0.35) return "you'll use about half";
  return "leftovers for next week";
}

const isInPantry = (name: string, pantry: PantryItem[]) => {
  const n = name.toLowerCase().replace(/s\b/g, "");
  return pantry.some((p) => {
    const x = p.name.toLowerCase().replace(/s\b/g, "").trim();
    return x && (n.includes(x) || x.includes(n));
  });
};

/**
 * Build the week's shopping list priced by package.
 * Ingredients the student already has (pantry) are left off.
 */
export function priceGroceries(days: DayPlan[], pantry: PantryItem[]): GroceryItem[] {
  type Acc = { name: string; aisle: string; product?: Product; amount: number; unknownUses: number; meals: number; fallbackCost: number; aiPkg?: string; aiPrice?: number };
  const acc = new Map<string, Acc>();

  for (const d of days)
    for (const m of d.meals)
      for (const ing of m.ingredients) {
        if (m.usesPantry.includes(ing.name) || isInPantry(ing.name, pantry)) continue;
        const product = findProduct(ing.name);
        const key = product ? product.pkg + "|" + product.match[0] : ing.name.toLowerCase();
        const a = acc.get(key) || { name: ing.name, aisle: product?.aisle ?? ing.aisle, product, amount: 0, unknownUses: 0, meals: 0, fallbackCost: 0 };
        a.meals += 1;
        const servings = m.servings ?? 1;
        const amt = product ? toProductUnits(ing.qty, product) : null;
        if (amt != null) a.amount += amt * servings;
        else a.unknownUses += servings;
        a.fallbackCost += ing.cost;
        if (ing.pkg) a.aiPkg = ing.pkg;
        if (ing.pkgPrice) a.aiPrice = ing.pkgPrice;
        acc.set(key, a);
      }

  const items: GroceryItem[] = [];
  for (const a of acc.values()) {
    if (a.product) {
      const p = a.product;
      // an amount we couldn't measure counts as a quarter of a package per use
      const used = a.amount + a.unknownUses * (p.size / 4);
      const packages = Math.max(1, Math.ceil(used / p.size - 0.05));
      items.push({
        name: a.name,
        aisle: p.aisle,
        pkg: p.unit === "each" && p.size === 1 ? `buy ${packages}` : packages > 1 ? `${packages} × ${p.pkg}` : p.pkg,
        packages,
        cost: +(packages * p.price).toFixed(2),
        forMeals: a.meals,
        usage: usageNote(used, packages, p.size, p.unit),
        estimated: false,
      });
    } else {
      // Not in our price list (usually an AI-suggested ingredient): use the AI's package price if it
      // gave one, else assume a small package worth a few servings.
      const price = a.aiPrice ?? Math.max(1.99, Math.round(a.fallbackCost * 3) - 0.01);
      items.push({
        name: a.name,
        aisle: a.aisle,
        pkg: a.aiPkg ?? "1 package",
        packages: 1,
        cost: +price.toFixed(2),
        forMeals: a.meals,
        usage: "",
        estimated: true,
      });
    }
  }
  return items.sort((x, y) => x.aisle.localeCompare(y.aisle) || x.name.localeCompare(y.name));
}
