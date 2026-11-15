"use client";
import { useEffect, useState } from "react";
import type { MealPlan, Profile } from "./types";
import { HOUSING_DEFAULTS } from "./types";
import { DEFAULT_DINING } from "./dining/types";
import { withDiningDefaults } from "./dining/budget";

const PROFILE_KEY = "campusfuel.profile.v1";
const PLAN_KEY = "campusfuel.plan.v1";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  age: 19,
  sex: "female",
  heightIn: 65,
  weightLb: 140,
  activity: "light",
  goal: "focus",
  healthGoals: [],
  customMacros: {},
  diet: "omnivore",
  allergies: [],
  dislikes: "",
  housing: "dorm",
  appliances: HOUSING_DEFAULTS.dorm,
  skill: 1,
  maxCookMin: 20,
  inCollege: true,
  diningSwipes: 0,
  dining: DEFAULT_DINING,
  wakeWeekday: "07:30",
  sleepWeekday: "23:30",
  wakeWeekend: "09:30",
  sleepWeekend: "00:30",
  schedule: [],
  weeklyBudget: 60,
  address: "",
  pantry: [],
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const loadProfile = () => {
  const p = read<Profile>(PROFILE_KEY);
  if (!p) return null;
  const dining = withDiningDefaults(p.dining);
  // Older profiles only had a swipe count.
  if (!p.dining && p.diningSwipes > 0) dining.payment = "swipes";
  return { ...DEFAULT_PROFILE, ...p, dining };
};
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);
export const loadPlan = () => read<MealPlan>(PLAN_KEY);
export const savePlan = (p: MealPlan | null) => write(PLAN_KEY, p);
export const resetAll = () => {
  write(PROFILE_KEY, null);
  write(PLAN_KEY, null);
};

/** Hydration-safe hook: returns undefined until mounted. */
export function useStored() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  useEffect(() => {
    setProfile(loadProfile());
    setPlan(loadPlan());
  }, []);
  return {
    profile,
    plan,
    setProfile: (p: Profile) => {
      saveProfile(p);
      setProfile(p);
    },
    setPlan: (p: MealPlan | null) => {
      savePlan(p);
      setPlan(p);
    },
  };
}

export async function requestPlan(profile: Profile): Promise<MealPlan> {
  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) throw new Error(`Plan request failed (${res.status})`);
  return res.json();
}
