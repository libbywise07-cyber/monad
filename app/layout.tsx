import type { Metadata, Viewport } from "next";
import { Outfit, Unbounded } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Clean rounded sans for the interface; Unbounded (wide, modern) for the logo and big headlines.
const ui = Outfit({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Unbounded({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "CampusFuel — meal plans that fit your class schedule",
  description:
    "AI meal planning for college students: plans around your classes, kitchen, diet, budget and what's already in your fridge.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4efe6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets data-palette before React hydrates, so there's no flash of the wrong colors.
    <html lang="en" className={`${ui.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
