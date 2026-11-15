import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Free OpenStreetMap services — no API key required.
const UA = "CampusFuel/0.1 (student meal planner demo)";

const BUDGET_CHAINS: Record<string, string> = {
  aldi: "$",
  lidl: "$",
  walmart: "$",
  "winco": "$",
  "food 4 less": "$",
  "save a lot": "$",
  "grocery outlet": "$",
  "trader joe": "$$",
  target: "$$",
  kroger: "$$",
  costco: "$ (bulk)",
  "sam's club": "$ (bulk)",
  safeway: "$$",
  publix: "$$",
  "h-e-b": "$",
  heb: "$",
  meijer: "$$",
  "stop & shop": "$$",
  "whole foods": "$$$",
  "sprouts": "$$",
  "7-eleven": "$$$ (convenience)",
  cvs: "$$$ (convenience)",
  walgreens: "$$$ (convenience)",
};

function priceTier(name: string, shop: string) {
  const n = name.toLowerCase();
  for (const [k, v] of Object.entries(BUDGET_CHAINS)) if (n.includes(k)) return v;
  if (shop === "convenience") return "$$$ (convenience)";
  return "$$";
}

function haversineMi(a: [number, number], b: [number, number]) {
  const R = 3958.8;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  try {
    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": UA, "Accept-Language": "en" } },
    ).then((r) => r.json());
    if (!geo?.[0]) return NextResponse.json({ error: "Couldn't find that address. Try adding city and state." }, { status: 404 });
    const origin: [number, number] = [parseFloat(geo[0].lat), parseFloat(geo[0].lon)];

    const radius = 4800; // ~3 miles
    const q = `[out:json][timeout:20];(
      nwr["shop"~"^(supermarket|grocery|greengrocer|convenience|wholesale)$"](around:${radius},${origin[0]},${origin[1]});
    );out center 60;`;
    let osm: { elements?: unknown[] } | null = null;
    for (const mirror of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
      try {
        const r = await fetch(mirror, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(q),
        });
        if (r.ok) {
          osm = await r.json();
          break;
        }
      } catch {
        /* try next mirror */
      }
    }
    if (!osm) throw new Error("overpass unavailable");

    type El = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
    const stores = ((osm.elements || []) as El[])
      .map((e) => {
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        const t = e.tags || {};
        if (lat == null || lon == null || !t.name) return null;
        const shop = t.shop || "store";
        const addr = [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ");
        return {
          name: t.name,
          type: shop,
          address: addr,
          distanceMi: +haversineMi(origin, [lat, lon]).toFixed(2),
          price: priceTier(t.name, shop),
          hours: t.opening_hours || "",
          lat,
          lon,
          mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
        };
      })
      .filter(Boolean) as { name: string; type: string; distanceMi: number }[];

    // de-dupe by name+distance and favor real grocery stores over convenience
    const seen = new Set<string>();
    const unique = stores
      .sort((a, b) => a.distanceMi + (a.type === "convenience" ? 1.5 : 0) - (b.distanceMi + (b.type === "convenience" ? 1.5 : 0)))
      .filter((s) => {
        const k = s.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);

    return NextResponse.json({ origin: { lat: origin[0], lon: origin[1], label: geo[0].display_name }, stores: unique });
  } catch {
    return NextResponse.json({ error: "Store lookup failed — the map service may be busy. Try again shortly." }, { status: 502 });
  }
}
