import { NextResponse } from "next/server";
import { approxLocation, reverse, searchMore, suggest, type Near } from "@/lib/server/geo";

export const runtime = "nodejs";

// GET /api/geocode?q=hayward            -> { places }  search-as-you-type, nearby first
// GET /api/geocode?q=hayward&more=1     -> { places }  broader search (two sources)
// GET /api/geocode?lat=..&lon=..        -> { place }   exact location -> address
// GET /api/geocode?approx=1             -> { place }   approximate area from the internet connection
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = sp.get("lat");
  const lon = sp.get("lon");
  const q = sp.get("q")?.trim();
  try {
    if (q) {
      // Bias by the user's picked location if we have one, else by their approximate area.
      const near: Near | undefined = lat && lon ? { lat: +lat, lon: +lon } : ((await approxLocation(req)) ?? undefined);
      if (near && !near.countryCode) near.countryCode = (await approxLocation(req))?.countryCode;
      const places = sp.get("more") ? await searchMore(q, near) : await suggest(q, near);
      return NextResponse.json({ places, near: near?.label ?? null });
    }
    if (sp.get("approx")) {
      const near = await approxLocation(req);
      if (!near) return NextResponse.json({ error: "Couldn't estimate your area." }, { status: 502 });
      return NextResponse.json({ place: { label: near.label || "Your area", lat: near.lat, lon: near.lon } });
    }
    if (lat && lon) return NextResponse.json({ place: await reverse(+lat, +lon) });
    return NextResponse.json({ error: "q, lat/lon or approx required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Address search is unavailable right now. You can still use what you typed.", places: [] }, { status: 502 });
  }
}
