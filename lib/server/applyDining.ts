// Turns generic "dining hall" meals in a plan into real plates from the student's dining hall menu,
// and works out what each one costs in swipes or points.
import { diningAllowance, fmtPoints, typicalMealPoints, usesPoints, withDiningDefaults } from "../dining/budget";
import { itemsFor, pickPlate } from "../dining/pick";
import type { DiningMenu } from "../dining/types";
import { sumMacros, toMin } from "../planner";
import type { MealPlan, PlannedMeal, Profile } from "../types";
import { getMenu, planDates } from "./dining";

const GOAL_WORDS: Record<Profile["goal"], string> = {
  lose: "losing weight",
  maintain: "staying balanced",
  gain: "building muscle",
  performance: "athletic performance",
  focus: "energy and focus",
};

export async function applyDining(plan: MealPlan, p: Profile): Promise<MealPlan> {
  const setup = withDiningDefaults(p.dining);
  const diningMeals = plan.days.flatMap((d) => d.meals.filter((m) => m.source === "dining").map((m) => ({ d, m })));
  if (!diningMeals.length) return plan;

  const allow = diningAllowance(p.diningSwipes, setup);
  let menu: DiningMenu | null = null;
  let menuError = "";
  if (setup.school && setup.hall) {
    try {
      menu = await getMenu(setup.school, setup.hall.id);
      if (!menu.items.length) menuError = `${setup.hall.name} has no menu posted right now`;
    } catch (e) {
      menuError = e instanceof Error ? e.message : "menu unavailable";
    }
  }

  const dates = planDates();
  const used = new Map<string, number>();
  // Swipes cover the meals that would cost the most points (dinners, then lunches); points cover the rest.
  const swipeCount = allow.swipeMeals || (setup.payment === "none" ? p.diningSwipes : 0);
  const bySwipeValue = [...diningMeals].sort((a, b) => typicalMealPoints(setup, b.m.type) - typicalMealPoints(setup, a.m.type) || a.d.day - b.d.day);
  const onSwipe = new Set(usesPoints(setup) ? bySwipeValue.slice(0, swipeCount).map((x) => x.m) : diningMeals.map((x) => x.m));
  let swipesUsed = 0;
  const pointMealsTotal = diningMeals.length - onSwipe.size;
  let pointMealsDone = 0;
  let pointsSpent = 0;
  const label = setup.pointsLabel || "points";

  const ordered = diningMeals.sort((a, b) => a.d.day - b.d.day || toMin(a.m.time) - toMin(b.m.time));
  for (const { d, m } of ordered) {
    const pay: "swipe" | "points" = onSwipe.has(m) ? "swipe" : "points";
    if (pay === "swipe") swipesUsed++;
    const idx = d.meals.indexOf(m);
    let next: PlannedMeal = { ...m };

    if (menu && menu.items.length) {
      const items = itemsFor(menu.items, m.type, menu.dated ? dates[d.day] : undefined);
      const plate = pickPlate(items, {
        profile: p,
        setup,
        target: m.macros,
        pay,
        mealType: m.type,
        // Spread what's left of this week's points over the point meals still to come.
        pointsCap:
          pay === "points" && setup.pricing === "items"
            ? Math.min(allow.pointsPerMeal * 1.15, (allow.pointsPerWeek - pointsSpent) / Math.max(1, pointMealsTotal - pointMealsDone))
            : undefined,
        used,
      });
      if (plate) {
        const points = pay === "swipe" ? 0 : setup.pricing === "door" ? typicalMealPoints(setup, m.type) : +plate.totals.points.toFixed(2);
        const t = plate.totals;
        next = {
          ...m,
          name: plate.picks.map((x) => (x.servings > 1 ? `${x.name} ×${x.servings}` : x.name)).join(" + "),
          macros: { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) },
          steps: plate.picks.map(
            (x) =>
              `${x.station !== "Menu" ? `${x.station}: ` : ""}${x.name}${x.servings > 1 ? ` (${x.servings} servings)` : ""} · ${x.kcal} kcal, ${x.protein}g protein${pay === "points" && setup.pricing === "items" ? ` · ${fmtPoints(x.points, label)}` : ""}`,
          ),
          why: `Best match at ${menu.hall.name} for ${GOAL_WORDS[p.goal]}: ${plate.reasons.join("; ")}.`,
          dining: { hall: menu.hall.name, pay, points, items: plate.picks, dated: menu.dated },
        };
      }
    }
    if (!next.dining) {
      const points = pay === "swipe" ? 0 : typicalMealPoints(setup, m.type);
      next.dining = { hall: setup.hall?.name || "Dining hall", pay, points, items: [], dated: false };
    }
    if (pay === "points") {
      pointsSpent += next.dining.points;
      pointMealsDone++;
    }
    d.meals[idx] = next;
  }
  for (const d of plan.days) d.totals = sumMacros(d.meals);

  plan.dining = {
    hall: menu?.hall.name || setup.hall?.name || "Dining hall",
    dated: !!menu?.dated,
    swipes: swipesUsed,
    points: +pointsSpent.toFixed(2),
    pointsPerWeek: +allow.pointsPerWeek.toFixed(2),
    pointsLabel: label,
  };
  // A weekly allowance resets, so make sure the student knows to spend what's left.
  const leftover = allow.pointsPerWeek - pointsSpent;
  if (usesPoints(setup) && setup.balancePeriod === "week" && leftover >= 2) {
    plan.tips = [
      `Your ${label} reset every week. This plan leaves about ${fmtPoints(+leftover.toFixed(2), label)} unspent, so use them on fruit, yogurt, a salad or a healthy snack at ${plan.dining.hall} before they reset.`,
      ...plan.tips,
    ];
  }
  if (menuError) plan.note = [plan.note, `Couldn't load your dining hall menu (${menuError}), so dining meals are general guidelines.`].filter(Boolean).join(" ");
  return plan;
}
