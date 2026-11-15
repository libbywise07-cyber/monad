"use client";
import { calorieBreakdown } from "@/lib/planner";
import type { Profile } from "@/lib/types";

const GOAL_WHY: Record<Profile["goal"], string> = {
  focus: "steady energy without big swings, so you stay sharp through long class days",
  maintain: "staying about where you are while eating balanced meals",
  lose: "losing fat slowly (about 0.5–1 lb a week) without losing muscle or energy",
  gain: "building muscle, with a small surplus so the extra goes to muscle rather than fat",
  performance: "fueling training and recovery so you can perform and bounce back",
};

/** Plain-language explanation of the calorie and protein targets. */
export default function NutritionExplainer({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const b = calorieBreakdown(profile);
  const t = b.targets;
  const lb = profile.weightLb;
  const rows: [string, string, string][] = [
    ["Your body at rest", `${b.bmr.toLocaleString()} kcal`, "Breathing, thinking, keeping warm. Based on your age, height, weight and sex."],
    ["Everyday movement", `+${b.everyday.toLocaleString()} kcal`, `From ${b.everydayLabel}.`],
  ];
  if (b.detailed && b.workouts.length)
    rows.push([
      "Workouts & practice",
      `+${b.workoutAvg.toLocaleString()} kcal/day avg`,
      b.workouts.map((w) => `${w.label}: ~${w.perSession} kcal × ${w.days}/wk`).join(" · ") + ". Added on the days you train.",
    ]);
  if (b.goalAdj)
    rows.push([
      "Your goal",
      `${b.goalAdj > 0 ? "+" : ""}${b.goalAdj} kcal`,
      b.goalAdj < 0 ? "A gentle deficit you can keep up." : "A small surplus for muscle and training.",
    ]);
  if (b.custom) rows.push(["Your own target", `${profile.customMacros?.kcal} kcal`, "You set this yourself, so we use it as your base."]);

  return (
    <div className="explain stack">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Why these numbers</h3>
        <span className="muted small">Estimates, not medical advice</span>
      </div>
      <div className="explain-totals">
        <div>
          <b>{t.kcal.toLocaleString()}</b>
          <span>kcal / day{b.range.max - b.range.min >= 50 ? ` (${b.range.min.toLocaleString()}–${b.range.max.toLocaleString()})` : ""}</span>
        </div>
        <div>
          <b>{t.protein} g</b>
          <span>protein</span>
        </div>
        <div>
          <b>{t.carbs} g</b>
          <span>carbs</span>
        </div>
        <div>
          <b>{t.fat} g</b>
          <span>fat</span>
        </div>
      </div>
      {!compact ? (
        <>
          <table className="explain-table">
            <tbody>
              {rows.map(([k, v, why]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td className="num">{v}</td>
                  <td className="muted small">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <b>Calories</b> are set for {GOAL_WHY[profile.goal]}.
              {b.range.max - b.range.min >= 50 ? " Days you work out get more, so you're not running on empty after practice." : ""}
            </li>
            <li>
              <b>Protein</b> is {b.proteinPerKg} g per kg of body weight ({Math.round(lb * 0.4536)} kg). It keeps you full, protects muscle
              {profile.goal === "gain" || profile.goal === "performance" ? " and helps you recover and build strength" : ""}.
            </li>
            <li>
              <b>Fat</b> is about 28% of calories, which you need for hormones and absorbing vitamins. <b>Carbs</b> fill the rest. They&apos;re your brain&apos;s
              main fuel during exams and long study sessions.
            </li>
          </ul>
          <p className="muted small" style={{ margin: 0 }}>
            Calorie needs vary from person to person by about 10%. If you&apos;re hungry, tired or your weight moves faster than you want, adjust the
            targets in Goals. If you have a medical condition or a history of disordered eating, check with a doctor or your campus dietitian first.
          </p>
        </>
      ) : null}
    </div>
  );
}
