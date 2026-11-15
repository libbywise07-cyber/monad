"use client";
import Link from "next/link";
import { useStored } from "@/lib/store";
import Icon, { type IconName } from "@/components/Icons";

const FEATURES: [IconName, string, string][] = [
  ["calendar", "Plans around your classes", "Add your class, work and practice blocks. Meals land in your real free time, with grab-and-go options for back-to-back days."],
  ["leaf", "Your diet and goals", "Allergies, vegan or halal, macro targets, more energy or muscle gain. Every meal follows your rules."],
  ["home", "Dorm, apartment or Greek house", "Only a microwave and mini fridge? Recipes adjust to your appliances, skill level and dining hall swipes."],
  ["camera", "Scan your fridge", "Snap your pantry and fridge. AI finds what you already have and builds meals around it."],
  ["wallet", "Stays on budget", "Set a weekly budget and get one grocery list with estimated costs."],
  ["pin", "Stores near you", "Enter your address to see nearby grocery stores, sorted by distance and price."],
];

export default function Home() {
  const { profile } = useStored();
  const returning = Boolean(profile?.name);
  return (
    <main className="wrap">
      <nav className="row between">
        <Link href="/" className="brand" aria-label="CampusFuel home">
          campus<span>fuel</span>
        </Link>
        {returning ? (
          <Link href="/dashboard" className="btn sm">
            My plan →
          </Link>
        ) : null}
      </nav>
      <section className="hero">
        <span className="sticker">for students who don&apos;t have time to eat</span>
        <h1 style={{ marginTop: 14 }}>
          meal plans that fit your <mark>class schedule</mark>
        </h1>
        <p className="lead">
          Drop in your schedule, kitchen, diet, budget and what&apos;s in your fridge. Get a week of meals that actually fit
          between classes, the healthiest picks at your dining hall, and a grocery list that won&apos;t wreck your budget.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link href={returning ? "/dashboard" : "/onboarding"} className="btn primary">
            {returning ? `welcome back, ${profile?.name} →` : "build my plan · 3 min →"}
          </Link>
          {returning ? (
            <Link href="/onboarding" className="btn">
              Edit my profile
            </Link>
          ) : null}
        </div>
      </section>
      <section className="grid g2">
        {FEATURES.map(([ic, t, d]) => (
          <div key={t} className="feature">
            <div className="ic">
              <Icon name={ic} />
            </div>
            <div>
              <h3>{t}</h3>
              <p className="small" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
