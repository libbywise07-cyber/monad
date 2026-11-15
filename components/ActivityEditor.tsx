"use client";
import { useState } from "react";
import { fmt12, STEP_LABEL, workoutKcal } from "@/lib/planner";
import { DAYS, type DayIndex, type Intensity, type Profile, type ScheduleBlock, type Steps } from "@/lib/types";

const ACTIVITIES = ["Lifting", "Running", "Cycling", "Swimming", "Sports practice", "Yoga / pilates", "Dance", "Hiking", "Intramurals", "HIIT / class"];

/** Everyday steps + scheduled workouts. Workouts are saved as schedule blocks so meals avoid them too. */
export default function ActivityEditor({ profile, onChange }: { profile: Profile; onChange: (p: Partial<Profile>) => void }) {
  const [draft, setDraft] = useState({ activity: "Lifting", intensity: "moderate" as Intensity, days: [0, 2, 4] as DayIndex[], start: "17:00", end: "18:00" });
  const [err, setErr] = useState("");
  const workouts = profile.schedule.filter((b) => b.kind === "workout" || b.kind === "practice");

  const add = () => {
    if (!draft.days.length) return setErr("Pick at least one day.");
    if (draft.end <= draft.start) return setErr("End time must be after start time.");
    setErr("");
    const block: ScheduleBlock = {
      id: Math.random().toString(36).slice(2),
      label: draft.activity,
      activity: draft.activity,
      kind: draft.activity === "Sports practice" ? "practice" : "workout",
      intensity: draft.intensity,
      days: draft.days,
      start: draft.start,
      end: draft.end,
    };
    onChange({ schedule: [...profile.schedule, block] });
  };

  const setIntensity = (id: string, intensity: Intensity) =>
    onChange({ schedule: profile.schedule.map((b) => (b.id === id ? { ...b, intensity } : b)) });

  return (
    <div className="stack">
      <div>
        <label>On a normal day, how much do you walk around?</label>
        <div className="option-grid">
          {(Object.keys(STEP_LABEL) as Steps[]).map((k) => (
            <button key={k} type="button" className={`option ${profile.steps === k ? "on" : ""}`} onClick={() => onChange({ steps: k })}>
              <b>{STEP_LABEL[k].replace(" steps", "")}</b>
              <small>{k === "under5k" ? "Mostly sitting, short walks" : k === "5to8k" ? "Walking to a few classes" : k === "8to12k" ? "On your feet a lot" : "Walking all day, active job"}</small>
            </button>
          ))}
        </div>
        <p className="muted small">Not sure? Your phone&apos;s Health or Fitness app shows your daily steps.</p>
      </div>

      <div className="card" style={{ background: "var(--bg)" }}>
        <h3 style={{ margin: 0 }}>Workouts, practice and sports</h3>
        <p className="muted small" style={{ margin: "4px 0 10px" }}>
          We add the calories each one burns on the days you do it, and plan a snack around it. These also go on your schedule.
        </p>
        <div className="grid g2">
          <div>
            <label htmlFor="wo-activity">Activity</label>
            <select id="wo-activity" value={draft.activity} onChange={(e) => setDraft({ ...draft, activity: e.target.value })}>
              {ACTIVITIES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wo-intensity">How hard?</label>
            <select id="wo-intensity" value={draft.intensity} onChange={(e) => setDraft({ ...draft, intensity: e.target.value as Intensity })}>
              <option value="light">Light: could hold a conversation</option>
              <option value="moderate">Moderate: breathing harder</option>
              <option value="hard">Hard: can barely talk</option>
            </select>
          </div>
          <div>
            <label htmlFor="wo-start">Starts</label>
            <input id="wo-start" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </div>
          <div>
            <label htmlFor="wo-end">Ends</label>
            <input id="wo-end" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </div>
        </div>
        <label style={{ marginTop: 10 }}>Days</label>
        <div className="chips">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              className={`chip ${draft.days.includes(i as DayIndex) ? "on" : ""}`}
              onClick={() =>
                setDraft({ ...draft, days: draft.days.includes(i as DayIndex) ? draft.days.filter((x) => x !== i) : ([...draft.days, i].sort() as DayIndex[]) })
              }
            >
              {d}
            </button>
          ))}
        </div>
        {err ? <p className="err">{err}</p> : null}
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn primary sm" onClick={add}>
            + Add workout
          </button>
        </div>
      </div>

      {workouts.length ? (
        <table>
          <thead>
            <tr>
              <th>Workout</th>
              <th>When</th>
              <th>Burns</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {workouts.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.activity || b.label}</b>
                  <div>
                    <select
                      aria-label={`Intensity for ${b.label}`}
                      value={b.intensity ?? "moderate"}
                      onChange={(e) => setIntensity(b.id, e.target.value as Intensity)}
                      style={{ padding: "2px 6px", width: "auto", fontSize: 13 }}
                    >
                      <option value="light">light</option>
                      <option value="moderate">moderate</option>
                      <option value="hard">hard</option>
                    </select>
                  </div>
                </td>
                <td>
                  {b.days.map((d) => DAYS[d]).join(", ")}
                  <div className="muted small">
                    {fmt12(b.start)}–{fmt12(b.end)}
                  </div>
                </td>
                <td className="num">~{workoutKcal(profile, b)} kcal</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn ghost sm" aria-label={`Remove ${b.label}`} onClick={() => onChange({ schedule: profile.schedule.filter((x) => x.id !== b.id) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">No workouts yet. Skip this if you don&apos;t train regularly.</p>
      )}
    </div>
  );
}
