import { NextResponse } from "next/server";
import { checkFeedUrl, readFeed } from "@/lib/server/ics";

export const runtime = "nodejs";

// POST /api/ics { url, from, to, tz } -> { name, account, occurrences }
// Reads a private calendar feed (e.g. Google Calendar's "Secret address in iCal format").
// The browser can't fetch it directly (no CORS), so the server does. Nothing is stored.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; from?: string; to?: string; tz?: string };
    const url = checkFeedUrl(body.url ?? "");
    const from = new Date(body.from ?? Date.now());
    const to = new Date(body.to ?? Date.now() + 14 * 86_400_000);
    if (isNaN(+from) || isNaN(+to) || to <= from || +to - +from > 62 * 86_400_000)
      return NextResponse.json({ error: "Bad date range." }, { status: 400 });
    const { name, occurrences } = await readFeed(url, from, to, body.tz ?? "UTC");
    // Google feed paths contain the calendar's address, e.g. /calendar/ical/you%40gmail.com/private-…/basic.ics
    const fromPath = decodeURIComponent(url.pathname.split("/")[3] ?? "");
    const account = fromPath.includes("@") ? fromPath : name || "Google Calendar";
    return NextResponse.json({ name, account, occurrences });
  } catch (e) {
    const msg =
      !(e instanceof Error) || e.name === "TypeError"
        ? "Couldn't reach Google Calendar. Check the link and try again."
        : e.name === "TimeoutError"
          ? "Google Calendar took too long to respond. Try again."
          : e.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
