import { NextResponse } from "next/server";
import { geocode, UA } from "@/lib/server/geo";

export const runtime = "nodejs";

// Overpass (OpenStreetMap) mirrors. We ask all of them at once and use whichever answers first.
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const BUDGET_CHAINS: Record<string, string> = {
  aldi: "$",
  lidl: "$",
  walmart: "$",
  winco: "$",
  "food 4 less": "$",
  "save a lot": "$",
  "grocery outlet": "$",
  "trader joe": "$$",
  target: "$$",
  kroger: "$$",
  "fred meyer": "$$",
  costco: "$ (bulk)",
  "sam's club": "$ (bulk)",
  safeway: "$$",
  albertsons: "$$",
  publix: "$$",
  "h-e-b": "$",
  heb: "$",
  meijer: "$$",
  "stop & shop": "$$",
  "market of choice": "$$$",
  "whole foods": "$$$",
  sprouts: "$$",
  "7-eleven": "$$$ (convenience)",
  cvs: "$$$ (convenience)",
  walgreens: "$$$ (convenience)",
};

export interface Store {
  name: string;
  type: string;
  address: string;
  distanceMi: number;
  price: string;
  hours: string;
  lat: number;
  lon: number;
  mapUrl: string;
}

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

type El = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function overpass(lat: number, lon: number): Promise<El[]> {
  const q = `[out:json][timeout:12];nwr["shop"~"^(supermarket|grocery|greengrocer|convenience|wholesale)$"](around:4800,${lat},${lon});out center 80;`;
  const body = "data=" + encodeURIComponent(q);
  const controllers = OVERPASS.map(() => new AbortController());
  const attempts = OVERPASS.map(async (url, i) => {
    const timer = setTimeout(() => controllers[i].abort(), 15000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controllers[i].signal,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const json = (await r.json()) as { elements?: El[] };
      if (!json.elements) throw new Error("bad response");
      return json.elements;
    } finally {
      clearTimeout(timer);
    }
  });
  const elements = await Promise.any(attempts);
  controllers.forEach((c) => c.abort()); // cancel the slower mirrors
  return elements;
}

// Small in-memory cache so revisiting the Groceries tab is instant.
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 1000 * 60 * 60 * 6;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const address = sp.get("address")?.trim() || "";
  let lat = sp.get("lat") ? Number(sp.get("lat")) : NaN;
  let lon = sp.get("lon") ? Number(sp.get("lon")) : NaN;
  let label = address;

  try {
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      if (!address) return NextResponse.json({ error: "Enter an address or use your current location." }, { status: 400 });
      const place = await geocode(address);
      if (!place)
        return NextResponse.json({ error: "Couldn't find that address. Pick one of the suggestions, or add your city and state." }, { status: 404 });
      ({ lat, lon, label } = place);
    }

    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

    const origin: [number, number] = [lat, lon];
    const elements = await overpass(lat, lon);

    const stores: Store[] = [];
    for (const e of elements) {
      const elat = e.lat ?? e.center?.lat;
      const elon = e.lon ?? e.center?.lon;
      const t = e.tags || {};
      if (elat == null || elon == null || !t.name) continue;
      const shop = t.shop || "store";
      stores.push({
        name: t.name,
        type: shop,
        address: [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" "),
        distanceMi: +haversineMi(origin, [elat, elon]).toFixed(2),
        price: priceTier(t.name, shop),
        hours: t.opening_hours || "",
        lat: elat,
        lon: elon,
        mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${elat},${elon}`,
      });
    }

    // Grocery stores first (convenience stores count as 1.5 mi farther), one entry per name.
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

    const data = { origin: { lat, lon, label }, stores: unique };
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The store map service didn't answer in time. Tap Retry." }, { status: 504 });
  }
}
