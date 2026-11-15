// Real Google Calendar import, entirely in the browser.
// Uses Google Identity Services (token model) to get a short-lived, read-only access token,
// then reads the next two weeks of events from the Calendar API and turns repeating events
// into weekly ScheduleBlocks. Nothing is stored on a server; the token lives only in memory.
import type { DayIndex, ScheduleBlock } from "./types";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const googleConfigured = () => GOOGLE_CLIENT_ID.length > 0;

export const SCOPES = {
  read: "https://www.googleapis.com/auth/calendar.readonly", // import schedule, check busy times
  write: "https://www.googleapis.com/auth/calendar.events", // add the meal-prep event the user picks
} as const;
const API = "https://www.googleapis.com/calendar/v3";
const tokens = new Map<string, { token: string; exp: number }>(); // in memory only

export type ImportedEvent = Omit<ScheduleBlock, "id"> & {
  key: string;
  note?: string;
  defaultOn: boolean;
};

// ---- Google Identity Services ----

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Load the sign-in script ahead of the click so the popup opens inside the user gesture. */
export function preloadGoogle() {
  if (googleConfigured()) loadGis().catch(() => {});
}

/** Opens Google's consent popup (or reuses a prior grant silently) and resolves with an access token. */
export async function getGoogleToken(scope: string = SCOPES.read): Promise<string> {
  if (!googleConfigured()) throw new Error("Google Calendar isn't set up yet (missing NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
  const cached = tokens.get(scope);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || "Google sign-in failed."));
        tokens.set(scope, { token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(new Error(e.type === "popup_closed" ? "Sign-in window was closed." : e.type === "popup_failed_to_open" ? "Allow pop-ups for this site to connect Google." : e.message || "Google sign-in failed.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

// ---- Calendar API ----

async function gfetch<T>(token: string, path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
  const url = `${API}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (res.status === 401) {
      tokens.clear();
      throw new Error("Google sign-in expired. Try again.");
    }
    if (res.status === 403) throw new Error("Google denied calendar access. Make sure you checked the calendar permission.");
    throw new Error(`Google Calendar error (${res.status}).`);
  }
  return res.json() as Promise<T>;
}
const gget = <T,>(token: string, path: string, params: Record<string, string> = {}) => gfetch<T>(token, path, params);

/** Calendars that count toward "busy": primary plus the ones shown in Google Calendar. */
async function busyCalendars(token: string) {
  const list = await gget<{ items?: CalListEntry[] }>(token, "/users/me/calendarList", { minAccessRole: "reader" });
  const cals = (list.items ?? []).filter(
    (c) => (c.primary || c.selected) && !c.hidden && !c.id.includes("#holiday") && !c.id.includes("#contacts") && c.summary !== "CampusFuel Meals",
  );
  return { cals, account: list.items?.find((c) => c.primary)?.id ?? "Google account" };
}

/** Real busy times (any event, including one-offs like exams) between two dates. */
export async function fetchBusy(token: string, from: Date, to: Date): Promise<{ start: number; end: number }[]> {
  const { cals } = await busyCalendars(token);
  const r = await gfetch<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(token, "/freeBusy", {}, {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    items: cals.slice(0, 50).map((c) => ({ id: c.id })),
  });
  return Object.values(r.calendars ?? {}).flatMap((c) => (c.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) })));
}

export interface NewEvent {
  title: string;
  details: string;
  start: Date;
  end: Date;
}

/** Adds an event to the user's main Google Calendar with a 30-minute reminder. Returns its link. */
export async function addGoogleEvent(token: string, ev: NewEvent): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await gfetch<{ htmlLink?: string }>(token, "/calendars/primary/events", {}, {
    summary: ev.title,
    description: ev.details,
    start: { dateTime: ev.start.toISOString(), timeZone },
    end: { dateTime: ev.end.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
    source: { title: "CampusFuel", url: window.location.origin },
  });
  return r.htmlLink ?? "https://calendar.google.com/";
}

/** No-setup fallback: a Google Calendar link that opens a pre-filled "new event" page. */
export function googleTemplateUrl(ev: NewEvent): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    details: ev.details,
    dates: `${z(ev.start)}/${z(ev.end)}`,
  })}`;
}

interface CalListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  hidden?: boolean;
}
interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  recurringEventId?: string;
  transparency?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayIdx = (d: Date) => ((d.getDay() + 6) % 7) as DayIndex; // Mon = 0

function guessKind(title: string): ScheduleBlock["kind"] {
  const t = title.toLowerCase();
  if (/\b[a-z]{2,5}\s?-?\d{3}[a-z]?\b/i.test(title) || /\b(lecture|class|lab|seminar|recitation|discussion|section|tutorial|office hours)\b/.test(t)) return "class";
  if (/\b(shift|work|job|internship)\b/.test(t)) return "work";
  if (/\b(practice|training|lift|lifting|workout|gym|game|match|scrimmage|rehearsal)\b/.test(t)) return "practice";
  if (/\b(study|homework|library|review session)\b/.test(t)) return "study";
  return "other";
}
const MEAL = /\b(breakfast|brunch|lunch|dinner|supper|meal|coffee)\b/i;

/** Reads the signed-in user's calendars and returns their account email plus importable weekly events. */
export async function fetchGoogleSchedule(token: string): Promise<{ account: string; events: ImportedEvent[] }> {
  const { cals, account } = await busyCalendars(token);

  // Look at the next 14 days so weekly events show up at least twice.
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);

  const perCal = await Promise.all(
    cals.map((c) =>
      gget<{ items?: GEvent[] }>(token, `/calendars/${encodeURIComponent(c.id)}/events`, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "500",
      })
        .then((r) => r.items ?? [])
        .catch(() => [] as GEvent[]), // one unreadable calendar shouldn't sink the import
    ),
  );

  const occ: Occ[] = [];
  for (const e of perCal.flat()) {
    if (e.status === "cancelled" || !e.start?.dateTime || !e.end?.dateTime) continue; // skip all-day events
    if (e.transparency === "transparent") continue; // marked "free"
    if (e.eventType && e.eventType !== "default") continue; // out-of-office, focus time, working location
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    occ.push({
      series: e.recurringEventId,
      title: (e.summary || "Busy").trim(),
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
    });
  }
  return { account, events: groupOccurrences(occ) };
}

// ---- shared: concrete occurrences → weekly schedule suggestions ----

export interface Occ {
  series?: string; // same value for every occurrence of a repeating event
  title: string;
  start: Date;
  end: Date;
}

/** Groups occurrences of the same weekly event (by series, else title + time) into importable blocks. */
export function groupOccurrences(occ: Occ[]): ImportedEvent[] {
  type Group = { title: string; start: string; end: string; days: Set<DayIndex>; recurring: boolean; count: number };
  const groups = new Map<string, Group>();
  for (const o of occ) {
    const s = o.start;
    const en = o.end;
    const title = o.title || "Busy";
    const start = hhmm(s);
    // Clamp events that run past midnight to the end of their start day.
    const end = en.toDateString() === s.toDateString() ? hhmm(en) : "23:59";
    if (end <= start) continue;
    const key = `${o.series ?? title}|${start}|${end}`;
    const g = groups.get(key) ?? { title, start, end, days: new Set<DayIndex>(), recurring: !!o.series, count: 0 };
    g.days.add(dayIdx(s));
    g.count++;
    g.recurring ||= !!o.series;
    groups.set(key, g);
  }

  const events: ImportedEvent[] = [...groups.entries()].map(([key, g]) => {
    const weekly = g.recurring || g.count > 1;
    const meal = MEAL.test(g.title);
    return {
      key,
      label: g.title,
      kind: guessKind(g.title),
      days: [...g.days].sort((a, b) => a - b),
      start: g.start,
      end: g.end,
      source: "google" as const,
      defaultOn: weekly && !meal,
      note: meal
        ? "Looks like a meal, so we'll plan food here instead of blocking it."
        : !weekly
          ? "One-time event. Only repeating events are added to your weekly schedule by default."
          : undefined,
    };
  });

  // Weekly events first, then by first day and start time.
  events.sort((a, b) => Number(b.defaultOn) - Number(a.defaultOn) || a.days[0] - b.days[0] || a.start.localeCompare(b.start));
  return events;
}

// ---- no-setup path: Google Calendar's "Secret address in iCal format" ----

interface FeedOccurrence {
  uid: string;
  title: string;
  start: string;
  end: string;
  recurring: boolean;
  transparent: boolean;
}

async function readIcs(url: string, from: Date, to: Date): Promise<{ account: string; occurrences: FeedOccurrence[] }> {
  const res = await fetch("/api/ics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, from: from.toISOString(), to: to.toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
  const data = await res.json().catch(() => ({ error: "Couldn't read that calendar." }));
  if (!res.ok) throw new Error(data.error || "Couldn't read that calendar.");
  return data;
}

/** Imports weekly events from a private iCal link (next two weeks). */
export async function importFromIcs(url: string): Promise<{ account: string; events: ImportedEvent[] }> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);
  const r = await readIcs(url, from, to);
  const occ = r.occurrences
    .filter((o) => !o.transparent)
    .map((o) => ({ series: o.recurring ? o.uid : undefined, title: o.title, start: new Date(o.start), end: new Date(o.end) }));
  return { account: r.account, events: groupOccurrences(occ) };
}

// ---- works even when the private link is turned off: upload Google's export (.zip or .ics) ----

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Pulls the .ics files out of a .zip using the browser's built-in decompression. */
async function icsFromZip(buf: ArrayBuffer): Promise<string[]> {
  const b = new Uint8Array(buf);
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("That .zip file looks damaged. Try exporting again.");
  const entries = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: string[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < entries && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.ics$/i.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = b.subarray(start, start + size);
    if (method === 0) out.push(dec.decode(raw));
    else if (method === 8) out.push(dec.decode(await inflate(raw)));
  }
  return out;
}

/** Reads uploaded calendar files on this device (nothing is sent anywhere). */
export async function importFromFiles(files: File[]): Promise<{ account: string; events: ImportedEvent[]; busy: [number, number][] }> {
  const texts: string[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) texts.push(...(await icsFromZip(await f.arrayBuffer())));
    else texts.push(await f.text());
  }
  const cals = texts.filter((t) => t.includes("BEGIN:VCALENDAR"));
  if (!cals.length) throw new Error("No calendar found. Upload the .zip (or .ics) file from Google Calendar's Export.");

  const { parseIcs } = await import("./icalFeed");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const twoWeeks = new Date(from);
  twoWeeks.setDate(twoWeeks.getDate() + 14);
  const twoMonths = new Date(from);
  twoMonths.setDate(twoMonths.getDate() + 60);

  const names: string[] = [];
  const occ: Occ[] = [];
  const busy: [number, number][] = [];
  for (const text of cals) {
    const r = parseIcs(text, from, twoMonths, tz);
    if (r.name) names.push(r.name);
    for (const o of r.occurrences) {
      if (o.transparent) continue;
      const s = Date.parse(o.start);
      const e = Date.parse(o.end);
      busy.push([s, e]); // kept so prep-time suggestions avoid one-off events too
      if (s < twoWeeks.getTime()) occ.push({ series: o.recurring ? o.uid : undefined, title: o.title, start: new Date(s), end: new Date(e) });
    }
  }
  const account = names.find((n) => n.includes("@")) ?? names[0] ?? files[0]?.name ?? "Uploaded calendar";
  return { account: names.length > 1 ? `${account} + ${names.length - 1} more` : account, events: groupOccurrences(occ), busy };
}

/** Busy times (including one-off events) from a private iCal link. */
export async function icsBusy(url: string, from: Date, to: Date): Promise<{ start: number; end: number }[]> {
  const r = await readIcs(url, from, to);
  return r.occurrences.filter((o) => !o.transparent).map((o) => ({ start: Date.parse(o.start), end: Date.parse(o.end) }));
}
