// Shared types for CampusFuel.
import type { DiningMealInfo, DiningSetup } from "./dining/types";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Housing = "dorm" | "apartment" | "greek" | "home";
export type Sex = "female" | "male" | "other";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "athlete";
export type Goal = "lose" | "maintain" | "gain" | "performance" | "focus";
export type Diet = "omnivore" | "vegetarian" | "vegan" | "pescatarian" | "halal" | "kosher";
export type Skill = 1 | 2 | 3;
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const ALLERGENS = [
  "peanut",
  "tree nut",
  "dairy",
  "gluten",
  "egg",
  "soy",
  "shellfish",
  "fish",
  "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const APPLIANCES = [
  "microwave",
  "mini fridge",
  "full fridge",
  "freezer",
  "stovetop",
  "oven",
  "air fryer",
  "rice cooker",
  "electric kettle",
  "toaster",
  "blender",
  "instant pot",
] as const;
export type Appliance = (typeof APPLIANCES)[number];

export const HOUSING_DEFAULTS: Record<Housing, Appliance[]> = {
  dorm: ["microwave", "mini fridge", "electric kettle"],
  apartment: ["microwave", "full fridge", "freezer", "stovetop", "oven", "toaster"],
  greek: ["microwave", "full fridge", "freezer", "stovetop", "oven", "toaster"],
  home: ["microwave", "full fridge", "freezer", "stovetop", "oven", "toaster", "blender"],
};

export interface ScheduleBlock {
  id: string;
  label: string;
  kind: "class" | "work" | "practice" | "study" | "other";
  days: DayIndex[];
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  source?: CalendarProvider; // set when imported from a connected calendar
}

export type CalendarProvider = "google" | "outlook";
export const CALENDAR_NAMES: Record<CalendarProvider, string> = { google: "Google Calendar", outlook: "Outlook Calendar" };

export interface CalendarLink {
  provider: CalendarProvider;
  account: string;
  connectedAt: string;
  addMealsToCalendar: boolean;
}

export interface PantryItem {
  name: string;
  quantity?: string;
  category?: string;
}

export interface Profile {
  name: string;
  age: number;
  sex: Sex;
  heightIn: number;
  weightLb: number;
  activity: Activity;
  goal: Goal;
  healthGoals: string[];
  customMacros?: { kcal?: number; protein?: number; carbs?: number; fat?: number };
  diet: Diet;
  allergies: Allergen[];
  dislikes: string;
  housing: Housing;
  appliances: Appliance[];
  skill: Skill;
  maxCookMin: number;
  inCollege: boolean; // false = skip dining halls and meal plans
  diningSwipes: number; // per week
  dining: DiningSetup; // school, dining hall, points balance and how the meal plan charges
  wakeWeekday: string;
  sleepWeekday: string;
  wakeWeekend: string;
  sleepWeekend: string;
  schedule: ScheduleBlock[];
  weeklyBudget: number;
  address: string;
  lat?: number; // set when the address is picked from suggestions or current location
  lon?: number;
  calendar?: CalendarLink;
  stores?: SavedStore[]; // up to 10 stores the student shops at
  pantry: PantryItem[];
}

export interface Ingredient {
  name: string;
  qty: string; // amount one serving uses, e.g. "1/2 cup"
  cost: number; // rough cost of that amount (used only to keep meal choices on budget)
  aisle: string;
  pkg?: string; // package you'd buy, when known (AI plans)
  pkgPrice?: number; // price of that package
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PlannedMeal {
  type: MealType;
  time: string; // "HH:MM"
  windowMin: number; // minutes available in this free window
  name: string;
  prepMin: number;
  portable: boolean;
  source: "cook" | "dining" | "prepped";
  macros: Macros;
  cost: number;
  ingredients: Ingredient[];
  servings?: number; // portion multiplier for the ingredient amounts (default 1)
  steps: string[];
  usesPantry: string[];
  why: string;
  dining?: DiningMealInfo; // set when this meal is eaten at a dining hall with a known menu
}

export interface DayPlan {
  day: DayIndex;
  meals: PlannedMeal[];
  totals: Macros;
}

export interface GroceryItem {
  name: string;
  aisle: string;
  pkg: string; // what to buy, e.g. "1 dozen" or "2 × 15 oz can"
  packages: number;
  cost: number; // price of the packages
  forMeals: number;
  usage: string; // e.g. "you'll use 9 of 12"
  estimated: boolean; // true when the item isn't in our price list
}

export interface MealPlan {
  generatedAt: string;
  engine: "ai" | "rules";
  note?: string;
  targets: Macros;
  days: DayPlan[];
  groceries: GroceryItem[];
  groceryTotal: number;
  prepSession?: { day: DayIndex; time: string; durationMin: number; tasks: string[] };
  tips: string[];
  dining?: {
    hall: string;
    dated: boolean; // true = real menus for these dates
    swipes: number; // swipes used this week
    points: number; // points this plan spends this week
    pointsPerWeek: number; // what the balance allows per week
    pointsLabel: string;
  };
}

export interface FreeWindow {
  start: string;
  end: string;
  minutes: number;
}

export const MAX_STORES = 10;

export interface SavedStore {
  id: string; // stable key: name + rounded coordinates
  name: string;
  type: string;
  address: string;
  lat: number;
  lon: number;
  distanceMi: number;
  driveMin: number | null;
  priceTier: string;
  priceFactor: number;
  priceKnown: boolean;
}
