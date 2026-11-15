// Keeps the schedule in step with a connected calendar.
// Imported blocks are matched to calendar events by key: moved events are updated, new repeating
// events are added, deleted ones are removed, and anything the student unchecked stays out.
// Blocks the student typed in themselves are never touched.
import { importFromIcs, type ImportedEvent } from "./googleCalendar";
import type { CalendarProvider, Profile, ScheduleBlock } from "./types";

export const SYNC_EVERY_MS = 15 * 60_000;

export const blockFromEvent = (e: ImportedEvent, provider: CalendarProvider): ScheduleBlock => ({
  id: `cal-${provider}-${e.key}`,
  label: e.label,
  kind: e.kind,
  days: e.days,
  start: e.start,
  end: e.end,
  source: provider,
  calKey: e.key,
});

const sameSlot = (a: ScheduleBlock, b: ScheduleBlock) => a.start === b.start && a.end === b.end && a.days.join() === b.days.join();

export interface Changes {
  added: string[];
  removed: string[];
  moved: string[];
}

export function mergeCalendar(schedule: ScheduleBlock[], events: ImportedEvent[], ignored: Set<string>, provider: CalendarProvider) {
  const imported = schedule.filter((b) => b.source === provider);
  const own = schedule.filter((b) => b.source !== provider);
  const used = new Set<string>();
  const next: ScheduleBlock[] = [];
  for (const e of events) {
    if (ignored.has(e.key)) continue;
    const prev =
      imported.find((b) => !used.has(b.id) && b.calKey === e.key) ??
      imported.find((b) => !used.has(b.id) && !b.calKey && b.label === e.label && b.start === e.start); // imported before keys existed
    if (prev) {
      used.add(prev.id);
      next.push({ ...prev, label: e.label, days: e.days, start: e.start, end: e.end, calKey: e.key }); // keeps the student's chosen kind
    } else if (e.defaultOn) {
      next.push(blockFromEvent(e, provider));
    }
  }

  const gone = imported.filter((b) => !used.has(b.id));
  const fresh = next.filter((b) => !imported.some((o) => o.id === b.id));
  const moved = new Set<string>();
  for (const b of next) {
    const o = imported.find((x) => x.id === b.id);
    if (o && !sameSlot(o, b)) moved.add(b.label);
  }
  // A time change gives the event a new key, so it shows up as removed + added: report it as moved.
  for (const b of fresh) {
    const was = gone.find((g) => g.label === b.label);
    if (was) {
      moved.add(b.label);
      b.kind = was.kind; // keep the student's edits
    }
  }
  const changes: Changes = {
    added: fresh.filter((b) => !moved.has(b.label)).map((b) => b.label),
    removed: gone.filter((b) => !moved.has(b.label)).map((b) => b.label),
    moved: [...moved],
  };
  return { schedule: [...own, ...next], changes };
}

export const hasChanges = (c: Changes) => c.added.length + c.removed.length + c.moved.length > 0;

/** Re-reads the calendar's private link and returns the updated profile (null if not link-connected). */
export async function syncCalendar(p: Profile): Promise<{ profile: Profile; changes: Changes } | null> {
  const link = p.calendar;
  if (!link?.icsUrl) return null;
  const { events } = await importFromIcs(link.icsUrl);
  const { schedule, changes } = mergeCalendar(p.schedule, events, new Set(link.ignored ?? []), link.provider);
  return { profile: { ...p, schedule, calendar: { ...link, lastSyncedAt: new Date().toISOString() } }, changes };
}
