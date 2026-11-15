import { NextResponse } from "next/server";
import { approxLocation, geocode, UA } from "@/lib/server/geo";
import { formatAddress } from "@/lib/address";

export const runtime = "nodejs";

// Two free OpenStreetMap sources are queried at the same time:
//  - Overpass: every grocery/convenience store in a ~3 mile radius (thorough, sometimes slow)
//  - Nominatim: supermarkets inside the same box (fast, fewer small shops)
// Results are merged, then real driving distance/time comes from the public OSRM router.

const RADIUS_M = 4800; // ~3 miles
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Price tier per chain. Factor = typical basket cost relative to an average US supermarket.
const CHAINS: [string, string, number][] = [
  ["aldi", "$", 0.8],
  ["lidl", "$", 0.8],
  ["winco", "$", 0.8],
  ["grocery outlet", "$", 0.8],
  ["food 4 less", "$", 0.82],
  ["save a lot", "$", 0.82],
  ["walmart", "$", 0.85],
  ["costco", "$ (bulk)", 0.8],
  ["sam's club", "$ (bulk)", 0.82],
  ["h-e-b", "$", 0.88],
  ["heb", "$", 0.88],
  ["trader joe", "$$", 0.92],
  ["fred meyer", "$$", 0.95],
  ["kroger", "$$", 0.95],
  ["meijer", "$$", 0.95],
  ["target", "$$", 1.0],
  ["safeway", "$$", 1.08],
  ["albertsons", "$$", 1.08],
  ["publix", "$$", 1.1],
  ["stop & shop", "$$", 1.05],
  ["sprouts", "$$", 1.1],
  ["natural grocers", "$$$", 1.2],
  ["market of choice", "$$$", 1.25],
  ["whole foods", "$$$", 1.25],
  ["7-eleven", "$$$ (convenience)", 1.45],
  ["cvs", "$$$ (pharmacy)", 1.4],
  ["walgreens", "$$$ (pharmacy)", 1.4],
  ["dollar general", "$", 0.95],
  ["dollar tree", "$", 0.95],
];

function price(name: string, type: string) {
  const n = name.toLowerCase();
  for (const [k, tier, factor] of CHAINS) if (n.includes(k)) return { tier, factor, known: true };
  if (type === "convenience") return { tier: "$$$ (convenience)", factor: 1.4, known: false };
  if (type === "greengrocer") return { tier: "$$", factor: 1.05, known: false };
  return { tier: "$$", factor: 1.05, known: false };
}

export interface Store {
  id: string;
  name: string;
  type: string;
  address: string;
  hours: string;
  lat: number;
  lon: number;
  straightMi: number;
  distanceMi: number; // driving distance when available, else straight line
  driveMin: number | null;
  distanceKind: "drive" | "straight";
  priceTier: string;
  priceFactor: number;
  priceKnown: boolean;
  mapUrl: string;
}

type Raw = { name: string; type: string; address: string; hours: string; lat: number; lon: number };

function haversineMi(a: [number, number], b: [number, number]) {
  const R = 3958.8;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fromOverpass(lat: number, lon: number): Promise<Raw[]> {
  const q = `[out:json][timeout:8];nwr["shop"~"^(supermarket|grocery|greengrocer|convenience|wholesale)$"]["name"](around:${RADIUS_M},${lat},${lon});out center 80;`;
  const body = "data=" + encodeURIComponent(q);
  const ctrls = OVERPASS.map(() => new AbortController());
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), 9000);
  try {
    type El = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
    const elements = await Promise.any(
      OVERPASS.map(async (url, i) => {
        const r = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: ctrls[i].signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { elements?: El[] };
        if (!j.elements) throw new Error("bad response");
        return j.elements;
      }),
    );
    return elements.flatMap((e) => {
      const la = e.lat ?? e.center?.lat;
      const lo = e.lon ?? e.center?.lon;
      const t = e.tags || {};
      if (la == null || lo == null || !t.name) return [];
      return [
        {
          name: t.name,
          type: t.shop || "supermarket",
          address: t["addr:street"]
            ? formatAddress({
                houseNumber: t["addr:housenumber"],
                street: t["addr:street"],
                city: t["addr:city"],
                state: t["addr:state"],
                postcode: t["addr:postcode"],
              })
            : "",
          hours: t.opening_hours || "",
          lat: la,
          lon: lo,
        },
      ];
    });
  } finally {
    clearTimeout(timer);
    ctrls.forEach((c) => c.abort());
  }
}

async function fromNominatim(lat: number, lon: number): Promise<Raw[]> {
  const dLat = RADIUS_M / 111_000;
  const dLon = RADIUS_M / (111_000 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].join(",");
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=supermarket&limit=40&bounded=1` +
    `&viewbox=${viewbox}&addressdetails=1&extratags=1`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(String(r.status));
  type N = { lat: string; lon: string; name?: string; type?: string; address?: Record<string, string>; extratags?: Record<string, string> };
  const j = (await r.json()) as N[];
  return j
    .filter((x) => x.name)
    .map((x) => {
      const a = x.address || {};
      return {
        name: x.name!,
        type: x.type || "supermarket",
        address: a.road
          ? formatAddress({
              houseNumber: a.house_number,
              street: a.road,
              city: a.city || a.town || a.village,
              stateIso: a["ISO3166-2-lvl4"],
              state: a.state,
              postcode: a.postcode,
              countryCode: a.country_code,
            })
          : "",
        hours: x.extratags?.opening_hours || "",
        lat: +x.lat,
        lon: +x.lon,
      };
    });
}

/** Driving distance (miles) and time (minutes) from origin to each store via the public OSRM router. */
async function driving(origin: [number, number], dests: [number, number][]) {
  if (!dests.length) return null;
  const coords = [origin, ...dests].map(([la, lo]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { code: string; distances?: (number | null)[][]; durations?: (number | null)[][] };
    if (j.code !== "Ok" || !j.distances || !j.durations) return null;
    return dests.map((_, i) => {
      const m = j.distances![0][i + 1];
      const s = j.durations![0][i + 1];
      return m == null || s == null ? null : { mi: m / 1609.34, min: s / 60 };
    });
  } catch {
    return null;
  }
}

function merge(lists: Raw[][]): Raw[] {
  const merged: Raw[] = [];
  for (const s of lists.flat()) {
    const dup = merged.find((m) => m.name.toLowerCase() === s.name.toLowerCase() && haversineMi([m.lat, m.lon], [s.lat, s.lon]) < 0.1);
    if (!dup) merged.push({ ...s });
    else {
      dup.address ||= s.address;
      dup.hours ||= s.hours;
    }
  }
  return merged;
}

const penalty = (type: string) => (type === "convenience" ? 1 : 0); // grocery stores before convenience stores

function build(origin: [number, number], raw: Raw[], drive: ({ mi: number; min: number } | null)[] | null): Store[] {
  return raw
    .map((s, i) => {
      const d = drive?.[i];
      const p = price(s.name, s.type);
      const straight = haversineMi(origin, [s.lat, s.lon]);
      return {
        id: `${s.name.toLowerCase()}@${s.lat.toFixed(4)},${s.lon.toFixed(4)}`,
        name: s.name,
        type: s.type,
        address: s.address,
        hours: s.hours,
        lat: s.lat,
        lon: s.lon,
        straightMi: +straight.toFixed(2),
        distanceMi: +(d ? d.mi : straight).toFixed(1),
        driveMin: d ? Math.max(1, Math.round(d.min)) : null,
        distanceKind: d ? ("drive" as const) : ("straight" as const),
        priceTier: p.tier,
        priceFactor: p.factor,
        priceKnown: p.known,
        mapUrl: `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`,
      };
    })
    .sort((a, b) => a.distanceMi + penalty(a.type) - (b.distanceMi + penalty(b.type)));
}

function nearest(origin: [number, number], raw: Raw[], n = 20) {
  return raw
    .map((s) => ({ s, d: haversineMi(origin, [s.lat, s.lon]) }))
    .filter((x) => x.d <= 3.5)
    .sort((a, b) => a.d + penalty(a.s.type) - (b.d + penalty(b.s.type)))
    .slice(0, n)
    .map((x) => x.s);
}

// Caches: finished results (6h) and in-flight full searches, so the fast and full requests share work.
const TTL = 1000 * 60 * 60 * 6;
const done = new Map<string, { at: number; data: unknown }>();
const nomCache = new Map<string, Promise<Raw[]>>();
const fullInFlight = new Map<string, Promise<unknown>>();

function nominatimFor(key: string, lat: number, lon: number) {
  let p = nomCache.get(key);
  if (!p) {
    p = fromNominatim(lat, lon);
    nomCache.set(key, p);
    p.catch(() => nomCache.delete(key));
    setTimeout(() => nomCache.delete(key), TTL);
  }
  return p;
}

async function fullSearch(key: string, lat: number, lon: number, label: string) {
  const origin: [number, number] = [lat, lon];
  const [op, nm] = await Promise.allSettled([fromOverpass(lat, lon), nominatimFor(key, lat, lon)]);
  if (op.status === "rejected" && nm.status === "rejected") throw new Error("both sources failed");
  const near = nearest(origin, merge([op.status === "fulfilled" ? op.value : [], nm.status === "fulfilled" ? nm.value : []]));
  const drive = await driving(
    origin,
    near.map((s) => [s.lat, s.lon]),
  );
  const data = { origin: { lat, lon, label }, stores: build(origin, near, drive), complete: true, partial: op.status === "rejected" };
  if (!data.partial) done.set(key, { at: Date.now(), data });
  return data;
}

// GET /api/stores?lat=..&lon=..&mode=fast   first answer in ~1–3 s (one source, straight-line distance)
// GET /api/stores?lat=..&lon=..&mode=full   both sources + driving distances (cached 6 h)
// address=... can replace lat/lon.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("mode") === "fast" ? "fast" : "full";
  const address = sp.get("address")?.trim() || "";
  let lat = sp.get("lat") ? Number(sp.get("lat")) : NaN;
  let lon = sp.get("lon") ? Number(sp.get("lon")) : NaN;
  let label = address;

  try {
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      if (!address) return NextResponse.json({ error: "Enter an address or use your current location." }, { status: 400 });
      const place = await geocode(address, (await approxLocation(req)) ?? undefined);
      if (!place)
        return NextResponse.json({ error: "Couldn't find that address. Pick one of the suggestions, or add your city and state." }, { status: 404 });
      ({ lat, lon, label } = place);
    }

    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const hit = done.get(key);
    if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.data);

    // Start (or join) the full search in the background either way.
    let full = fullInFlight.get(key);
    if (!full) {
      full = fullSearch(key, lat, lon, label).finally(() => fullInFlight.delete(key));
      fullInFlight.set(key, full);
      full.catch(() => {});
    }

    if (mode === "full") return NextResponse.json(await full);

    // Fast: whichever arrives first — Nominatim's supermarkets, or the finished full search.
    const origin: [number, number] = [lat, lon];
    const fast = nominatimFor(key, lat, lon).then((raw) => {
      if (!raw.length) throw new Error("empty");
      return { origin: { lat, lon, label }, stores: build(origin, nearest(origin, raw), null), complete: false };
    });
    const data = await Promise.any([fast, full]);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "The map services didn't answer in time. Tap Retry." }, { status: 504 });
  }
}
