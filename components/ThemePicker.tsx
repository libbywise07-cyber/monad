"use client";
import { useEffect, useState } from "react";
import { applyTheme, loadTheme, PALETTES, type PaletteId } from "@/lib/theme";

export default function ThemePicker() {
  const [palette, setPalette] = useState<PaletteId>("cocoa");
  useEffect(() => setPalette(loadTheme().palette), []);
  const pick = (id: PaletteId) => {
    setPalette(id);
    applyTheme({ palette: id });
  };
  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Theme</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Color theme">
        {PALETTES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={palette === p.id} className={`theme-swatch ${palette === p.id ? "on" : ""}`} onClick={() => pick(p.id)}>
            <span className="dots">
              {p.colors.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
