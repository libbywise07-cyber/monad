"use client";
// MOCKUP of writing planned meals back to the user's calendar.
import { useState } from "react";
import { Modal, ProviderMark } from "./CalendarConnect";
import { fmt12, toHHMM, toMin } from "@/lib/planner";
import { CALENDAR_NAMES, DAYS, type CalendarLink, type DayIndex, type MealPlan, type ScheduleBlock } from "@/lib/types";

const START = 7 * 60; // calendar view 7am–10pm
const END = 22 * 60;
const PX_PER_MIN = 0.62;

export default function MealsToCalendar({ link, plan, schedule, day }: { link: CalendarLink; plan: MealPlan; schedule: ScheduleBlock[]; day: DayIndex }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const name = CALENDAR_NAMES[link.provider];
  const meals = plan.days.find((d) => d.day === day)?.meals ?? [];
  const weekCount = plan.days.reduce((n, d) => n + d.meals.length, 0);
  const busy = schedule.filter((b) => b.days.includes(day));

  const y = (t: string) => (Math.min(Math.max(toMin(t), START), END) - START) * PX_PER_MIN;
  const h = (a: string, b: string) => Math.max(18, (Math.min(toMin(b), END) - Math.max(toMin(a), START)) * PX_PER_MIN);
  const hours = Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60);

  return (
    <>
      <button type="button" className="btn sm cal-btn" onClick={() => (setOpen(true), setDone(false))}>
        <ProviderMark provider={link.provider} /> Add meals to {name}
      </button>
      {open && (
        <Modal title={`Add meals to ${name}`} onClose={() => setOpen(false)}>
          <div className="demo-flag">Demo preview. Nothing is written to a real calendar.</div>
          <h2 style={{ marginTop: 14 }}>{DAYS[day]} in {name}</h2>
          <p className="muted small">
            Meals go on a separate <b>CampusFuel Meals</b> calendar next to your classes, with the recipe in each event&apos;s notes.
          </p>
          <div className="calview" style={{ height: (END - START) * PX_PER_MIN }}>
            {hours.map((m) => (
              <div key={m} className="cal-hour" style={{ top: (m - START) * PX_PER_MIN }}>
                <span>{fmt12(toHHMM(m)).replace(":00", "")}</span>
              </div>
            ))}
            {busy.map((b) => (
              <div key={b.id} className="cal-ev busy" style={{ top: y(b.start), height: h(b.start, b.end) }}>
                <b>{b.label}</b> {fmt12(b.start)}
              </div>
            ))}
            {meals.map((m, i) => {
              const end = toHHMM(toMin(m.time) + Math.min(30, Math.max(15, m.windowMin || 30)));
              return (
                <div key={i} className="cal-ev meal" style={{ top: y(m.time), height: h(m.time, end) }}>
                  <b>{m.name}</b> {fmt12(m.time)}
                </div>
              );
            })}
          </div>
          {done ? (
            <p className="notice small" style={{ marginTop: 12 }}>
              In the full version, {weekCount} meal events for this week would now be in your {name}, with reminders 10 minutes before each one.
            </p>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
            {!done ? (
              <button type="button" className="btn primary" onClick={() => setDone(true)}>
                Add {weekCount} meals for this week
              </button>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}
