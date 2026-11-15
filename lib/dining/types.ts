// Dining hall menus, meal plans (swipes / points) and the shapes shared by client and server.
import type { Allergen } from "../types";

export type DiningProvider = "nutritionaddition" | "nutrislice" | "link";
export type DiningMeal = "breakfast" | "lunch" | "dinner" | "all";

/** Where a school's menus live. `slug` is the provider's school id (e.g. "uoregon", "uga"). */
export interface DiningSchoolRef {
  id: string;
  name: string;
  provider: DiningProvider;
  slug: string;
  url?: string; // only for provider "link"
}

export interface DiningHall {
  id: string;
  name: string;
}

export interface DiningItem {
  id: string;
  name: string;
  station: string;
  category?: string; // provider hint such as "entree", "side", "other"
  meal: DiningMeal;
  date?: string; // YYYY-MM-DD when the provider publishes dated menus
  serving?: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number; // mg
  satFat?: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  pork: boolean;
  allergens: Allergen[];
  price?: number; // menu price, when the provider publishes one
}

export interface DiningMenu {
  school: string;
  hall: DiningHall;
  dated: boolean; // true = real day-by-day menu, false = everything this hall serves
  items: DiningItem[];
  fetchedAt: string;
}

/** How the student's dining plan works. Every school is different, so all of this is editable. */
export interface DiningSetup {
  school?: DiningSchoolRef;
  hall?: DiningHall;
  /** What the student pays with at the dining hall. */
  payment: "none" | "swipes" | "points" | "both";
  /** What their school calls points: "Points", "Dining Dollars", "Duck Bucks", "Flex"… */
  pointsLabel: string;
  pointsBalance: number;
  /** Last day of the term; the balance is spread evenly over the weeks left. */
  termEnd: string;
  /** "door" = fixed price to walk in (all-you-care-to-eat). "items" = pay per item (à la carte). */
  pricing: "door" | "items";
  doorPrice: { breakfast: number; lunch: number; dinner: number };
  /** Estimated cost per item when the menu has no prices. */
  itemPrice: { main: number; side: number };
  /** Student-corrected point prices, keyed by lowercase item name. */
  priceOverrides: Record<string, number>;
  /** Points actually spent, newest first. */
  log: { date: string; amount: number; note: string }[];
}

export const DEFAULT_DINING: DiningSetup = {
  payment: "none",
  pointsLabel: "Points",
  pointsBalance: 0,
  termEnd: "",
  pricing: "items",
  doorPrice: { breakfast: 9, lunch: 12, dinner: 14 },
  itemPrice: { main: 7, side: 3 },
  priceOverrides: {},
  log: [],
};

export interface DiningPick {
  name: string;
  station: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  points: number;
}

/** Attached to a PlannedMeal whose source is "dining". */
export interface DiningMealInfo {
  hall: string;
  pay: "swipe" | "points";
  points: number; // 0 when paid with a swipe
  items: DiningPick[];
  dated: boolean;
}
