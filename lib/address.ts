// Formats addresses the way people write them on mail:
//   "1514 SE Nehalem St, Portland, OR 97202"
// Uses the US Postal Service abbreviations for street types, directions and states.

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR", guam: "GU",
};

const DIRECTIONS: Record<string, string> = {
  north: "N", south: "S", east: "E", west: "W",
  northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW",
};

const SUFFIXES: Record<string, string> = {
  alley: "Aly", avenue: "Ave", boulevard: "Blvd", circle: "Cir", court: "Ct", crescent: "Cres", drive: "Dr",
  expressway: "Expy", freeway: "Fwy", highway: "Hwy", lane: "Ln", parkway: "Pkwy", place: "Pl", plaza: "Plz",
  road: "Rd", square: "Sq", street: "St", terrace: "Ter", trail: "Trl", turnpike: "Tpke", way: "Way", loop: "Loop",
  point: "Pt", crossing: "Xing", center: "Ctr", heights: "Hts", junction: "Jct", landing: "Lndg", run: "Run",
};

/** "Southeast Nehalem Street" -> "SE Nehalem St"; "East 13th Avenue" -> "E 13th Ave" */
export function abbreviateStreet(street: string): string {
  const words = street.trim().split(/\s+/);
  if (!words.length) return street;
  const low = (w: string) => w.toLowerCase().replace(/\.$/, "");
  // leading direction
  // (but not when the direction IS the name, as in "North Street")
  if (words.length > 1 && DIRECTIONS[low(words[0])] && !(words.length === 2 && SUFFIXES[low(words[1])])) words[0] = DIRECTIONS[low(words[0])];
  // trailing direction ("Main Street Northwest")
  let end = words.length - 1;
  if (words.length > 2 && DIRECTIONS[low(words[end])]) {
    words[end] = DIRECTIONS[low(words[end])];
    end -= 1;
  }
  // street type: the last word before any trailing direction
  if (end > 0 && SUFFIXES[low(words[end])]) words[end] = SUFFIXES[low(words[end])];
  return words.join(" ");
}

export function stateCode(state?: string, iso?: string): string {
  if (iso && /^US-[A-Z]{2}$/.test(iso)) return iso.slice(3);
  if (!state) return "";
  if (/^[A-Z]{2}$/.test(state)) return state;
  return STATES[state.toLowerCase()] ?? state;
}

export interface AddressParts {
  name?: string; // building or business name, e.g. "Hayward Student Living"
  houseNumber?: string;
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  stateIso?: string; // e.g. "US-OR"
  postcode?: string;
  countryCode?: string; // e.g. "US"
}

/** The mailing address line, e.g. "1514 SE Nehalem St, Portland, OR 97202". */
export function formatAddress(p: AddressParts): string {
  const us = !p.countryCode || p.countryCode.toUpperCase() === "US";
  const street = p.street ? (us ? abbreviateStreet(p.street) : p.street) : "";
  const line1 = [p.houseNumber, street].filter(Boolean).join(" ") + (p.unit ? ` #${p.unit}` : "");
  const st = us ? stateCode(p.state, p.stateIso) : p.state || "";
  const region = [st, p.postcode].filter(Boolean).join(" ");
  // No street at all (a named building or an area): lead with the name so the result is recognizable.
  const lead = line1 || p.name || "";
  return [lead, p.city, region].filter(Boolean).join(", ");
}

/** A building/business name worth showing above the address, if it adds information. */
export function displayName(p: AddressParts): string | undefined {
  if (!p.name) return undefined;
  const n = p.name.trim();
  const line1 = [p.houseNumber, p.street].filter(Boolean).join(" ").toLowerCase();
  // skip names that are just the street address ("2125 Franklin") or the street itself
  if (!n || line1.startsWith(n.toLowerCase()) || n.toLowerCase() === (p.street || "").toLowerCase()) return undefined;
  if (p.houseNumber && n.toLowerCase().startsWith(p.houseNumber + " ")) return undefined;
  if (!p.houseNumber && !p.street) return undefined; // name already used as the lead
  return n;
}
