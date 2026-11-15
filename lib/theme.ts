// Color theme choice (pastel variations of the CampusFuel look), saved per browser. Light only.

export const PALETTES = [
  { id: "cocoa", name: "Cocoa", colors: ["#4e3d3b", "#f9d8ce", "#e4dbf0"] },
  { id: "peony", name: "Peony", colors: ["#8a4b5a", "#f9d8ce", "#f3c6d0"] },
  { id: "lavender", name: "Lavender", colors: ["#54497a", "#e4dbf0", "#d5ddf0"] },
  { id: "sage", name: "Sage", colors: ["#4d5b3f", "#e1e9d2", "#e8e5ae"] },
  { id: "sky", name: "Sky", colors: ["#3f4f73", "#d5ddf0", "#e4dbf0"] },
  { id: "butter", name: "Butter", colors: ["#6b5a24", "#f3e9b8", "#f9d8ce"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

const KEY = "campusfuel.theme.v1";
const DEFAULT: PaletteId = "cocoa";
const isPalette = (v: unknown): v is PaletteId => PALETTES.some((p) => p.id === v);

export function loadTheme(): { palette: PaletteId } {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "{}");
    // Older saved themes (teal, berry, dark mode…) fall back to the default.
    return { palette: isPalette(t.palette) ? t.palette : DEFAULT };
  } catch {
    return { palette: DEFAULT };
  }
}

export function applyTheme(t: { palette: PaletteId }) {
  const el = document.documentElement;
  if (t.palette === DEFAULT) el.removeAttribute("data-palette");
  else el.setAttribute("data-palette", t.palette);
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
}

/** Runs before the page paints so there's no flash of the wrong colors. */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${KEY}")||"{}");var ok=${JSON.stringify(PALETTES.map((p) => p.id))};if(t.palette&&t.palette!=="${DEFAULT}"&&ok.indexOf(t.palette)>-1)document.documentElement.setAttribute("data-palette",t.palette)}catch(e){}`;
