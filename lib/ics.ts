// Reads an exported calendar file (.ics from Google Calendar, Outlook, Canvas, Apple Calendar)
// and turns its weekly repeating events into schedule blocks. Runs entirely in the browser.

import type { DayIndex, ScheduleBlock } from "./types";

export interface IcsEvent {
  key: string;
  label: string;
  kind: ScheduleBlock["kind"];
  days: DayIndex[];
  start: string; // HH:MM local
  end: string;
  recurring: boolean;
  note?: string;
}

const BYDAY: Record<string, DayIndex> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

/** Undo RFC 5545 line folding and split into lines. */
function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string) {
  return v.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

/** Parse a DTSTART/DTEND value into a JS Date in the viewer's local time. */
function parseDate(value: string, params: string): { date: Date; allDay: boolean } | null {
  if (/VALUE=DATE(?!-TIME)/.test(params) || /^\d{8}$/.test(value)) return null; // all-day events aren't busy blocks
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  // UTC times convert to local; times with a TZID are taken as written (the student's own time zone).
  const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return { date, allDay: false };
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const dayIdx = (d: Date) => ((d.getDay() + 6) % 7) as DayIndex;

export function guessKind(summary: string): ScheduleBlock["kind"] {
  const s = summary.toLowerCase();
  if (/\b[a-z]{2,4}\s?-?\d{3}[a-z]?\b/i.test(summary) || /lecture|lab\b|class|seminar|discussion|recitation|section|tutorial/.test(s)) return "class";
  if (/shift|work\b|job|intern/.test(s)) return "work";
  if (/practice|training|game\b|scrimmage|team/.test(s)) return "practice";
  if (/gym|workout|lift|run\b|yoga|spin|swim|climb/.test(s)) return "workout";
  if (/study|library|office hours|tutoring|homework/.test(s)) return "study";
  return "other";
}

/**
 * Weekly repeating events become blocks on those weekdays. One-off events in the coming week are
 * listed too (unchecked by default) since they don't repeat.
 */
export function parseIcs(text: string, now = new Date()): IcsEvent[] {
  const lines = unfold(text);
  const out: IcsEvent[] = [];
  let cur: Record<string, { v: string; p: string }> | null = null;
  const weekAhead = new Date(now.getTime() + 7 * 864e5);

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const ev = cur;
      cur = null;
      if (!ev.DTSTART || !ev.SUMMARY) continue;
      if (ev.STATUS?.v === "CANCELLED") continue;
      const start = parseDate(ev.DTSTART.v, ev.DTSTART.p);
      if (!start) continue;
      let end = ev.DTEND ? parseDate(ev.DTEND.v, ev.DTEND.p)?.date : null;
      if (!end && ev.DURATION) {
        const m = ev.DURATION.v.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (m) end = new Date(start.date.getTime() + ((+(m[1] || 0)) * 60 + +(m[2] || 0)) * 60000);
      }
      if (!end || end <= start.date) continue;
      const label = unescape(ev.SUMMARY.v);
      const rrule = ev.RRULE?.v ?? "";
      const weekly = /FREQ=WEEKLY/.test(rrule) || (/FREQ=DAILY/.test(rrule) && /BYDAY=/.test(rrule));
      if (weekly) {
        const until = rrule.match(/UNTIL=(\d{8})/)?.[1];
        if (until && until < now.toISOString().slice(0, 10).replace(/-/g, "")) continue; // finished last term
        const byday = rrule.match(/BYDAY=([A-Z,0-9-]+)/)?.[1];
        const days = byday
          ? (byday
              .split(",")
              .map((d) => BYDAY[d.replace(/[-0-9]/g, "")])
              .filter((d) => d != null) as DayIndex[])
          : [dayIdx(start.date)];
        out.push({ key: `${label}|${hhmm(start.date)}|${days.join("")}`, label, kind: guessKind(label), days: [...new Set(days)].sort() as DayIndex[], start: hhmm(start.date), end: hhmm(end), recurring: true });
      } else if (start.date >= now && start.date <= weekAhead) {
        out.push({
          key: `${label}|${start.date.toISOString()}`,
          label,
          kind: guessKind(label),
          days: [dayIdx(start.date)],
          start: hhmm(start.date),
          end: hhmm(end),
          recurring: false,
          note: `One-time on ${start.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`,
        });
      }
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i);
      const [name, ...params] = head.split(";");
      cur[name.toUpperCase()] = { v: line.slice(i + 1).trim(), p: params.join(";") };
    }
  }
  // merge duplicates (same title/time/days, e.g. exceptions exported separately)
  const seen = new Map<string, IcsEvent>();
  for (const e of out) if (!seen.has(e.key)) seen.set(e.key, e);
  return [...seen.values()].sort((a, b) => Number(b.recurring) - Number(a.recurring) || a.days[0] - b.days[0] || a.start.localeCompare(b.start));
}
