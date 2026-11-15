// Full iCalendar reader for calendar links and uploaded exports (used by Google Calendar sync).
// Expands DAILY/WEEKLY repeats (INTERVAL, BYDAY, UNTIL, COUNT), honours EXDATE and moved/cancelled
// occurrences (RECURRENCE-ID), and converts TZID wall-clock times with Intl so daylight saving is right.
// (lib/ics.ts is the simpler reader behind the onboarding "upload a calendar file" box.)

export interface Occurrence {
  uid: string;
  title: string;
  start: string; // ISO (UTC)
  end: string;
  recurring: boolean;
  transparent: boolean; // marked "free"
}

// ---------- parsing ----------

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=a;PARAM2="b:c":VALUE (colon inside quotes doesn't end the params)
  let i = 0;
  let inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ":" && !inQ) break;
  }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

const unescapeText = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

type Wall = { y: number; mo: number; d: number; h: number; mi: number; s: number };
type Stamp = { wall: Wall; tz: string; allDay: boolean };

function parseStamp(p: Prop, defaultTz: string): Stamp | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const wall = { y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
  const allDay = p.params.VALUE === "DATE" || !m[4];
  const tz = m[7] ? "UTC" : validTz(p.params.TZID) ?? defaultTz;
  return { wall, tz, allDay };
}

const tzOk = new Map<string, boolean>();
function validTz(tz?: string): string | undefined {
  if (!tz) return undefined;
  if (!tzOk.has(tz)) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      tzOk.set(tz, true);
    } catch {
      tzOk.set(tz, false);
    }
  }
  return tzOk.get(tz) ? tz : undefined;
}

// ---------- time zones ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function tzOffsetMs(utcMs: number, tz: string): number {
  if (tz === "UTC") return 0;
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time in `tz` → epoch ms. */
function toUtc(w: Wall, tz: string): number {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}

// Calendar-day arithmetic on wall dates (time zone independent).
const dayNum = (w: Wall) => Math.floor(Date.UTC(w.y, w.mo - 1, w.d) / 86_400_000);
function fromDayNum(n: number, t: Wall): Wall {
  const d = new Date(n * 86_400_000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: t.h, mi: t.mi, s: t.s };
}
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// ---------- expansion ----------

interface VEvent {
  uid: string;
  title: string;
  start: Stamp;
  durMs: number;
  rrule?: Record<string, string>;
  exdates: number[];
  recurrenceId?: number;
  cancelled: boolean;
  transparent: boolean;
}

function parseDuration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const ms = ((+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0)) * 1000;
  return m[1] === "-" ? -ms : ms;
}

function readEvents(text: string, defaultTz: string): { name?: string; events: VEvent[] } {
  let name: string | undefined;
  const events: VEvent[] = [];
  let cur: Prop[] | null = null;
  let depth = 0; // skip nested components such as VALARM
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = [];
      depth = 0;
      continue;
    }
    if (!cur) {
      if (line.startsWith("X-WR-CALNAME:")) name = unescapeText(line.slice(13));
      continue;
    }
    if (line.startsWith("BEGIN:")) depth++;
    else if (line.startsWith("END:") && depth > 0) depth--;
    else if (line === "END:VEVENT") {
      const ev = buildEvent(cur, defaultTz);
      if (ev) events.push(ev);
      cur = null;
    } else if (depth === 0) {
      const p = parseLine(line);
      if (p) cur.push(p);
    }
  }
  return { name, events };
}

function buildEvent(props: Prop[], defaultTz: string): VEvent | null {
  const get = (n: string) => props.find((p) => p.name === n);
  const ds = get("DTSTART");
  const start = ds && parseStamp(ds, defaultTz);
  if (!start) return null;
  const startMs = toUtc(start.wall, start.tz);
  const de = get("DTEND");
  const end = de && parseStamp(de, defaultTz);
  const dur = get("DURATION");
  const durMs = end ? toUtc(end.wall, end.tz) - startMs : dur ? parseDuration(dur.value) : start.allDay ? 86_400_000 : 0;
  const rr = get("RRULE");
  const rrule = rr ? Object.fromEntries(rr.value.split(";").map((kv) => kv.split("=") as [string, string])) : undefined;
  const exdates: number[] = [];
  for (const p of props.filter((x) => x.name === "EXDATE"))
    for (const v of p.value.split(",")) {
      const s = parseStamp({ ...p, value: v }, defaultTz);
      if (s) exdates.push(toUtc(s.wall, s.tz));
    }
  const rid = get("RECURRENCE-ID");
  const ridStamp = rid && parseStamp(rid, defaultTz);
  return {
    uid: get("UID")?.value ?? `${startMs}`,
    title: unescapeText(get("SUMMARY")?.value ?? "Busy") || "Busy",
    start,
    durMs: Math.max(0, durMs),
    rrule,
    exdates,
    recurrenceId: ridStamp ? toUtc(ridStamp.wall, ridStamp.tz) : undefined,
    cancelled: get("STATUS")?.value.toUpperCase() === "CANCELLED",
    transparent: get("TRANSP")?.value.toUpperCase() === "TRANSPARENT",
  };
}

/** Start times (epoch ms) of a repeating event that fall in [from, to). */
function expand(ev: VEvent, from: number, to: number): number[] {
  const first = toUtc(ev.start.wall, ev.start.tz);
  const r = ev.rrule;
  if (!r) return first + ev.durMs > from && first < to ? [first] : [];
  const freq = r.FREQ;
  if (freq !== "WEEKLY" && freq !== "DAILY") {
    // Monthly/yearly repeats rarely matter for a weekly schedule; keep only a first occurrence in range.
    return first + ev.durMs > from && first < to ? [first] : [];
  }
  const interval = Math.max(1, +(r.INTERVAL ?? 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  let until = Infinity;
  if (r.UNTIL) {
    const s = parseStamp({ name: "UNTIL", params: {}, value: r.UNTIL }, ev.start.tz);
    if (s) until = s.allDay ? toUtc({ ...s.wall, h: 23, mi: 59, s: 59 }, ev.start.tz) : toUtc(s.wall, s.tz);
  }
  const startDay = dayNum(ev.start.wall);
  const byday =
    freq === "WEEKLY"
      ? (r.BYDAY ? r.BYDAY.split(",").map((x) => WD.indexOf(x.replace(/^[+-]?\d+/, ""))).filter((x) => x >= 0) : [new Date(startDay * 86_400_000).getUTCDay()])
      : null;
  const exd = new Set(ev.exdates);
  const out: number[] = [];
  let n = 0;
  if (until < from) return out;
  const fastForward = count === Infinity ? Math.floor(from / 86_400_000) - 2 : -Infinity; // no need to count old ones
  // Week of DTSTART, aligned to Monday (WKST default is MO).
  const weekStart = startDay - ((new Date(startDay * 86_400_000).getUTCDay() + 6) % 7);
  for (let step = 0; step < 5000; step++) {
    const days = byday
      ? byday.map((wd) => weekStart + step * 7 * interval + ((wd + 6) % 7)).sort((a, b) => a - b)
      : [startDay + step * interval];
    for (const day of days) {
      if (day < startDay || day < fastForward) continue;
      const t = toUtc(fromDayNum(day, ev.start.wall), ev.start.tz);
      if (t > until || n >= count || t >= to) return out;
      n++;
      if (!exd.has(t) && t + ev.durMs > from) out.push(t);
    }
  }
  return out;
}

/** Expands iCalendar text into concrete occurrences between `from` and `to`. Runs in the browser or on the server. */
export function parseIcs(text: string, from: Date, to: Date, tz: string): { name?: string; occurrences: Occurrence[] } {
  const defaultTz = validTz(tz) ?? "UTC";
  const { name, events } = readEvents(text, defaultTz);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  // Moved or cancelled single occurrences replace the matching slot in their series.
  const overrides = new Map<string, Set<number>>();
  for (const e of events)
    if (e.recurrenceId != null) {
      const set = overrides.get(e.uid) ?? new Set<number>();
      set.add(e.recurrenceId);
      overrides.set(e.uid, set);
    }
  const series = new Set(events.filter((e) => e.rrule).map((e) => e.uid));

  const occurrences: Occurrence[] = [];
  for (const e of events) {
    if (e.cancelled || e.start.allDay) continue;
    const skip = e.recurrenceId == null ? overrides.get(e.uid) : undefined;
    for (const t of expand({ ...e, rrule: e.recurrenceId == null ? e.rrule : undefined }, fromMs, toMs)) {
      if (skip?.has(t)) continue;
      occurrences.push({
        uid: e.uid,
        title: e.title,
        start: new Date(t).toISOString(),
        end: new Date(t + e.durMs).toISOString(),
        recurring: series.has(e.uid),
        transparent: e.transparent,
      });
    }
  }
  occurrences.sort((a, b) => a.start.localeCompare(b.start));
  return { name, occurrences };
}
