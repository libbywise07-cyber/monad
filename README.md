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

## Calendar sync

On the Schedule step you can **Connect Google Calendar** or **Connect Outlook**. You review the events found (repeating classes, shifts and practices are pre-checked; meals and one-time events are not), and the checked ones become busy time in your plan.

**Works with no setup:** students paste their calendar's *Secret address in iCal format* (Google Calendar → Settings → their calendar → Integrate calendar). `app/api/ics` downloads that feed (only from `calendar.google.com` and Outlook hosts) and `lib/server/ics.ts` expands it. It handles weekly and daily repeats, skipped dates, moved or cancelled classes, and time zones. The link is saved only in the browser, and the prep picker uses it to check live busy times.

**Automatic sync:** with the private link connected, the dashboard re-reads the calendar on open, when the tab regains focus, and every 15 minutes (`components/CalendarSync.tsx`, `lib/calendarSync.ts`). Moved events are updated, new repeating events are added and deleted ones are removed. Events the student unchecked and blocks they typed themselves are left alone. If anything changed, the meal plan rebuilds and keeps the prep time the student picked. There's no server, so syncing only happens while the app is open; Google can also take a few hours to publish changes to the link.

**Private or school calendars without a secret address** (some school admins turn it off): students can upload Google Calendar's export (Settings → Import & export → Export, a .zip of .ics files). It is unzipped and read in the browser (`importFromFiles` in `lib/googleCalendar.ts`) and never sent to the server. The next two months of busy times are saved so prep suggestions avoid one-off events too.

**Optional, Google sign-in:** once `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set, the button uses real Google sign-in instead of the pasted link. Sign-in happens in the browser with Google Identity Services and the read-only `calendar.readonly` scope. The app reads the next two weeks from your visible calendars, groups repeating events into weekly blocks, and keeps nothing on a server (`lib/googleCalendar.ts`).
**Meal prep times:** on the Day tab, **Pick a prep time** suggests up to six slots in the next week. They fit your free windows, weekend afternoons come first, and with Google connected they're checked against your live calendar (`freeBusy`), so one-off events like exams count. You can also choose your own time. **Add to Google Calendar** creates the event on your main calendar, with the prep tasks and a 30-minute reminder, using the `calendar.events` scope; Google asks for this permission the first time. Without a client ID, it opens Google Calendar with the event pre-filled instead.

Set up Google (about 5 minutes):
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then go to **APIs & Services → Library** and enable **Google Calendar API**.
2. Go to **OAuth consent screen**: choose *External*, fill in the app name and your email, add the scopes `.../auth/calendar.readonly` and `.../auth/calendar.events`, and add your Google account under **Test users**.
3. Go to **Credentials → Create credentials → OAuth client ID**: choose *Web application* and add `http://localhost:3000` (and your deployed URL) under **Authorized JavaScript origins**.
4. Put the client ID in `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...` and restart `npm run dev`.

Still demo only, labeled "Demo preview": **Outlook**, and adding planned meals to a "CampusFuel Meals" calendar. Screenshots are in [`mockups/`](mockups/). Outlook needs an app in Microsoft Entra ID with Microsoft Graph `Calendars.Read`. Writing meals would need Google's `calendar.app.created` scope or Graph `Calendars.ReadWrite`.

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
