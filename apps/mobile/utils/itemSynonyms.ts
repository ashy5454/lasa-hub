/**
 * Cross-language synonym groups for common Indian grocery items.
 *
 * Every variant inside a group is treated as the same item, regardless of
 * script (English / Hindi / Telugu) or colloquialism. This lets a kirana
 * order "haldi" against a wholesaler whose catalog says "Turmeric" or
 * "పసుపు" and still get a stock match.
 *
 * The list is intentionally curated, not auto-generated, because precision
 * matters more than coverage — a wrong synonym (e.g. matching "atta" to
 * "rice flour") would silently mis-match orders and is much worse than a
 * miss.
 *
 * Add new groups as you discover gaps. Each group should be small and
 * tight — only put items in the same group if they are genuinely
 * interchangeable in a kirana's order.
 */

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,;:!?()'"\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYNONYM_GROUPS: string[][] = [
  // ===== Grains =====
  ["rice", "chawal", "biyyam", "biyyalu", "akki", "arisi", "annam", "chaaval", "bhaat",
    "చావల్", "బియ్యం", "चावल", "चाँवल", "अरीसी"],
  ["basmati rice", "basmati", "basmati chawal", "basmati biyyam", "बासमती चावल", "బాస్మతి బియ్యం"],
  ["sona masuri", "sona masoori", "సోనా మసూరి"],
  ["wheat", "gehu", "gehoon", "godhuma", "godhumalu", "gandum", "गेहूं", "గోధుమ"],
  // Wheat flour. "Aashirvaad" and other common brand names are folded in so
  // a kirana asking "atta" hits a wholesaler row called "Aashirvaad Atta"
  // and vice versa.
  ["wheat flour", "atta", "godhuma pindi", "gehu ka atta", "atta flour", "whole wheat flour",
    "गेहूं का आटा", "गेहु आटा", "आटा", "గోధుమ పిండి",
    "aashirvaad", "aashirvaad atta", "ashirvaad", "annapurna", "fortune atta", "pillsbury atta"],
  ["maida", "all purpose flour", "refined flour", "maida flour", "white flour"],
  ["sooji", "rava", "semolina", "upma rava", "bombay rava", "bansi rava"],
  ["rice flour", "biyyam pindi", "chawal ka atta"],
  ["besan", "gram flour", "chickpea flour", "senaga pindi", "senagapindi"],
  ["oats", "oatmeal", "rolled oats"],
  ["poha", "atukulu", "flattened rice", "beaten rice", "chivda"],

  // ===== Dals & lentils =====
  // Toor dal goes by many names depending on language and form. Both
  // "pigeon pea" AND "split pigeon pea" must be here — wholesalers
  // commonly label the bag with just the short form. The missing
  // "pigeon pea" entry caused real orders to be SMS'd as "shop doesn't
  // sell this" when the shop had 20kg stocked. Added arhar / red gram /
  // Telugu తొగరి పప్పు too.
  ["toor dal", "tur dal", "tuvar dal", "arhar dal", "arhar", "thuvar dal", "toovar dal", "kandi pappu", "kandipappu", "pigeon pea", "pigeon peas", "split pigeon pea", "red gram", "तूर दाल", "अरहर दाल", "अरहर", "तुवर दाल", "కంది పప్పు", "తొగరి పప్పు"],
  ["chana dal", "split chickpea", "senaga pappu", "senagapappu", "chana", "चना दाल", "सेनगा पप्पु", "శనగ పప్పు"],
  ["moong dal", "mung dal", "moong", "pesara pappu", "pesarapappu", "split green gram", "मूंग दाल", "पेसरा पप्पु", "పెసర పప్పు"],
  ["urad dal", "urad", "minappappu", "mina pappu", "split black gram", "उड़द दाल", "మిన పప్పు"],
  ["masoor dal", "masoor", "red lentil", "pink lentil", "मसूर दाल", "మసూర్ పప్పు"],
  ["rajma", "kidney beans"],
  ["chickpeas", "kabuli chana", "white chickpeas", "garbanzo", "senagalu"],
  ["black chickpeas", "kala chana", "brown chickpeas"],

  // ===== Spices =====
  ["turmeric", "turmeric powder", "haldi", "haldi powder", "pasupu", "pasupu podi", "manjal", "manjal podi", "arishina",
    "హల్దీ", "పసుపు", "పసుపు పొడి", "हल्दी", "हल्दी पाउडर", "ಅರಿಶಿನ"],
  ["chili powder", "chilli powder", "lal mirch", "lal mirch powder", "mirchi powder", "karam podi", "karam", "mirapakaya podi", "mirchi",
    "लाल मिर्च", "लाल मिर्च पाउडर", "मिर्ची", "మిర్చి పొడి", "మిరపకాయ పొడి", "కారం"],
  ["coriander powder", "dhaniya", "dhaniya powder", "dhania", "dhania powder", "kothimeera podi", "धनिया", "धनिया पाउडर", "ధనియాల పొడి"],
  ["cumin", "jeera", "jeera seeds", "jilakara", "jilakarra", "जीरा", "जीरा बीज", "జీలకర్ర"],
  ["cumin powder", "jeera powder", "jilakara podi", "जीरा पाउडर", "జీలకర్ర పొడి"],
  ["mustard seeds", "rai", "sarso", "avalu", "avalu ginjalu", "kadugu"],
  ["fenugreek seeds", "methi", "methi seeds", "menthulu", "menthi"],
  ["fenugreek leaves", "kasuri methi", "methi leaves"],
  ["black pepper", "kali mirch", "miriyalu", "milagu"],
  ["cardamom", "elaichi", "elakkay", "yelakulu", "elakulu"],
  ["cloves", "laung", "lavangam", "lavangalu"],
  ["cinnamon", "dalchini", "lavangapatta", "pattai"],
  ["bay leaf", "tej patta", "bayleaf"],
  ["asafoetida", "hing", "inguva", "perungayam"],
  ["garam masala", "garam masala powder"],
  ["sambar powder", "sambar masala"],
  ["rasam powder", "rasam masala", "charu podi"],

  // ===== Oils & ghee =====
  ["oil", "tel", "noone", "nune", "ennai", "तेल", "నూనె"],
  ["sunflower oil", "surajmukhi tel", "poddu tirugudu noone", "soorya kanthi tel", "सूरजमुखी तेल", "పొద్దుతిరుగుడు నూనె"],
  ["groundnut oil", "peanut oil", "moongphali tel", "verusenaga noone", "palli noone", "मूंगफली तेल", "వేరుశెనగ నూనె"],
  ["mustard oil", "sarson tel", "avalu noone", "सरसों तेल", "ఆవ నూనె"],
  ["coconut oil", "nariyal tel", "kobbari noone", "kobbari nune", "नारियल तेल", "కొబ్బరి నూనె"],
  ["sesame oil", "til tel", "nuvvula noone", "gingelly oil"],
  ["ghee", "neyyi", "desi ghee", "clarified butter"],
  ["butter", "makhan", "venna"],

  // ===== Sugar & sweeteners =====
  ["sugar", "cheeni", "chini", "shakkar", "chakkara", "panchasara", "patika belam", "चीनी", "शक्कर", "చక్కెర", "పంచదార"],
  ["jaggery", "gur", "gud", "bellam", "vellam", "गुड़", "बेलम", "బెల్లం"],
  ["honey", "shahad", "tene", "शहद", "తేనె"],

  // ===== Salt =====
  ["salt", "namak", "uppu", "uppu salt", "नमक", "ఉప్పు"],
  ["rock salt", "sendha namak", "saindhava lavanam"],

  // ===== Vegetables & herbs =====
  ["onion", "pyaaz", "ulli", "ulligadda", "kanda", "vengayam"],
  ["potato", "aloo", "alu", "bangaladumpa", "urulai"],
  ["tomato", "tamatar", "tamota"],
  ["garlic", "lehsun", "vellulli", "poondu"],
  ["ginger", "adrak", "allam", "inji"],
  ["ginger garlic paste", "adrak lehsun paste", "allam vellulli paste", "ginger garlic"],
  ["green chili", "green chilli", "hari mirch", "pacchi mirapakaya", "pacchi mirchi"],
  ["coriander leaves", "dhania leaves", "kothimeera", "cilantro"],
  ["curry leaves", "kari patta", "karivepaku"],
  ["lemon", "nimbu", "nimmakaya", "elumichai"],
  ["mint", "pudina"],
  ["spinach", "palak", "palakura"],

  // ===== Dairy & eggs =====
  ["milk", "doodh", "paalu", "paal", "दूध", "పాలు"],
  ["curd", "yogurt", "dahi", "perugu", "thayir", "दही", "పెరుగు"],
  ["paneer", "cottage cheese"],
  ["egg", "anda", "kodi guddu", "guddu"],

  // ===== Tea / coffee =====
  ["tea", "tea powder", "chai", "chai patti", "tea patti", "tee", "चाय", "चाय पत्ती", "टी पाउडर", "టీ", "టీ పొడి"],
  ["coffee", "coffee powder", "filter coffee"],

  // ===== Snacks & packaged =====
  ["biscuits", "biscuit", "parle g", "parle-g", "marie", "marie biscuit", "good day", "bourbon", "treat", "monaco"],
  ["maggi", "maggi noodles", "instant noodles", "noodles"],
  ["bread", "double roti", "pav", "rotti"],
  ["balaji chips", "balaji", "chips", "potato chips"],
  ["lays", "lays chips"],

  // ===== Cleaning & toiletries =====
  ["soap", "saabun", "sabun"],
  ["bath soap", "bathing soap", "nahane ka sabun"],
  ["detergent", "washing powder", "detergent powder", "kapde dhone ka powder", "surf", "tide", "ariel", "ghadi"],
  ["dish wash", "dish soap", "vim", "pril", "bartan dhone ka sabun"],
  ["shampoo"],
  ["hair oil", "balon ka tel", "talanune"],
  ["toothpaste", "manjan", "colgate", "dant manjan"],
  ["toothbrush", "brush"],
  ["razor", "shaving razor"],
  ["shaving cream", "shave cream", "shaving gel"],

  // ===== Misc condiments =====
  ["tamarind", "imli", "chinta pandu", "puli"],
  ["vinegar", "sirka"],
  ["soy sauce"],
  ["ketchup", "tomato ketchup", "tomato sauce"],
];

// Build fast lookup: any variant → the canonical (first member) of its group.
const variantToCanonical = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = norm(group[0]);
  for (const variant of group) variantToCanonical.set(norm(variant), canonical);
}

/**
 * Canonical name for the synonym group this string belongs to.
 * Returns the input itself (normalized) if no group matches.
 */
export function canonicalize(name: string): string {
  const n = norm(name);
  return variantToCanonical.get(n) ?? n;
}

/**
 * Are these two item names equivalent — same item across language /
 * colloquialism / casing / whitespace / punctuation?
 */
export function sameItem(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const cA = variantToCanonical.get(norm(a));
  const cB = variantToCanonical.get(norm(b));
  // Both must be in some synonym group AND it must be the SAME group.
  return !!cA && cA === cB;
}
