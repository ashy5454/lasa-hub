/**
 * Server-side strict catalog matcher — mirrors the rules in
 * lasa-hub/utils/catalogMatch.ts so both sides agree on "did the kirana
 * actually order something this wholesaler sells?".
 *
 * Strict = exact normalized match + synonym group match. No contains.
 *
 * The synonym list is intentionally a SUBSET of the frontend one — only
 * the groups that genuinely interchange (haldi/turmeric/పసుపు etc.). When
 * the frontend dict grows, keep this in lockstep by adding to SYNONYM_GROUPS
 * below. Both dictionaries share the same canonicalization rule (first
 * member of each group is the canonical form).
 */

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,;:!?()'"\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYM_GROUPS: string[][] = [
  ["rice", "chawal", "biyyam", "biyyalu", "akki", "arisi", "annam", "chaaval", "bhaat",
    "చావల్", "బియ్యం", "चावल", "चाँवल", "अरीसी"],
  ["wheat flour", "atta", "godhuma pindi", "gehu ka atta", "atta flour", "whole wheat flour",
    "गेहूं का आटा", "गेहु आटा", "आटा", "గోధుమ పిండి",
    "aashirvaad", "aashirvaad atta", "ashirvaad", "annapurna", "fortune atta", "pillsbury atta"],
  ["maida", "all purpose flour", "refined flour"],
  ["besan", "gram flour", "chickpea flour", "senaga pindi"],
  // Pigeon pea / arhar / toor dal are the same lentil — wholesalers
  // label the bag with whichever name they grew up with. All must be
  // here so the server-side SMS bucketing knows the shop DOES sell it,
  // even when the kirana ordered using a different name.
  ["toor dal", "tur dal", "tuvar dal", "arhar dal", "arhar", "thuvar dal", "toovar dal", "kandi pappu", "pigeon pea", "pigeon peas", "split pigeon pea", "red gram", "तूर दाल", "अरहर दाल", "अरहर", "तुवर दाल", "కంది పప్పు", "తొగరి పప్పు"],
  ["chana dal", "split chickpea", "senaga pappu", "chana", "चना दाल", "శనగ పప్పు"],
  ["moong dal", "mung dal", "moong", "pesara pappu", "मूंग दाल", "పెసర పప్పు"],
  ["urad dal", "urad", "minappappu", "उड़द दाल", "మిన పప్పు"],
  ["masoor dal", "masoor", "red lentil", "मसूर दाल"],
  ["turmeric", "turmeric powder", "haldi", "pasupu", "manjal", "arishina",
    "హల్దీ", "పసుపు", "हल्दी", "हल्दी पाउडर"],
  ["chili powder", "chilli powder", "lal mirch", "mirchi powder", "karam podi", "mirapakaya podi",
    "लाल मिर्च", "लाल मिर्च पाउडर", "मिर्ची", "మిర్చి పొడి", "మిరపకాయ పొడి"],
  ["coriander powder", "dhaniya", "dhania", "dhania powder", "kothimeera podi", "धनिया", "ధనియాల పొడి"],
  ["cumin", "jeera", "jilakara", "jilakarra", "जीरा", "జీలకర్ర"],
  ["cumin powder", "jeera powder", "jilakara podi", "जीरा पाउडर"],
  ["mustard seeds", "rai", "sarso", "avalu", "kadugu"],
  ["fenugreek seeds", "methi", "methi seeds", "menthulu"],
  ["sugar", "cheeni", "chini", "shakkar", "chakkara", "panchasara", "चीनी", "शक्कर", "చక్కెర"],
  ["salt", "namak", "uppu", "नमक", "ఉప్పు"],
  ["sunflower oil", "surajmukhi tel", "soorya kanthi tel", "सूरजमुखी तेल", "పొద్దుతిరుగుడు నూనె"],
  ["coconut oil", "nariyal tel", "kobbari noone", "नारियल तेल", "కొబ్బరి నూనె"],
  ["mustard oil", "sarson tel", "avalu noone", "सरसों तेल"],
  ["groundnut oil", "peanut oil", "moongphali tel", "मूंगफली तेल"],
  ["onion", "pyaaz", "ulli", "kanda", "vengayam"],
  ["potato", "aloo", "alu", "bangaladumpa"],
  ["tomato", "tamatar"],
  ["ginger garlic paste", "adrak lehsun paste", "allam vellulli paste"],
  ["milk", "doodh", "paalu", "दूध", "పాలు"],
  ["curd", "yogurt", "dahi", "perugu", "दही", "పెరుగు"],
  ["tea", "tea powder", "chai", "chai patti", "tea patti", "चाय", "चाय पत्ती", "టీ"],
  // Sweeteners — jaggery has more names than almost anything else in
  // Indian groceries. Wholesalers will write "Gur", "Jaggery", or the
  // local name interchangeably. Same canonical group catches them all.
  ["jaggery", "gur", "gud", "bellam", "vellam", "vellam jaggery", "गुड़", "बेलम", "బెల్లం"],
  // Ghee — likewise. "Cow ghee" / "Pure ghee" / "Desi ghee" are the
  // same thing for OTP matching purposes.
  ["ghee", "pure ghee", "cow ghee", "desi ghee", "neyyi", "neyi", "नेय्यि", "घी", "नेय्यी", "నెయ్యి", "ఆవు నెయ్యి"],
];

const variantToCanonical = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = norm(group[0]);
  for (const variant of group) variantToCanonical.set(norm(variant), canonical);
}

function sameItem(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const cA = variantToCanonical.get(norm(a));
  const cB = variantToCanonical.get(norm(b));
  return !!cA && cA === cB;
}

export interface MatchableRow {
  name: string;
  nameTe?: string | null;
  nameHi?: string | null;
}

/**
 * Returns true if `query` is an exact-or-synonym match for at least one
 * row in `catalog`. Mirrors the strict frontend matcher.
 */
export function isItemInCatalog<T extends MatchableRow>(
  catalog: readonly T[],
  query: string | null | undefined,
  queryTe?: string | null,
  queryHi?: string | null,
): T | undefined {
  const raw = [query, queryTe, queryHi].filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  if (raw.length === 0 || catalog.length === 0) return undefined;
  const keys = raw.map(norm);

  // 1. Exact normalized
  for (const k of keys) {
    const hit = catalog.find((c) =>
      norm(c.name) === k ||
      (c.nameTe != null && norm(c.nameTe) === k) ||
      (c.nameHi != null && norm(c.nameHi) === k),
    );
    if (hit) return hit;
  }
  // 2. Synonym
  for (const cand of raw) {
    const hit = catalog.find((c) =>
      sameItem(cand, c.name) ||
      sameItem(cand, c.nameTe ?? "") ||
      sameItem(cand, c.nameHi ?? ""),
    );
    if (hit) return hit;
  }
  // 3. "Qualified" match — kirana wrote a more specific name than the
  //    catalog (e.g. "Cotton wicks (for lamps)" vs "Cotton Wicks"). Safe
  //    in this direction only; see frontend catalogMatch.ts for the
  //    longer rationale. Mirrors that logic byte-for-byte so SMS and
  //    UI agree on what's fulfilled.
  for (const c of catalog) {
    const catNames = [c.name, c.nameTe, c.nameHi].filter(
      (n): n is string => !!n && !!n.trim(),
    );
    for (const cname of catNames) {
      const catWords = norm(cname).split(" ").filter(Boolean);
      if (catWords.length === 0) continue;
      if (catWords.length === 1 && catWords[0].length < 4) continue;
      for (const userKey of keys) {
        const userWords = new Set(userKey.split(" ").filter(Boolean));
        if (catWords.every((w) => userWords.has(w))) {
          return c;
        }
      }
    }
  }
  return undefined;
}
