// Server-side geocoding helpers. Free OpenStreetMap-based services, no API key.
// Photon (photon.komoot.io) is built for search-as-you-type; Nominatim is only a fallback
// for single lookups because its usage policy forbids autocomplete.

export const UA = "CampusFuel/0.1 (student meal planner demo)";

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

function photonLabel(p: PhotonFeature["properties"]) {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const first = p.name && p.name !== p.street ? p.name : "";
  const parts = [first, street, p.city || p.town || p.village || p.district, p.state, p.postcode];
  const seen = new Set<string>();
  return parts
    .filter((x): x is string => Boolean(x))
    .filter((x) => (seen.has(x) ? false : (seen.add(x), true)))
    .join(", ");
}

export async function suggest(q: string, near?: { lat: number; lon: number }): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: "6", lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { "User-Agent": UA },
    signal: withTimeout(5000),
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return json.features
    .map((f) => ({ label: photonLabel(f.properties), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
    .filter((p) => p.label && !seen.has(p.label) && seen.add(p.label));
}

export async function geocode(address: string): Promise<Place | null> {
  try {
    const [first] = await suggest(address);
    if (first) return first;
  } catch {
    /* fall through to Nominatim */
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    signal: withTimeout(6000),
  });
  const json = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return json[0] ? { label: json[0].display_name, lat: +json[0].lat, lon: +json[0].lon } : null;
}

export async function reverse(lat: number, lon: number): Promise<Place> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`, {
      headers: { "User-Agent": UA },
      signal: withTimeout(5000),
    });
    const json = (await res.json()) as { features: PhotonFeature[] };
    const f = json.features?.[0];
    if (f) return { label: photonLabel(f.properties), lat, lon };
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: withTimeout(6000),
    });
    const json = (await res.json()) as { display_name?: string };
    if (json.display_name) return { label: json.display_name, lat, lon };
  } catch {
    /* use coordinates */
  }
  return { label: `Near ${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon };
}
