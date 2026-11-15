"use client";
import { useRef, useState } from "react";
import type { PantryItem } from "@/lib/types";

type Media = "image/jpeg";

async function fileToJpeg(file: File, maxDim = 1568): Promise<{ data: string; mediaType: Media; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { data: dataUrl.split(",")[1], mediaType: "image/jpeg", preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PantryEditor({ value, onChange }: { value: PantryItem[]; onChange: (v: PantryItem[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState("");

  const merge = (items: PantryItem[]) => {
    const have = new Set(value.map((v) => v.name.toLowerCase()));
    onChange([...value, ...items.filter((i) => i.name && !have.has(i.name.toLowerCase()))]);
  };

  const scan = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    setBusy(true);
    try {
      const imgs = await Promise.all([...files].slice(0, 4).map((f) => fileToJpeg(f)));
      setPreviews(imgs.map((i) => i.preview));
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: imgs.map(({ data, mediaType }) => ({ data, mediaType })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scan failed");
      merge(json.items);
      if (!json.items.length) setErr("Couldn't spot any food. Try a brighter, closer photo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addManual = () => {
    const items = manual
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name: name.toLowerCase() }));
    merge(items);
    setManual("");
  };

  return (
    <div className="stack">
      <div className="drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
        {busy ? (
          <div className="row" style={{ justifyContent: "center" }}>
            <div className="spinner" /> Scanning your food…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 28 }}>📸</div>
            <b>Snap or upload photos of your fridge and pantry</b>
            <div className="muted small">Up to 4 photos. AI picks out what you already have.</div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => scan(e.target.files)} />
      </div>
      {previews.length ? (
        <div className="thumbs">
          {previews.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p} alt={`pantry photo ${i + 1}`} />
          ))}
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}

      <div>
        <label>Or type items (comma separated)</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input value={manual} placeholder="eggs, rice, peanut butter, spinach" onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManual()} />
          <button type="button" className="btn sm" onClick={addManual}>
            Add
          </button>
        </div>
      </div>

      {value.length ? (
        <div className="chips">
          {value.map((it) => (
            <span key={it.name} className="chip on" style={{ cursor: "default" }}>
              {it.name}
              {it.quantity ? <span className="muted"> · {it.quantity}</span> : null}{" "}
              <button type="button" className="btn ghost sm" style={{ padding: "0 4px" }} onClick={() => onChange(value.filter((v) => v.name !== it.name))} aria-label={`Remove ${it.name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">Your pantry is empty. That&apos;s fine, we&apos;ll build the plan from scratch.</p>
      )}
    </div>
  );
}
