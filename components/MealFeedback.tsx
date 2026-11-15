"use client";
import { useState } from "react";
import { Modal } from "./CalendarConnect";
import type { PlannedMeal } from "@/lib/types";

export interface Feedback {
  reason: "taste" | "ingredient" | "too-long" | "not-filling" | "too-much" | "other";
  ingredients: string[];
  note: string;
}

const REASONS: [Feedback["reason"], string][] = [
  ["taste", "I didn't like how it tastes"],
  ["ingredient", "It has an ingredient I don't like"],
  ["too-long", "It takes too long to make"],
  ["not-filling", "It doesn't keep me full"],
  ["too-much", "It's too much food"],
  ["other", "Something else"],
];

export const REASON_LABEL: Record<Feedback["reason"], string> = {
  taste: "didn't like the taste",
  ingredient: "ingredient you don't like",
  "too-long": "took too long",
  "not-filling": "not filling enough",
  "too-much": "too much food",
  other: "other",
};

/** "Don't show me this again" → asks why, so future plans learn from it. */
export default function MealFeedback({ meal, onCancel, onSubmit }: { meal: PlannedMeal; onCancel: () => void; onSubmit: (f: Feedback) => void }) {
  const [reason, setReason] = useState<Feedback["reason"] | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const name = meal.name.replace(/ \(×.*\)$/, "");
  const canSend = reason && (reason !== "ingredient" || ingredients.length > 0);

  return (
    <Modal title="Why don't you want this meal?" onClose={onCancel}>
      <h2 style={{ marginTop: 0 }}>Don&apos;t show {name} again?</h2>
      <p className="muted small">Tell us what was off and your next plans will get it right.</p>
      <div className="stack" role="radiogroup" aria-label="Reason">
        {REASONS.map(([v, label]) => (
          <label key={v} className={`option ${reason === v ? "on" : ""}`} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 500 }}>
            <input type="radio" name="reason" id={`reason-${v}`} style={{ width: "auto" }} checked={reason === v} onChange={() => setReason(v)} />
            {label}
          </label>
        ))}
      </div>
      {reason === "ingredient" ? (
        <div style={{ marginTop: 12 }}>
          <label>Which one? We&apos;ll leave it out of every meal.</label>
          <div className="chips">
            {meal.ingredients.map((i) => (
              <button
                key={i.name}
                type="button"
                className={`chip ${ingredients.includes(i.name) ? "on" : ""}`}
                onClick={() => setIngredients((x) => (x.includes(i.name) ? x.filter((y) => y !== i.name) : [...x, i.name]))}
              >
                {i.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {reason === "other" ? (
        <div style={{ marginTop: 12 }}>
          <label htmlFor="fb-note">What didn&apos;t work? (optional)</label>
          <input id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. too spicy, weird texture" />
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!canSend} onClick={() => reason && onSubmit({ reason, ingredients, note })}>
          Hide it and pick a new meal
        </button>
      </div>
    </Modal>
  );
}
