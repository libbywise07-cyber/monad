import type { DiningSchoolRef } from "@/lib/dining/types";
import { parseMenuLink, SCHOOLS } from "@/lib/dining/schools";

/** Reads ?id= (directory id like "ns:uga") or ?link= (any menu URL) into a school reference. */
export function schoolFromQuery(sp: URLSearchParams): DiningSchoolRef | null {
  const id = sp.get("id");
  if (id) {
    const known = SCHOOLS.find((s) => s.id === id);
    if (known) return known;
    const [p, slug] = id.split(":");
    if (p === "na" && slug) return { id, name: slug, provider: "nutritionaddition", slug };
    if (p === "ns" && slug) return { id, name: slug, provider: "nutrislice", slug };
  }
  const link = sp.get("link");
  return link ? parseMenuLink(link) : null;
}
