"use client";
import Link from "next/link";
import { useStored } from "@/lib/store";

const FEATURES = [
  ["🗓️", "Plans around your classes", "Add your class, work and practice blocks. Meals land in your real free time, with grab-and-go options for back-to-back days."],
  ["🥗", "Your diet and goals", "Allergies, vegan or halal, macro targets, more energy or muscle gain. Every meal follows your rules."],
  ["🏠", "Dorm, apartment or Greek house", "Only a microwave and mini fridge? Recipes adjust to your appliances, skill level and dining hall swipes."],
  ["📸", "Scan your fridge", "Snap your pantry and fridge. AI finds what you already have and builds meals around it."],
  ["💸", "Stays on budget", "Set a weekly budget and get one grocery list with estimated costs."],
  ["📍", "Stores near you", "Enter your address to see nearby grocery stores, sorted by distance and price."],
];

export default function Home() {
  const { profile } = useStored();
  const returning = Boolean(profile?.name);
  return (
    <main className="wrap">
      <nav className="row between">
        <Link href="/" className="brand">
          Campus<span>Fuel</span>
        </Link>
        {returning ? (
          <Link href="/dashboard" className="btn sm">
            My plan →
          </Link>
        ) : null}
      </nav>
      <section className="hero">
        <span className="tag">For students who don&apos;t have time to eat</span>
        <h1 style={{ marginTop: 14 }}>
          Meal plans that fit
          <br />
          your class schedule.
        </h1>
        <p className="lead">
          Tell CampusFuel your schedule, kitchen, diet, budget and what&apos;s in your fridge. You get a week of meals
          timed to your actual breaks, with a grocery list to match.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link href={returning ? "/dashboard" : "/onboarding"} className="btn primary">
            {returning ? `Welcome back, ${profile?.name} →` : "Build my plan (3 min) →"}
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
          <div key={t} className="card feature">
            <div className="ic">{ic}</div>
            <div>
              <h3>{t}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
