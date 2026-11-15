"use client";
// Pick a meal-prep time that fits your schedule, then put it on your Google Calendar.
// Suggestions come from your free windows (which include imported calendar events). When Google is
// set up, they are also checked against your live calendar, so one-off events like exams count too.
import { useMemo, useState } from "react";
import { Modal, ProviderMark } from "./CalendarConnect";
import { fmt12, freeWindows, toHHMM, toMin } from "@/lib/planner";
import { SCOPES, addGoogleEvent, fetchBusy, getGoogleToken, googleConfigured, googleTemplateUrl, icsBusy } from "@/lib/googleCalendar";
import type { DayIndex, MealPlan, Profile } from "@/lib/types";

type Busy = { start: number; end: number };
interface Slot {
  key: string;
  start: Date;
  end: Date;
  score: number;
  why: string;
}

const DURATIONS = [45, 60, 90, 120];
const BUFFER = 15; // minutes of breathing room after/before other events
const dayIdx = (d: Date) => ((d.getDay() + 6) % 7) as DayIndex;
const at = (date: Date, min: number) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(min);
  return d;
};
const dayLabel = (d: Date) => {
  const today = new Date();
  const tmr = new Date();
  tmr.setDate(tmr.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tmr.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const clock = (d: Date) => fmt12(toHHMM(d.getHours() * 60 + d.getMinutes()));
const overlaps = (s: Date, e: Date, busy: Busy[]) => busy.some((b) => b.start < e.getTime() && b.end > s.getTime());
const next7 = () =>
  Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

/** Ranks prep slots over the next week: weekends and afternoons first, never over busy time. */
function suggest(profile: Profile, duration: number, live: Busy[]): Slot[] {
  const soonest = Date.now() + 30 * 60_000;
  const all: Slot[] = [];
  for (const date of next7()) {
    const d = dayIdx(date);
    for (const w of freeWindows(profile, d)) {
      const ws = toMin(w.start);
      const we = ws + w.minutes;
      const first = Math.ceil((ws + (ws === toMin(d >= 5 ? profile.wakeWeekend : profile.wakeWeekday) ? 30 : BUFFER)) / 15) * 15;
      const last = Math.min(we - BUFFER, 22 * 60) - duration;
      for (let m = Math.max(first, 8 * 60); m <= last; m += 30) {
        const start = at(date, m);
        const end = new Date(start.getTime() + duration * 60_000);
        if (start.getTime() < soonest || overlaps(start, end, live)) continue;
        const weekend = d >= 5;
        let score = weekend ? 3 : 0;
        if (d === 6) score += 0.5; // Sunday sets up the school week
        if (m >= 13 * 60 && m < 17 * 60) score += 2;
        else if (m >= 10 * 60 && m < 13 * 60) score += 1.5;
        else if (m >= 17 * 60 && m < 19.5 * 60) score += 1;
        if (w.minutes >= duration + 120) score += 0.5; // not squeezed
        score -= (start.getTime() - Date.now()) / 86_400_000 / 10; // slight preference for sooner
        const why = weekend ? "Weekend, long free stretch" : w.minutes >= duration + 60 ? "Free block between classes" : "Fits right in your break";
        all.push({ key: start.toISOString(), start, end, score, why });
      }
    }
  }
  // Best two per day, then the six best overall, shown in time order.
  const perDay = new Map<string, Slot[]>();
  for (const s of all.sort((a, b) => b.score - a.score)) {
    const k = s.start.toDateString();
    const list = perDay.get(k) ?? [];
    if (list.length < 2 && list.every((x) => Math.abs(x.start.getTime() - s.start.getTime()) >= 2 * 3600_000)) list.push(s);
    perDay.set(k, list);
  }
  return [...perDay.values()]
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export default function PrepScheduler({ profile, plan, onPlan }: { profile: Profile; plan: MealPlan; onPlan: (p: MealPlan) => void }) {
  const prep = plan.prepSession;
  const google = googleConfigured();
  const feed = profile.calendar?.provider === "google" ? profile.calendar.icsUrl : undefined;
  const canCheck = !!feed || !!profile.calendar?.busy || (google && profile.calendar?.provider === "google");
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(prep?.durationMin ?? 90);
  const uploaded = profile.calendar?.busy; // from an uploaded export, no network needed
  const [live, setLive] = useState<Busy[] | null>(uploaded ? uploaded.map(([start, end]) => ({ start, end })) : null);
  const [checking, setChecking] = useState(false);
  const [picked, setPicked] = useState<string>("");
  const [customDay, setCustomDay] = useState(0);
  const [customTime, setCustomTime] = useState("15:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const slots = useMemo(() => suggest(profile, duration, live ?? []), [profile, duration, live]);
  const best = slots.reduce<Slot | null>((b, s) => (!b || s.score > b.score ? s : b), null);
  const days = useMemo(next7, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const custom = useMemo(() => {
    const start = at(days[customDay], toMin(customTime));
    const end = new Date(start.getTime() + duration * 60_000);
    const d = dayIdx(start);
    const sMin = toMin(customTime);
    const clash =
      profile.schedule.find((b) => b.days.includes(d) && toMin(b.start) < sMin + duration && toMin(b.end) > sMin)?.label ??
      (live && overlaps(start, end, live) ? "something on your Google Calendar" : "");
    return { key: "custom", start, end, score: 0, why: clash ? `Overlaps ${clash}` : "Your pick", clash: !!clash };
  }, [days, customDay, customTime, duration, profile.schedule, live]);

  const chosen: (Slot & { clash?: boolean }) | undefined = picked === "custom" ? custom : slots.find((s) => s.key === picked);

  const checkLive = async () => {
    setChecking(true);
    setError("");
    try {
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + 8);
      setLive(feed ? await icsBusy(feed, from, to) : await fetchBusy(await getGoogleToken(SCOPES.read), from, to));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your Google Calendar.");
    } finally {
      setChecking(false);
    }
  };

  const openPicker = () => {
    setOpen(true);
    setPicked("");
    setError("");
    // Opened by a click, so Google's popup (if needed) is allowed.
    if (canCheck && !live) void checkLive();
  };

  const details = () =>
    [
      "Meal prep for the week, planned by CampusFuel.",
      "",
      ...(prep?.tasks ?? ["Batch-cook proteins and grains", "Portion snacks into grab bags", "Wash & chop produce for the week"]).map((t) => `• ${t}`),
    ].join("\n");

  const save = (slot: Slot, eventLink?: string) => {
    onPlan({
      ...plan,
      prepSession: {
        tasks: prep?.tasks ?? ["Batch-cook proteins and grains", "Portion snacks into grab bags", "Wash & chop produce for the week"],
        day: dayIdx(slot.start),
        time: toHHMM(slot.start.getHours() * 60 + slot.start.getMinutes()),
        durationMin: duration,
        scheduledAt: slot.start.toISOString(),
        eventLink,
      },
    });
  };

  const addToCalendar = async () => {
    if (!chosen) return;
    const ev = { title: "🧑‍🍳 Meal prep", details: details(), start: chosen.start, end: chosen.end };
    if (!google) {
      // No Google app set up: open Google's pre-filled event page instead.
      window.open(googleTemplateUrl(ev), "_blank", "noopener");
      save(chosen, "added-via-link");
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getGoogleToken(SCOPES.write);
      save(chosen, await addGoogleEvent(token, ev));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the event.");
    } finally {
      setSaving(false);
    }
  };

  const when = prep?.scheduledAt ? new Date(prep.scheduledAt) : null;
  const upcoming = when && when.getTime() > Date.now() - 3 * 3600_000;

  return (
    <div className="card prep-card">
      <div className="row between" style={{ alignItems: "center" }}>
        <div>
          <b>🧑‍🍳 Meal prep</b>
          <div className="muted small">
            {upcoming && when ? (
              <>
                {dayLabel(when)} · {clock(when)} · {prep!.durationMin} min
                {prep?.eventLink?.startsWith("http") ? (
                  <>
                    {" · "}
                    <a href={prep.eventLink} target="_blank" rel="noreferrer">
                      ✓ On your Google Calendar
                    </a>
                  </>
                ) : prep?.eventLink ? (
                  " · ✓ Sent to Google Calendar"
                ) : null}
              </>
            ) : (
              "Pick a time to batch-cook so busy days are covered."
            )}
          </div>
        </div>
        <button type="button" className={`btn sm ${upcoming ? "" : "primary"}`} onClick={openPicker}>
          {upcoming ? "Change time" : "Pick a prep time"}
        </button>
      </div>

      {open && (
        <Modal title="Pick a meal prep time" onClose={() => setOpen(false)}>
          <h2 style={{ marginTop: 0 }}>When should you meal prep?</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            These times fit around your classes, work and practices{live ? " and everything on your Google Calendar" : ""}.
          </p>

          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            <span className="small" style={{ fontWeight: 600 }}>How long?</span>
            {DURATIONS.map((m) => (
              <button key={m} type="button" className={`chip ${duration === m ? "on" : ""}`} onClick={() => setDuration(m)}>
                {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`.replace("1.5 hrs", "1½ hrs")}
              </button>
            ))}
          </div>

          {canCheck ? (
            <p className="small" style={{ margin: "0 0 8px" }}>
              <ProviderMark provider="google" />{" "}
              {checking ? (
                <>
                  <span className="spinner" /> Checking your Google Calendar…
                </>
              ) : live ? (
                feed ? "Checked against your live Google Calendar." : "Checked against your Google Calendar."
              ) : (
                <button type="button" className="btn ghost sm" style={{ padding: 0 }} onClick={checkLive}>
                  Check against my live Google Calendar
                </button>
              )}
            </p>
          ) : null}

          {slots.length ? (
            <div className="slot-list" role="radiogroup" aria-label="Suggested prep times">
              {slots.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={picked === s.key}
                  className={`slot ${picked === s.key ? "on" : ""}`}
                  onClick={() => setPicked(s.key)}
                >
                  <span>
                    <b>{dayLabel(s.start)}</b> · {clock(s.start)}–{clock(s.end)}
                    <span className="muted small" style={{ display: "block" }}>
                      {s.why}
                    </span>
                  </span>
                  {s === best ? <span className="tag">Best fit</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="notice small">No open {duration}-minute block this week. Try a shorter session or pick your own time below.</p>
          )}

          <div className={`slot ${picked === "custom" ? "on" : ""}`} style={{ marginTop: 8, cursor: "default" }} onClick={() => setPicked("custom")}>
            <span style={{ flex: 1 }}>
              <b>Choose my own time</b>
              <span className="row" style={{ gap: 6, marginTop: 6 }}>
                <select aria-label="Day" value={customDay} onChange={(e) => (setCustomDay(Number(e.target.value)), setPicked("custom"))} style={{ width: "auto" }}>
                  {days.map((d, i) => (
                    <option key={i} value={i}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  aria-label="Start time"
                  value={customTime}
                  step={900}
                  onChange={(e) => (setCustomTime(e.target.value || "15:00"), setPicked("custom"))}
                  style={{ width: "auto" }}
                />
              </span>
              {picked === "custom" ? (
                <span className="small" style={{ display: "block", marginTop: 4, color: custom.clash ? "#c0392b" : undefined }}>
                  {custom.clash ? `⚠ ${custom.why}` : `✓ Free · ${clock(custom.start)}–${clock(custom.end)}`}
                </span>
              ) : null}
            </span>
          </div>

          {error ? (
            <p className="small" role="alert" style={{ color: "#c0392b" }}>
              {error}
            </p>
          ) : null}
          {!google ? (
            <p className="muted small">Google Calendar will open in a new tab with the event filled in. Click Save there.</p>
          ) : null}

          <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => chosen && (save(chosen), setOpen(false))} disabled={!chosen}>
              Just save the time
            </button>
            <button type="button" className="btn primary cal-btn" onClick={addToCalendar} disabled={!chosen || saving}>
              {saving ? <span className="spinner" /> : <ProviderMark provider="google" />} Add to Google Calendar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
