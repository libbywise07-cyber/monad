import type { DiningSchoolRef } from "./types";

// Colleges whose dining menus we've confirmed load (checked 2026-11). Any other school on the same
// platforms works too: students paste their menu link and parseMenuLink() figures out the rest.
const NA: [string, string][] = [
  ["uoregon", "University of Oregon"],
  ["arizona", "University of Arizona"],
  ["okstate", "Oklahoma State University"],
];

const NS: [string, string][] = [
  ["auburn", "Auburn University"],
  ["clemson", "Clemson University"],
  ["cpp", "Cal Poly Pomona"],
  ["depaul", "DePaul University"],
  ["ecu", "East Carolina University"],
  ["fau", "Florida Atlantic University"],
  ["fordham", "Fordham University"],
  ["fsu", "Florida State University"],
  ["gsu", "Georgia State University"],
  ["jmu", "James Madison University"],
  ["kent", "Kent State University"],
  ["ksu", "Kennesaw State University"],
  ["loyola", "Loyola Marymount University"],
  ["memphis", "University of Memphis"],
  ["mit", "MIT"],
  ["msstate", "Mississippi State University"],
  ["msu", "Michigan State University"],
  ["ncsu", "NC State University"],
  ["nd", "University of Notre Dame"],
  ["nyu", "New York University"],
  ["odu", "Old Dominion University"],
  ["ohio", "Ohio University"],
  ["olemiss", "University of Mississippi (Ole Miss)"],
  ["oregonstate", "Oregon State University"],
  ["osu", "Ohio State University"],
  ["rutgers", "Rutgers University"],
  ["sc", "University of South Carolina"],
  ["sdsu", "San Diego State University"],
  ["stonybrook", "Stony Brook University"],
  ["tufts", "Tufts University"],
  ["tulane", "Tulane University"],
  ["udel", "University of Delaware"],
  ["uga", "University of Georgia"],
  ["umd", "University of Maryland"],
  ["und", "University of North Dakota"],
  ["unh", "University of New Hampshire"],
  ["unl", "University of Nebraska–Lincoln"],
  ["unlv", "UNLV"],
  ["unm", "University of New Mexico"],
  ["usf", "University of South Florida"],
  ["utk", "University of Tennessee, Knoxville"],
  ["uwm", "University of Wisconsin–Milwaukee"],
  ["uwyo", "University of Wyoming"],
  ["vanderbilt", "Vanderbilt University"],
  ["vcu", "Virginia Commonwealth University"],
  ["wisc", "University of Wisconsin–Madison"],
  ["wm", "William & Mary"],
  ["wmich", "Western Michigan University"],
  ["wsu", "Washington State University"],
];

export const SCHOOLS: DiningSchoolRef[] = [
  ...NA.map(([slug, name]) => ({ id: `na:${slug}`, name, provider: "nutritionaddition" as const, slug })),
  ...NS.map(([slug, name]) => ({ id: `ns:${slug}`, name, provider: "nutrislice" as const, slug })),
].sort((a, b) => a.name.localeCompare(b.name));

export function searchSchools(q: string): DiningSchoolRef[] {
  const s = q.trim().toLowerCase();
  if (!s) return SCHOOLS;
  return SCHOOLS.filter((x) => x.name.toLowerCase().includes(s) || x.slug === s);
}

const SLUG = /^[a-z0-9-]{2,40}$/;

/** Turns a pasted dining-menu link into a school reference. Unknown sites become a "link" source read by AI. */
export function parseMenuLink(raw: string): DiningSchoolRef | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();

  if (host === "app.mynutritioncalculator.net" || host.endsWith(".mynutritioncalculator.net")) {
    const slug = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    if (slug && SLUG.test(slug)) {
      const known = SCHOOLS.find((x) => x.provider === "nutritionaddition" && x.slug === slug);
      return known || { id: `na:${slug}`, name: slug, provider: "nutritionaddition", slug };
    }
  }
  const ns = host.match(/^([a-z0-9-]+)(?:\.api)?\.nutrislice\.com$/);
  if (ns && ns[1] !== "www" && SLUG.test(ns[1])) {
    const known = SCHOOLS.find((x) => x.provider === "nutrislice" && x.slug === ns[1]);
    return known || { id: `ns:${ns[1]}`, name: ns[1], provider: "nutrislice", slug: ns[1] };
  }
  return { id: `link:${host}${u.pathname}`, name: host.replace(/^www\./, ""), provider: "link", slug: host, url: u.toString() };
}
