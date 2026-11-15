// Server-side geocoding helpers. Free OpenStreetMap-based services, no API key.
//  - Photon (photon.komoot.io): built for search-as-you-type, used on every keystroke.
//  - Nominatim: only for one-off lookups (its usage policy forbids autocomplete), e.g. the
//    "Search more places" action, reverse lookups, and fallbacks.
//  - ipwho.is / ipapi.co: approximate city from the internet connection, used to rank nearby
//    results first and as a fallback when the browser can't share an exact location.

export const UA = "CampusFuel/0.1 (student meal planner demo)";

export interface Place {
  label: string;
  lat: number;
  lon: number;
  distanceMi?: number;
}
export interface Near {
  lat: number;
  lon: number;
  countryCode?: string;
  label?: string;
}

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearby results first (within ~60 mi, in the provider's order), then the rest by distance. */
function rankByDistance(places: Place[], near?: Near): Place[] {
  if (!near) return places;
  const withD = places.map((p) => ({ ...p, distanceMi: +milesBetween(near, p).toFixed(1) }));
  const local = withD.filter((p) => p.distanceMi! <= 60);
  const far = withD
    .filter((p) => p.distanceMi! > 60 && (local.length === 0 || p.distanceMi! <= 300)) // hide far-away noise when there are local matches
    .sort((a, b) => a.distanceMi! - b.distanceMi!);
  return [...local, ...far];
}

function dedupe(places: Place[]) {
  const out: Place[] = [];
  for (const p of places) {
    if (out.some((o) => o.label === p.label || (milesBetween(o, p) < 0.03 && o.label.split(",")[0] === p.label.split(",")[0]))) continue;
    out.push(p);
  }
  return out;
}

// ---------- approximate location from the internet connection ----------
let approxCache: { at: number; ip: string; near: Near | null } | null = null;

function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  // localhost / private network: the server's own public IP is the user's (app running on their machine)
  if (!fwd || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|::ffff:127\.)/i.test(fwd)) return "";
  return fwd;
}

export async function approxLocation(req: Request): Promise<Near | null> {
  const ip = clientIp(req);
  if (approxCache && approxCache.ip === ip && Date.now() - approxCache.at < 60 * 60 * 1000) return approxCache.near;
  let near: Near | null = null;
  try {
    const r = await fetch(`https://ipwho.is/${ip}`, { headers: { "User-Agent": UA }, signal: withTimeout(3000) });
    const j = (await r.json()) as { success?: boolean; latitude?: number; longitude?: number; city?: string; region_code?: string; region?: string; country_code?: string };
    if (j.success && j.latitude != null && j.longitude != null)
      near = { lat: j.latitude, lon: j.longitude, countryCode: j.country_code, label: [j.city, j.region_code || j.region].filter(Boolean).join(", ") };
  } catch {
    /* try the next provider */
  }
  if (!near) {
    try {
      const r = await fetch(`https://ipapi.co/${ip ? ip + "/" : ""}json/`, { headers: { "User-Agent": UA }, signal: withTimeout(3000) });
      const j = (await r.json()) as { latitude?: number; longitude?: number; city?: string; region_code?: string; country_code?: string };
      if (j.latitude != null && j.longitude != null)
        near = { lat: j.latitude, lon: j.longitude, countryCode: j.country_code, label: [j.city, j.region_code].filter(Boolean).join(", ") };
    } catch {
      /* no approximate location */
    }
  }
  approxCache = { at: Date.now(), ip, near };
  return near;
}

// ---------- Photon ----------
type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

function photonLabel(p: PhotonFeature["properties"], includeName = true) {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const first = includeName && p.name && p.name !== p.street ? p.name : "";
  const parts = [first, street, p.city || p.town || p.village || p.district, p.state, p.postcode];
  const seen = new Set<string>();
  return parts
    .filter((x): x is string => Boolean(x))
    .filter((x) => (seen.has(x) ? false : (seen.add(x), true)))
    .join(", ");
}

async function photon(q: string, near?: Near, limit = 10): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: String(limit), lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
    params.set("zoom", "12"); // favour results within a city-sized area around the user
    params.set("location_bias_scale", "0.1"); // let distance outweigh how famous a place is
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { "User-Agent": UA }, signal: withTimeout(6000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features
    .map((f) => ({ label: photonLabel(f.properties), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
    .filter((p) => p.label);
}

// ---------- Nominatim ----------
type NomResult = { lat: string; lon: string; name?: string; display_name: string; address?: Record<string, string> };

function nominatimLabel(r: NomResult) {
  const a = r.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city = a.city || a.town || a.village || a.suburb;
  const parts = [r.name && r.name !== a.road ? r.name : "", street, city, [a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length >= 2 ? parts.join(", ") : r.display_name;
}

async function nominatim(q: string, near?: Near, limit = 8): Promise<Place[]> {
  const params = new URLSearchParams({ format: "jsonv2", q, limit: String(limit), addressdetails: "1" });
  if (near) {
    // prefer (not restrict to) a ~50 mile box around the user
    const d = 0.75;
    params.set("viewbox", [near.lon - d, near.lat + d, near.lon + d, near.lat - d].join(","));
    if (near.countryCode) params.set("countrycodes", near.countryCode.toLowerCase());
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    signal: withTimeout(6000),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const json = (await res.json()) as NomResult[];
  return json.map((r) => ({ label: nominatimLabel(r), lat: +r.lat, lon: +r.lon }));
}

// ---------- public API ----------
/** Search-as-you-type suggestions (Photon only). */
export async function suggest(q: string, near?: Near): Promise<Place[]> {
  return rankByDistance(dedupe(await photon(q, near, 10)), near).slice(0, 6);
}

/** Broader one-off search: Photon + Nominatim together. */
export async function searchMore(q: string, near?: Near): Promise<Place[]> {
  const [a, b] = await Promise.allSettled([photon(q, near, 15), nominatim(q, near, 10)]);
  const all = [...(b.status === "fulfilled" ? b.value : []), ...(a.status === "fulfilled" ? a.value : [])];
  if (a.status === "rejected" && b.status === "rejected") throw new Error("search unavailable");
  return rankByDistance(dedupe(all), near).slice(0, 10);
}

export async function geocode(address: string, near?: Near): Promise<Place | null> {
  try {
    const [first] = await searchMore(address, near);
    return first ?? null;
  } catch {
    return null;
  }
}

export async function reverse(lat: number, lon: number): Promise<Place> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, {
      headers: { "User-Agent": UA },
      signal: withTimeout(5000),
    });
    const json = (await res.json()) as { features: PhotonFeature[] };
    const f = json.features?.[0];
    if (f) return { label: photonLabel(f.properties, false), lat, lon };
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lon}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: withTimeout(6000),
    });
    const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    const a = json.address || {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city || a.town || a.village || a.suburb;
    const short = [street, city, [a.state, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (short || json.display_name) return { label: short || json.display_name!, lat, lon };
  } catch {
    /* use coordinates */
  }
  return { label: `Near ${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
}
