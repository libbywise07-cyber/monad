"use client";
import { useState } from "react";
import { DAYS, type DayIndex, type ScheduleBlock } from "@/lib/types";
import { fmt12 } from "@/lib/planner";

const KINDS: ScheduleBlock["kind"][] = ["class", "work", "practice", "study", "other"];

export default function ScheduleEditor({ value, onChange }: { value: ScheduleBlock[]; onChange: (v: ScheduleBlock[]) => void }) {
  const [draft, setDraft] = useState<Omit<ScheduleBlock, "id">>({ label: "", kind: "class", days: [0, 2, 4], start: "10:00", end: "10:50" });
  const [err, setErr] = useState("");

  const toggleDay = (d: DayIndex) =>
    setDraft((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : ([...x.days, d].sort() as DayIndex[]) }));

  const add = () => {
    if (!draft.label.trim()) return setErr("Give it a name, e.g. “CHEM 101”.");
    if (!draft.days.length) return setErr("Pick at least one day.");
    if (draft.end <= draft.start) return setErr("End time must be after start time.");
    setErr("");
    onChange([...value, { ...draft, label: draft.label.trim(), id: Math.random().toString(36).slice(2) }]);
    setDraft((x) => ({ ...x, label: "" }));
  };

  return (
    <div className="stack">
      <div className="card" style={{ background: "var(--bg)" }}>
        <div className="grid g2">
          <div>
            <label>What is it?</label>
            <input value={draft.label} placeholder="e.g. BIO 210 lecture" onChange={(e) => setDraft({ ...draft, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <div>
            <label>Type</label>
            <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ScheduleBlock["kind"] })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Starts</label>
            <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </div>
          <div>
            <label>Ends</label>
            <input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </div>
        </div>
        <label style={{ marginTop: 12 }}>Days</label>
        <div className="chips">
          {DAYS.map((d, i) => (
            <button type="button" key={d} className={`chip ${draft.days.includes(i as DayIndex) ? "on" : ""}`} onClick={() => toggleDay(i as DayIndex)}>
              {d}
            </button>
          ))}
        </div>
        {err ? <p className="err" style={{ marginTop: 8 }}>{err}</p> : null}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn primary sm" onClick={add}>
            + Add to schedule
          </button>
        </div>
      </div>

      {value.length ? (
        <table>
          <thead>
            <tr>
              <th>Block</th>
              <th>Days</th>
              <th>Time</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.label}</b> <span className="tag busy">{b.kind}</span>
                </td>
                <td>{b.days.map((d) => DAYS[d]).join(", ")}</td>
                <td>
                  {fmt12(b.start)}–{fmt12(b.end)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((x) => x.id !== b.id))} aria-label={`Remove ${b.label}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">No blocks yet. Add your classes, shifts, practices and study sessions.</p>
      )}
    </div>
  );
}
