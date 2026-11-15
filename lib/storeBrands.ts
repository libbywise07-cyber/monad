// The cheapest brand to grab at each chain (its house brand) and ways to save there.
// House brands are usually the lowest-priced option on the shelf. Names are each chain's
// own store brands; individual stores and regions can carry different lines.

type Aisle = string;
interface Chain {
  match: string[]; // lowercase substrings of the store name
  name: string; // how we refer to the chain
  brand: string; // the house brand to look for
  byAisle?: Record<Aisle, string>; // a different house brand for some aisles
  tips: string[];
}

const KROGER_TIPS = (app: string) => [
  `Clip digital coupons in the ${app} app before you go; they load onto your loyalty card.`,
  "Look for the cheaper Smart Way line on basics like rice, pasta and canned goods.",
];
const ALBERTSONS_TIPS = (app: string) => [
  `Clip deals in the ${app} for U app; many sale prices only apply to members.`,
  "Lucerne (dairy) and Signature Select are usually the lowest-priced brands on the shelf.",
];

const CHAINS: Chain[] = [
  { match: ["walmart"], name: "Walmart", brand: "Great Value", tips: ["Check the Rollback tags and the clearance end caps.", "Great Value is almost always the cheapest option on the shelf."] },
  { match: ["target"], name: "Target", brand: "Good & Gather", tips: ["Use Target Circle in the Target app for weekly food deals.", "Look for Good & Gather and Market Pantry basics."] },
  ...[
    ["fred meyer", "Fred Meyer"],
    ["ralphs", "Ralphs"],
    ["king soopers", "King Soopers"],
    ["qfc", "QFC"],
    ["smith's", "Smith's"],
    ["fry's", "Fry's"],
    ["harris teeter", "Harris Teeter"],
    ["dillons", "Dillons"],
    ["mariano", "Mariano's"],
    ["kroger", "Kroger"],
  ].map(([k, n]) => ({ match: [k], name: n, brand: "Kroger", tips: KROGER_TIPS(n) })),
  ...[
    ["safeway", "Safeway"],
    ["albertsons", "Albertsons"],
    ["vons", "Vons"],
    ["jewel", "Jewel-Osco"],
    ["acme", "Acme"],
    ["shaw's", "Shaw's"],
    ["tom thumb", "Tom Thumb"],
    ["randalls", "Randalls"],
    ["pavilions", "Pavilions"],
  ].map(([k, n]) => ({ match: [k], name: n, brand: "Signature Select", byAisle: { "Dairy & eggs": "Lucerne" }, tips: ALBERTSONS_TIPS(n) })),
  {
    match: ["aldi"],
    name: "Aldi",
    brand: "Aldi brand",
    tips: ["Nearly everything at Aldi is its own brand, so the price on the shelf is already the low one.", "Bring a bag and a quarter for the cart."],
  },
  { match: ["lidl"], name: "Lidl", brand: "Lidl brand", tips: ["Most items are Lidl's own brand; check the Lidl Plus app for weekly coupons."] },
  { match: ["costco"], name: "Costco", brand: "Kirkland Signature", tips: ["Buy in bulk only what you'll finish; split big packs with a roommate.", "Kirkland Signature is usually the best price per ounce."] },
  { match: ["sam's club"], name: "Sam's Club", brand: "Member's Mark", tips: ["Split bulk packs with a roommate so nothing goes to waste."] },
  { match: ["trader joe"], name: "Trader Joe's", brand: "Trader Joe's", tips: ["Almost everything is Trader Joe's brand at one everyday price; no coupons needed."] },
  { match: ["whole foods"], name: "Whole Foods", brand: "365 by Whole Foods Market", tips: ["Stick to the 365 brand; it's the lowest-priced line in the store.", "Prime members get extra sale prices."] },
  { match: ["publix"], name: "Publix", brand: "Publix", tips: ["Plan around the weekly BOGO deals.", "Clip digital coupons in the Publix app."] },
  { match: ["h-e-b", "heb"], name: "H-E-B", brand: "H-E-B", byAisle: { "Canned & jarred": "Hill Country Fare", "Grains & pasta": "Hill Country Fare" }, tips: ["Clip digital coupons in the H-E-B app.", "Hill Country Fare is H-E-B's lowest-priced line."] },
  { match: ["meijer"], name: "Meijer", brand: "Meijer", tips: ["Clip mPerks coupons in the Meijer app."] },
  { match: ["sprouts"], name: "Sprouts", brand: "Sprouts", tips: ["Check the weekly ad; produce sales are often the best deals in the store."] },
  { match: ["winco"], name: "WinCo", brand: "WinCo Foods", tips: ["Use the bulk bins for oats, rice, beans and nuts; you buy only what you need."] },
  { match: ["food lion"], name: "Food Lion", brand: "Food Lion", tips: ["Use the MVP card and app for weekly deals."] },
  { match: ["wegmans"], name: "Wegmans", brand: "Wegmans", tips: ["The Wegmans brand is usually the lowest price on the shelf."] },
  { match: ["hy-vee", "hyvee"], name: "Hy-Vee", brand: "Hy-Vee", tips: ["Check Fuel Saver deals in the Hy-Vee app."] },
  { match: ["stop & shop"], name: "Stop & Shop", brand: "Stop & Shop", tips: ["Clip digital coupons in the Stop & Shop app."] },
  { match: ["giant"], name: "Giant", brand: "Giant", tips: ["Clip digital coupons in the Giant app."] },
  { match: ["natural grocers"], name: "Natural Grocers", brand: "Natural Grocers", tips: ["The Natural Grocers brand is the cheapest line in the store."] },
  { match: ["grocery outlet"], name: "Grocery Outlet", brand: "", tips: ["Brands change every week; grab whatever is cheapest per ounce.", "Check dates on discounted dairy and meat."] },
  { match: ["dollar general"], name: "Dollar General", brand: "Clover Valley", tips: ["Compare price per ounce; small packages can cost more per serving."] },
];

const LOOSE = new Set(["Produce"]); // fruit and veg are usually sold loose, with no brand to pick

function chainOf(storeName: string): Chain | undefined {
  const n = storeName.toLowerCase();
  return CHAINS.find((c) => c.match.some((m) => n.includes(m)));
}

const PLANT = /\b(soy|almond|oat|coconut|rice) (milk|yogurt|creamer)/i;

/** The brand to grab for an item at this store, e.g. "Great Value". Empty when brand doesn't matter. */
export function cheapestBrand(storeName: string | undefined, aisle: string, item = ""): string {
  if (LOOSE.has(aisle)) return "";
  if (!storeName) return "store brand";
  const c = chainOf(storeName);
  if (!c) return "store brand";
  // Aisle-specific dairy brands (e.g. Lucerne) don't make plant milks; use the main house brand.
  if (aisle === "Dairy & eggs" && PLANT.test(item)) return c.brand;
  return c.byAisle?.[aisle] ?? c.brand;
}

/** Store-specific ways to save, plus the general store-brand tip. */
export function savingsTips(storeName: string | undefined): string[] {
  const c = storeName ? chainOf(storeName) : undefined;
  return [
    ...(c?.tips ?? []),
    "Store brands usually cost about 20 to 30% less than name brands for the same kind of product.",
    "Compare the price per ounce on the shelf tag, not the sticker price.",
  ];
}
