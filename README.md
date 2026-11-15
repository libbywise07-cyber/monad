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
- **Profile:** edit any part of your sign-up answers, see why your targets are what they are, pick a theme, and un-hide meals

More features:
- **Activity-aware calories:** add daily steps and workouts (lifting, running, practice…) with intensity. Calories burned are added on the days you train.
- **Travel time:** minutes to get to each class or shift count as busy, so meals never land while you're walking.
- **Why these numbers:** a plain-language breakdown of calories (resting, everyday movement, workouts, goal) and of protein, carbs and fat.
- **Meal feedback:** "↻ New meal" swaps a single meal. "Don't show again" asks what was wrong (taste, an ingredient, too long, not filling), hides the meal, and future plans learn from it.
- **Grocery page:** pick which of your stores you're shopping at, check items off (remembered), copy the list, open each item on that store's own website, and get bus, walk, bike or drive directions.
- **Skip for now** on any sign-up step, and **6 color themes** with light and dark mode.

## Calendar file import (real, no sign-in)

On the Schedule step, **Import a calendar file (.ics)** reads a file exported from Google Calendar, Outlook, Canvas or Apple Calendar. Weekly repeating events become schedule blocks (classes, shifts and practices are pre-checked); finished terms and all-day events are skipped. The file is read in the browser and never uploaded. Try it with [`mockups/sample-calendar.ics`](mockups/sample-calendar.ics).

## Calendar sync (mockup)

On the Schedule step you can **Connect Google Calendar** or **Connect Outlook**. You then approve read-only access, review the events found (classes, shifts and practices are pre-checked; meals and one-time events are not), and they become busy time in your plan. After connecting, the Day tab can preview your meals as events on a separate "CampusFuel Meals" calendar.

**This is a clickable mockup with sample events.** No real account is connected, and every screen is labeled "Demo preview". Screenshots are in [`mockups/`](mockups/).

To make it real:
- **Google:** create an OAuth client in Google Cloud and enable the Calendar API. Request the `calendar.readonly` scope to read events, and add `calendar.app.created` to create the meals calendar.
- **Outlook:** register an app in Microsoft Entra ID and use Microsoft Graph with `Calendars.Read`, plus `Calendars.ReadWrite` to add meals.
- Swap the sample events in `components/CalendarConnect.tsx` for the API response, keeping only recurring events.

## How it works

- **AI planner** (`app/api/plan`): sends your profile, computed free windows and macro targets to Claude. Claude returns a structured 7-day plan, validated with Zod.
- **Rule-based planner** (`lib/planner.ts`): works offline and is the automatic fallback. It finds free windows, places meals near ideal times, and scores ~30 student-friendly recipes on diet, appliances, skill, time, pantry overlap, cost and protein.
- **Pantry scanner** (`app/api/scan`): Claude vision turns fridge photos into a structured ingredient list.
- **Dining halls** (`lib/server/dining.ts`, `app/api/dining`): reads real dining hall menus with nutrition and allergen info from Nutrition Addition (e.g. University of Oregon) and Nutrislice (about 50 colleges listed in `lib/dining/schools.ts`, and any other Nutrislice school via a pasted link). Other menu pages can be read by Claude with an API key. `lib/dining/pick.ts` builds the healthiest plate for each dining meal based on the student's goal, diet and allergies. Students type their school, and `lib/server/planLookup.ts` has Claude search the web for how that school's plan works: swipes or points, what the points are called, a term balance or a weekly allowance, prices, and the term end date. It also finds the menu link. This needs an API key, and students can always edit the results. A term balance is split evenly over the weeks left; a weekly allowance is used up each week. Everything is tracked on the **Dining** tab.
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
