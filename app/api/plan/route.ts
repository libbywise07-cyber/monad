import { NextResponse } from "next/server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, describeError, hasClaudeCredentials, MODEL } from "@/lib/claude";
import { priceGroceries } from "@/lib/prices";
import { buildRulePlan, freeWindows, mealSlots, nutritionTargets, prepSession, sumMacros, toHHMM, toMin } from "@/lib/planner";
import { DAYS, type DayIndex, type MealPlan, type Profile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MacrosZ = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() });
const MealZ = z.object({
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  time: z.string().describe("24h HH:MM, must fall inside a free window"),
  name: z.string(),
  prepMin: z.number(),
  portable: z.boolean(),
  source: z.enum(["cook", "dining", "prepped"]),
  macros: MacrosZ,
  cost: z.number().describe("USD grocery cost for this meal, excluding pantry items; 0 for dining hall"),
  ingredients: z.array(
    z.object({
      name: z.string().describe("generic grocery name, e.g. 'eggs', 'rolled oats'"),
      qty: z.string().describe("amount one serving uses, e.g. '2', '1/2 cup', '1 tbsp', '6 oz'"),
      cost: z.number().describe("cost of just that amount, USD"),
      aisle: z.string(),
      packageSize: z.string().describe("the smallest common package a student would buy, e.g. '1 dozen', '16 oz jar', '1 lb pack'"),
      packagePrice: z.number().describe("typical US store-brand price of that whole package, USD"),
    }),
  ),
  steps: z.array(z.string()),
  usesPantry: z.array(z.string()).describe("ingredient names taken from the user's pantry"),
  why: z.string().describe("one short sentence on why this meal fits this moment of their day"),
});
const PlanZ = z.object({
  days: z.array(z.object({ day: z.number().describe("0=Mon … 6=Sun"), meals: z.array(MealZ) })),
  prepSession: z.object({ day: z.number(), time: z.string(), durationMin: z.number(), tasks: z.array(z.string()) }),
  tips: z.array(z.string()),
});

const SYSTEM = `You are CampusFuel, a registered-dietitian-style meal planner for busy college students.
You build 7-day meal plans that fit around the student's class/work schedule, kitchen, skills, diet, budget and pantry.

Hard rules:
- Every meal time must fall inside one of that day's free windows. Never schedule food during a class or other busy block.
- Total prep + eating time must fit the window. If a window is short (<25 min) use a portable, no-cook or pre-prepped meal (source "prepped" if it is made during the weekly prep session).
- Only use the appliances listed. A dorm with only a microwave means no stovetop recipes.
- Never use an ingredient that conflicts with the diet, allergies or dislikes.
- Recipes must match the cooking skill level (1 = microwave/assembly only, 2 = follows simple recipes, 3 = confident cook) and respect the max cook time.
- Prefer ingredients from the pantry and reuse ingredients across meals so groceries stay cheap.
- Keep the week's grocery bill at or under the weekly budget. The bill is priced by whole packages
  (a dozen eggs, a 16 oz jar of peanut butter), not by the amount used, so reuse the same ingredients
  across several meals and avoid buying a package for a single use. Use realistic US store-brand prices.
- If the student has dining hall swipes, use up to that many per week as source "dining" (cost 0) on lunches/dinners, ideally on days with long breaks near the dining hall time.
- Hit the daily calorie and macro targets within ~10%, especially protein.
- Use the student's health goals to shape choices (e.g. fiber, iron, less added sugar, pre-practice fueling).
Keep steps short (max 4) and practical.`;

export async function POST(req: Request) {
  const { profile } = (await req.json()) as { profile: Profile };
  if (!profile) return NextResponse.json({ error: "profile required" }, { status: 400 });

  if (!hasClaudeCredentials()) {
    const plan = buildRulePlan(profile);
    plan.note = "Generated with the built-in planner. Add ANTHROPIC_API_KEY for fully custom AI plans.";
    return NextResponse.json(plan);
  }

  try {
    const plan = await aiPlan(profile);
    return NextResponse.json(plan);
  } catch (err) {
    const plan = buildRulePlan(profile);
    plan.note = `AI planner unavailable (${describeError(err)}). Showing the built-in plan instead.`;
    return NextResponse.json(plan);
  }
}

async function aiPlan(p: Profile): Promise<MealPlan> {
  const targets = nutritionTargets(p);
  const schedule = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => ({
    day: d,
    name: DAYS[d],
    busy: p.schedule.filter((b) => b.days.includes(d)).map((b) => `${b.start}-${b.end} ${b.label} (${b.kind})`),
    freeWindows: freeWindows(p, d).map((w) => `${w.start}-${w.end} (${w.minutes} min)`),
    suggestedMealTimes: mealSlots(p, d).map((s) => `${s.type} @ ${toHHMM(s.time)}`),
  }));

  const student = {
    about: { age: p.age, sex: p.sex, heightIn: p.heightIn, weightLb: p.weightLb, activity: p.activity },
    goal: p.goal,
    healthGoals: p.healthGoals,
    dailyTargets: targets,
    diet: p.diet,
    allergies: p.allergies,
    dislikes: p.dislikes || "none",
    housing: p.housing,
    appliances: p.appliances,
    cookingSkill: p.skill,
    maxCookMinutes: p.maxCookMin,
    diningHallSwipesPerWeek: p.diningSwipes,
    weeklyGroceryBudgetUSD: p.weeklyBudget,
    pantry: p.pantry.map((x) => (x.quantity ? `${x.name} (${x.quantity})` : x.name)),
    schedule,
  };

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(PlanZ) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Build my 7-day plan (days 0–6, Monday first). Here is everything about me:\n\n${JSON.stringify(student, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("the request was declined");
  if (response.stop_reason === "max_tokens") throw new Error("the plan was cut off");
  const out = response.parsed_output;
  if (!out) throw new Error("could not parse the plan");

  const days = ([0, 1, 2, 3, 4, 5, 6] as DayIndex[]).map((d) => {
    const src = out.days.find((x) => x.day === d) || { meals: [] };
    const wins = freeWindows(p, d);
    const meals = src.meals
      .map((m) => {
        const t = toMin(m.time);
        const w = wins.find((w) => t >= toMin(w.start) && t < toMin(w.start) + w.minutes);
        return { ...m, windowMin: w ? toMin(w.start) + w.minutes - t : 0 };
      })
      .map((m) => ({
        ...m,
        servings: 1,
        ingredients: m.ingredients.map(({ packageSize, packagePrice, ...ing }) => ({ ...ing, pkg: packageSize, pkgPrice: packagePrice })),
      }))
      .sort((a, b) => toMin(a.time) - toMin(b.time));
    return { day: d, meals, totals: sumMacros(meals) };
  });
  const groceries = priceGroceries(days, p.pantry);
  return {
    generatedAt: new Date().toISOString(),
    engine: "ai",
    targets,
    days,
    groceries,
    groceryTotal: +groceries.reduce((a, g) => a + g.cost, 0).toFixed(2),
    prepSession: out.prepSession ? { ...out.prepSession, day: out.prepSession.day as DayIndex } : prepSession(p, days),
    tips: out.tips,
  };
}
