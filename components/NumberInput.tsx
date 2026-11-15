"use client";
import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** allow decimals like 12.50 (default: whole numbers only) */
  decimals?: boolean;
};

/**
 * A number box you can clear and retype. A plain number input bound to a number turns an
 * empty box into 0, so typing "130" showed "0130". This keeps what you type as text, saves
 * the number whenever it's valid, and tidies up (clamps to min/max) when you leave the box.
 */
export default function NumberInput({ value, onChange, min, max, decimals = false, onBlur, ...rest }: Props) {
  const [text, setText] = useState(String(value));

  // follow outside changes (e.g. loading a saved profile) unless the box already shows that number
  useEffect(() => {
    if (text === "" || Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, "");
        const cleaned = raw.replace(/^0+(?=\d)/, ""); // no leading zeros
        setText(cleaned);
        if (cleaned !== "" && cleaned !== "." && Number.isFinite(Number(cleaned))) onChange(Number(cleaned));
      }}
      onBlur={(e) => {
        const n = text === "" || text === "." ? value : Number(text);
        const fixed = clamp(Number.isFinite(n) ? n : value);
        setText(String(fixed));
        if (fixed !== value) onChange(fixed);
        onBlur?.(e);
      }}
    />
  );
}
