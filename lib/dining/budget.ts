// Meal plan math shared by the planner and the dashboard: how many dining meals the student can afford.
import type { MealType } from "../types";
import { DEFAULT_DINING, type DiningSetup } from "./types";

const WEEK = 7 * 24 * 3600 * 1000;
export const DEFAULT_TERM_WEEKS = 10;

export const withDiningDefaults = (d?: Partial<DiningSetup>): DiningSetup => ({
  ...DEFAULT_DINING,
  ...d,
  doorPrice: { ...DEFAULT_DINING.doorPrice, ...d?.doorPrice },
  itemPrice: { ...DEFAULT_DINING.itemPrice, ...d?.itemPrice },
  priceOverrides: { ...d?.priceOverrides },
  log: d?.log ? [...d.log] : [],
});

export const usesSwipes = (d: DiningSetup) => d.payment === "swipes" || d.payment === "both";
export const usesPoints = (d: DiningSetup) => d.payment === "points" || d.payment === "both";

/** Whole weeks left in the term (at least 1). Without a term end date we assume a 10-week quarter. */
export function weeksLeft(d: DiningSetup, now = new Date()): number {
  if (!d.termEnd) return DEFAULT_TERM_WEEKS;
  const end = new Date(`${d.termEnd}T23:59:59`);
  if (Number.isNaN(end.getTime())) return DEFAULT_TERM_WEEKS;
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / WEEK));
}

/** Points the student can spend per week and still make it to the end of the term. */
export const weeklyPointsBudget = (d: DiningSetup) => (usesPoints(d) ? Math.max(0, d.pointsBalance) / weeksLeft(d) : 0);

/** Typical cost of one dining meal in points (used to decide how many meals points can cover). */
export function typicalMealPoints(d: DiningSetup, type: MealType = "lunch"): number {
  if (d.pricing === "door") return type === "breakfast" ? d.doorPrice.breakfast : type === "dinner" ? d.doorPrice.dinner : d.doorPrice.lunch;
  // A typical plate: one main and two sides (one side at breakfast).
  return d.itemPrice.main + d.itemPrice.side * (type === "breakfast" ? 1 : 2);
}

export interface DiningAllowance {
  swipeMeals: number;
  pointMeals: number;
  total: number;
  pointsPerWeek: number;
  pointsPerMeal: number;
}

export function diningAllowance(swipesPerWeek: number, d: DiningSetup): DiningAllowance {
  const swipeMeals = usesSwipes(d) || d.payment === "none" ? Math.max(0, Math.min(21, swipesPerWeek)) : 0;
  const pointsPerWeek = weeklyPointsBudget(d);
  const avg = Math.max(1, (typicalMealPoints(d, "lunch") + typicalMealPoints(d, "dinner")) / 2);
  const pointMeals = usesPoints(d) ? Math.max(0, Math.min(21 - swipeMeals, Math.floor(pointsPerWeek / avg))) : 0;
  return {
    swipeMeals,
    pointMeals,
    total: swipeMeals + pointMeals,
    pointsPerWeek,
    pointsPerMeal: pointMeals ? pointsPerWeek / pointMeals : avg,
  };
}

export const fmtPoints = (n: number, label: string) => `${Number.isInteger(n) ? n : n.toFixed(2)} ${label}`;
