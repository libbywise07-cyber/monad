import { NextResponse } from "next/server";
import { reverse, suggest } from "@/lib/server/geo";

export const runtime = "nodejs";

// GET /api/geocode?q=2125 frank      -> { places: Place[] }   (search-as-you-type)
// GET /api/geocode?lat=..&lon=..     -> { place: Place }      (current location)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = sp.get("lat");
  const lon = sp.get("lon");
  const q = sp.get("q")?.trim();
  try {
    if (q) {
      const near = lat && lon ? { lat: +lat, lon: +lon } : undefined;
      return NextResponse.json({ places: await suggest(q, near) });
    }
    if (lat && lon) return NextResponse.json({ place: await reverse(+lat, +lon) });
    return NextResponse.json({ error: "q or lat/lon required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Address search is unavailable right now.", places: [] }, { status: 502 });
  }
}
