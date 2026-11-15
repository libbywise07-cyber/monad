// Color theme + light/dark choice, saved per browser.

export const PALETTES = [
  { id: "teal", name: "Fresh", colors: ["#0f766e", "#e3f3f1", "#f59e0b"] },
  { id: "berry", name: "Berry", colors: ["#a21caf", "#fae8ff", "#f59e0b"] },
  { id: "ocean", name: "Ocean", colors: ["#1d4ed8", "#e0eaff", "#f59e0b"] },
  { id: "citrus", name: "Citrus", colors: ["#c2410c", "#ffedd5", "#f59e0b"] },
  { id: "forest", name: "Forest", colors: ["#3f6212", "#ecfccb", "#f59e0b"] },
  { id: "mono", name: "Graphite", colors: ["#27272a", "#ececee", "#f59e0b"] },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];
export type Mode = "system" | "light" | "dark";

const KEY = "campusfuel.theme.v1";

export function loadTheme(): { palette: PaletteId; mode: Mode } {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { palette: t.palette ?? "teal", mode: t.mode ?? "system" };
  } catch {
    return { palette: "teal", mode: "system" };
  }
}

export function applyTheme(t: { palette: PaletteId; mode: Mode }) {
  const el = document.documentElement;
  if (t.palette === "teal") el.removeAttribute("data-palette");
  else el.setAttribute("data-palette", t.palette);
  if (t.mode === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t.mode);
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
}

/** Runs before the page paints so there's no flash of the wrong theme. */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${KEY}")||"{}");if(t.palette&&t.palette!=="teal")document.documentElement.setAttribute("data-palette",t.palette);if(t.mode&&t.mode!=="system")document.documentElement.setAttribute("data-theme",t.mode)}catch(e){}`;
