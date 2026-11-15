# CampusFuel 🎓🥗

**Meal plans that fit your class schedule.** CampusFuel is a meal planner for college students who don't have time to sit down for three meals a day. You tell it your schedule, kitchen, diet, goals, budget, and what's already in your fridge. It builds a week of meals timed to your real free time, plus a grocery list and the stores near you.

Built for the Monad hackathon.

## What it does

During sign-up (all editable later), students enter:

| Step | What we ask | How the plan uses it |
|---|---|---|
| About you | Age, height, weight, activity | Estimates calories and protein (Mifflin–St Jeor) |
| Goals | Energy/focus, lose, maintain, build muscle, athletic performance, health goals, optional custom macros | Daily calorie and macro targets |
| Diet | Vegetarian, vegan, pescatarian, halal, kosher, 9 common allergens, disliked foods | Recipes that break a rule are never used |
| Kitchen | Dorm, apartment, sorority/frat house or home; appliances; cooking skill; max cook time; dining hall swipes | Dorm with only a microwave gets microwave meals; swipes are used on long breaks |
| Schedule | Classes, work, practice and study blocks; wake and sleep times | Meals go **only in free windows**. Short breaks get portable or prep-ahead meals, and long gaps get snacks |
| Budget & location | Weekly grocery budget, address | Stays under budget and finds nearby grocery stores (OpenStreetMap) with price tiers |
| Pantry | 📸 **Photo of your fridge/pantry**, scanned by AI, or typed in | Meals use what you already have, and those items drop off the grocery list |

The dashboard has these tabs:
- **Day:** a timeline of classes and meals, with macro progress bars and recipes
- **Week:** an overview of all seven days
- **Groceries:** a checklist grouped by aisle, the cost against your budget, and nearby stores
- **Pantry:** rescan your fridge and rebuild the plan
- **Profile:** edit any part of your sign-up answers

## How it works

- **AI planner** (`app/api/plan`): sends your profile, computed free windows and macro targets to Claude. Claude returns a structured 7-day plan, validated with Zod.
- **Rule-based planner** (`lib/planner.ts`): works offline and is the automatic fallback. It finds free windows, places meals near ideal times, and scores ~30 student-friendly recipes on diet, appliances, skill, time, pantry overlap, cost and protein.
- **Pantry scanner** (`app/api/scan`): Claude vision turns fridge photos into a structured ingredient list.
- **Store finder** (`app/api/stores`): Nominatim geocoding plus an Overpass query for supermarkets within ~3 miles. No API key needed.
- Your profile and plan stay in your browser (localStorage). There's no account server.

**Stack:** Next.js 15, React 19, TypeScript, Anthropic SDK, Zod.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for AI plans + photo scanning
npm run dev                  # http://localhost:3000
```

The app works without an API key. You get the rule-based planner, and the AI photo scan is turned off.

## Roadmap

- Monad integration: save your plan on Monad and earn rewards for meal-prep streaks
- Swap a single meal, plus calendar (.ics) import and export
- Live grocery prices from store APIs
