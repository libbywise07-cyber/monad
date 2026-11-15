// Server side of calendar links: validate a pasted private iCal address and download it.
import { parseIcs, type Occurrence } from "../icalFeed";

export const ALLOWED_HOSTS = ["calendar.google.com", "outlook.office365.com", "outlook.live.com"];

/** Normalises a pasted feed link and rejects anything that isn't a known calendar host. */
export function checkFeedUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new Error("That doesn't look like a link. Copy the whole address from Google Calendar settings.");
  }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname))
    throw new Error("Paste the iCal address from Google Calendar (it starts with https://calendar.google.com/calendar/ical/).");
  if (u.hostname === "calendar.google.com" && !/\/calendar\/ical\/.+\.ics$/.test(u.pathname))
    throw new Error("Use the address that ends in .ics, under “Integrate calendar” in Google Calendar settings.");
  return u;
}

/** Downloads a calendar feed and expands it into occurrences between `from` and `to`. */
export async function readFeed(url: URL, from: Date, to: Date, tz: string): Promise<{ name?: string; occurrences: Occurrence[] }> {
  const res = await fetch(url, { headers: { Accept: "text/calendar" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!ALLOWED_HOSTS.includes(new URL(res.url).hostname)) throw new Error("Calendar link redirected somewhere unexpected.");
  if (!res.ok) console.warn(`[ics] ${url.hostname} answered ${res.status}`); // never log the secret link itself
  if (res.status === 404 && url.pathname.includes("/public/"))
    throw new Error("That's the public address, which only works if your calendar is public. Copy “Secret address in iCal format” instead.");
  if ([401, 403, 404, 429].includes(res.status))
    throw new Error(
      "Google refused that link. Make sure you copied “Secret address in iCal format” (not the public address or the page URL). If your secret address was reset or is turned off for your account, use “Upload your calendar instead” below.",
    );
  if (!res.ok) throw new Error(`Couldn't download the calendar (${res.status}).`);
  const text = await res.text();
  if (text.length > 15_000_000) throw new Error("That calendar is too large to import.");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar. Use the iCal address that ends in .ics.");
  return parseIcs(text, from, to, tz);
}
