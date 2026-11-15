"use client";
import { useEffect, useState } from "react";
import { applyTheme, loadTheme, PALETTES, type Mode, type PaletteId } from "@/lib/theme";

export default function ThemePicker() {
  const [t, setT] = useState<{ palette: PaletteId; mode: Mode }>({ palette: "teal", mode: "system" });
  useEffect(() => setT(loadTheme()), []);
  const set = (next: Partial<typeof t>) => {
    const v = { ...t, ...next };
    setT(v);
    applyTheme(v);
  };
  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Theme</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Color theme">
        {PALETTES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={t.palette === p.id} className={`theme-swatch ${t.palette === p.id ? "on" : ""}`} onClick={() => set({ palette: p.id })}>
            <span className="dots">
              {p.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="chips" role="radiogroup" aria-label="Light or dark">
        {(["system", "light", "dark"] as Mode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={t.mode === m} className={`chip ${t.mode === m ? "on" : ""}`} onClick={() => set({ mode: m })}>
            {m === "system" ? "Match my device" : m === "light" ? "☀️ Light" : "🌙 Dark"}
          </button>
        ))}
      </div>
    </div>
  );
}
