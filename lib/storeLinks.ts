// Links out to each chain's own product search and to Google Maps directions.
// These are plain web links (no API): they open the store's site or Maps in a new tab.

const SEARCH: [string, (q: string) => string][] = [
  ["safeway", (q) => `https://www.safeway.com/shop/search-results.html?q=${q}`],
  ["albertsons", (q) => `https://www.albertsons.com/shop/search-results.html?q=${q}`],
  ["fred meyer", (q) => `https://www.fredmeyer.com/search?query=${q}`],
  ["kroger", (q) => `https://www.kroger.com/search?query=${q}`],
  ["ralphs", (q) => `https://www.ralphs.com/search?query=${q}`],
  ["king soopers", (q) => `https://www.kingsoopers.com/search?query=${q}`],
  ["qfc", (q) => `https://www.qfc.com/search?query=${q}`],
  ["target", (q) => `https://www.target.com/s?searchTerm=${q}`],
  ["walmart", (q) => `https://www.walmart.com/search?q=${q}`],
  ["trader joe", (q) => `https://www.traderjoes.com/home/search?q=${q}&section=products`],
  ["whole foods", (q) => `https://www.wholefoodsmarket.com/search?text=${q}`],
  ["costco", (q) => `https://www.costco.com/s?keyword=${q}`],
  ["aldi", (q) => `https://www.aldi.us/results?q=${q}`],
  ["publix", (q) => `https://www.publix.com/search?searchTerm=${q}`],
  ["h-e-b", (q) => `https://www.heb.com/search?q=${q}`],
  ["heb", (q) => `https://www.heb.com/search?q=${q}`],
  ["meijer", (q) => `https://www.meijer.com/shopping/search.html?text=${q}`],
  ["sprouts", (q) => `https://shop.sprouts.com/search?search_term=${q}`],
  ["natural grocers", (q) => `https://www.naturalgrocers.com/search?keys=${q}`],
];

/** The store's own product search for an item, or a Google search scoped to the store. */
export function storeSearchUrl(storeName: string, item: string): { url: string; direct: boolean } {
  const q = encodeURIComponent(item);
  const n = storeName.toLowerCase();
  const hit = SEARCH.find(([k]) => n.includes(k));
  if (hit) return { url: hit[1](q), direct: true };
  return { url: `https://www.google.com/search?q=${encodeURIComponent(`${item} ${storeName}`)}`, direct: false };
}

export type TravelMode = "transit" | "walking" | "driving" | "bicycling";

export function directionsUrl(dest: { lat: number; lon: number }, mode: TravelMode, origin?: { lat?: number; lon?: number; address?: string }) {
  const params = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lon}`, travelmode: mode });
  if (origin?.lat != null && origin?.lon != null) params.set("origin", `${origin.lat},${origin.lon}`);
  else if (origin?.address) params.set("origin", origin.address);
  return `https://www.google.com/maps/dir/?${params}`;
}
