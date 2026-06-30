import { useLanguage } from "@/context/LanguageContext";

/**
 * All hardcoded wholesaler-side strings in one place, in three languages.
 * Centralizing here means every screen (tab bar, my stock, insights,
 * settings, order detail) reads the same key — no more English leaks
 * when the user picked Hindi or Telugu.
 *
 * Add new keys here as you find untranslated text. Both `hi` and `te`
 * MUST be provided — `en` falls through as the default.
 */
type Lang = "en" | "hi" | "te";

const STRINGS = {
  // Tab bar
  tabOrders:    { en: "Orders",   hi: "ऑर्डर",       te: "ఆర్డర్‌లు" },
  tabMyStock:   { en: "My Stock", hi: "मेरा स्टॉक",  te: "నా స్టాక్" },
  tabInsights:  { en: "Insights", hi: "जानकारी",     te: "విశ్లేషణ" },
  tabSettings:  { en: "Settings", hi: "सेटिंग्स",    te: "సెట్టింగ్‌లు" },

  // My Stock page headers
  myStock:      { en: "My Stock", hi: "मेरा स्टॉक", te: "నా స్టాక్" },
  scanList:     { en: "Scan price list", hi: "लिस्ट स्कैन करें", te: "జాబితా స్కాన్ చేయండి" },
  scanListSub:  { en: "Take a photo of your written list — we'll read it", hi: "अपनी लिखी लिस्ट की फोटो लें — हम पढ़ लेंगे", te: "మీ జాబితా ఫోటో తీయండి — మేము చదువుతాము" },
  addOneItem:   { en: "Add one item", hi: "एक आइटम जोड़ें", te: "ఒక ఐటెం జోడించండి" },
  editItem:     { en: "Edit item", hi: "आइटम बदलें", te: "ఐటెం మార్చండి" },
  itemNamePh:   { en: "Item name (e.g. Rice)", hi: "आइटम का नाम (जैसे चावल)", te: "ఐటెం పేరు (ఉదా. బియ్యం)" },
  unit:         { en: "Unit", hi: "मात्रा", te: "యూనిట్" },
  pricePerUnit: { en: "Price (₹ per", hi: "कीमत (₹ प्रति", te: "ధర (₹ ప్రతి" },
  stock:        { en: "Stock (", hi: "स्टॉक (", te: "స్టాక్ (" },
  taxPercent:   { en: "Tax %", hi: "टैक्स %", te: "పన్ను %" },
  minOrderQty:  { en: "Min order qty", hi: "न्यूनतम ऑर्डर", te: "కనీస ఆర్డర్" },
  category:     { en: "Category", hi: "श्रेणी", te: "వర్గం" },
  offer:        { en: "Offer (e.g. Buy 5 get 1)", hi: "ऑफर (जैसे 5 खरीदो 1 मुफ्त)", te: "ఆఫర్ (ఉదా. 5 కి 1 ఉచితం)" },
  leadTime:     { en: "Lead time (e.g. 1 day)", hi: "डिलीवरी समय (जैसे 1 दिन)", te: "డెలివరీ సమయం (ఉదా. 1 రోజు)" },
  notesForKirana: { en: "Notes for kirana", hi: "किराने के लिए नोट्स", te: "కిరానా కోసం నోట్స్" },
  moreDetails:  { en: "More details (tax, offer, min order, notes)", hi: "और जानकारी (टैक्स, ऑफर, न्यूनतम ऑर्डर, नोट्स)", te: "మరిన్ని వివరాలు (పన్ను, ఆఫర్, కనీస, నోట్స్)" },
  hideExtraDetails: { en: "Hide extra details", hi: "अधिक जानकारी छुपाएँ", te: "అదనపు వివరాలు దాచండి" },
  save:         { en: "Save", hi: "सेव", te: "సేవ్" },
  cancel:       { en: "Cancel", hi: "रद्द करें", te: "రద్దు చేయండి" },
  addToStock:   { en: "Add to my stock", hi: "मेरे स्टॉक में जोड़ें", te: "నా స్టాక్‌లో జోడించండి" },
  addNameToSave: { en: "Add a name to save", hi: "सेव करने के लिए नाम लिखें", te: "సేవ్ చేయడానికి పేరు రాయండి" },
  searchItems:  { en: "Search items…", hi: "आइटम खोजें…", te: "ఐటెంలు వెతకండి…" },
  myItems:      { en: "My items", hi: "मेरे आइटम", te: "నా ఐటెంలు" },
  noItemsYet:   { en: "No items yet", hi: "अभी कोई आइटम नहीं", te: "ఇంకా ఐటెంలు లేవు" },
  noItemsHint:  { en: "Tap \"Scan price list\" to add many items at once, or add one above.", hi: "\"लिस्ट स्कैन करें\" दबाकर एक साथ कई आइटम जोड़ें, या ऊपर से एक जोड़ें।", te: "\"జాబితా స్కాన్\" నొక్కి చాలా ఐటెంలు ఒకేసారి జోడించండి." },

  // Summary tiles (My Stock)
  plentyInStock: { en: "plenty in stock", hi: "बहुत स्टॉक है", te: "పెద్ద స్టాక్ ఉంది" },
  runningLow:    { en: "running low", hi: "कम हो रहा है", te: "తగ్గుతోంది" },
  finished:      { en: "finished", hi: "खत्म हो गया", te: "అయిపోయింది" },
  uncategorized: { en: "Uncategorized", hi: "बिना श्रेणी", te: "వర్గం లేకుండా" },

  // Settings page
  shopSettings: { en: "Shop Settings", hi: "दुकान की सेटिंग्स", te: "షాప్ సెట్టింగ్‌లు" },
  notVerifiedYet: { en: "Not yet verified — add GSTIN / FSSAI", hi: "अभी सत्यापित नहीं — GSTIN / FSSAI जोड़ें", te: "ఇంకా ధృవీకరించబడలేదు — GSTIN / FSSAI జోడించండి" },
  verifiedShop:  { en: "Verified shop", hi: "सत्यापित दुकान", te: "ధృవీకరించబడిన షాప్" },
  shop:          { en: "Shop", hi: "दुकान", te: "షాపు" },
  shopName:      { en: "Shop name", hi: "दुकान का नाम", te: "షాపు పేరు" },
  ownerName:     { en: "Owner name", hi: "मालिक का नाम", te: "యజమాని పేరు" },
  shopLocation:  { en: "Shop location / area", hi: "दुकान का स्थान / क्षेत्र", te: "షాపు ప్రాంతం" },
  pickupAddress: { en: "Pickup / from address", hi: "पिकअप / डिलीवरी का पता", te: "పికప్ / డెలివరీ చిరునామా" },
  identity:      { en: "Identity", hi: "पहचान", te: "గుర్తింపు" },
  gstin:         { en: "GSTIN (15 char)", hi: "GSTIN (15 अक्षर)", te: "GSTIN (15 అక్షరాలు)" },
  fssaiNumber:   { en: "FSSAI license number", hi: "FSSAI लाइसेंस नंबर", te: "FSSAI లైసెన్స్ నంబర్" },
  adminVerifies: { en: "Admin verifies these once you submit. Verified shops get a badge in front of kirana.", hi: "जमा करने के बाद Admin सत्यापित करेगा। सत्यापित दुकानों को बैज मिलता है।", te: "మీరు సమర్పించాక Admin ధృవీకరిస్తారు. ధృవీకరణ తర్వాత షాపుకు బ్యాడ్జ్ వస్తుంది." },
  orderDefaults: { en: "Order defaults (used to auto-fill invoices)", hi: "ऑर्डर डिफ़ॉल्ट (इनवॉइस अपने आप भरेंगे)", te: "ఆర్డర్ డిఫాల్ట్‌లు (ఇన్‌వాయిస్ ఆటో ఫిల్ అవుతాయి)" },
  defaultTaxPct: { en: "Default tax %", hi: "डिफ़ॉल्ट टैक्स %", te: "డిఫాల్ట్ పన్ను %" },
  defaultDiscount: { en: "Default discount %", hi: "डिफ़ॉल्ट छूट %", te: "డిఫాల్ట్ తగ్గింపు %" },
  defaultDelivery: { en: "Default delivery time", hi: "डिफ़ॉल्ट डिलीवरी समय", te: "డిఫాల్ట్ డెలివరీ సమయం" },
  orTypeCustom: { en: "Or type custom", hi: "या खुद लिखें", te: "లేదా మీరే రాయండి" },
  promotions:   { en: "Promotions (optional)", hi: "प्रचार (वैकल्पिक)", te: "ప్రమోషన్‌లు (ఐచ్ఛికం)" },
  banner:       { en: 'Banner text (e.g. "Free delivery above ₹2000")', hi: 'बैनर टेक्स्ट (जैसे "₹2000 के ऊपर मुफ्त डिलीवरी")', te: 'బ్యానర్ టెక్స్ట్ (ఉదా. "₹2000 పైన ఉచిత డెలివరీ")' },
  saveSettings: { en: "Save settings", hi: "सेटिंग्स सेव करें", te: "సెట్టింగ్‌లు సేవ్ చేయండి" },

  // Insights tiles
  insightsTitle: { en: "Insights", hi: "जानकारी", te: "విశ్లేషణ" },
  itemsInCatalog: { en: "items in catalog", hi: "कैटलॉग में आइटम", te: "కేటలాగ్‌లో ఐటెంలు" },
  ordersInWindow: { en: "orders in last 90 d", hi: "पिछले 90 दिनों में ऑर्डर", te: "గత 90 రోజుల్లో ఆర్డర్‌లు" },
  restockSoon: { en: "Restock soon", hi: "जल्द स्टॉक भरें", te: "త్వరగా స్టాక్ నింపండి" },
  restockHint: { en: "Items you'll run out of before next week", hi: "अगले हफ्ते से पहले खत्म होने वाले आइटम", te: "వచ్చే వారం ముందు అయిపోయే ఐటెంలు" },
  askedForThese: { en: "Kiranas asked for these — add to your stock?", hi: "किरानों ने ये माँगे — स्टॉक में जोड़ें?", te: "కిరానాలు అడిగారు — స్టాక్‌లో జోడిస్తారా?" },
  askedHint: { en: "Items repeated in incoming orders that you don't currently sell", hi: "जो आइटम ऑर्डर में बार-बार आते हैं लेकिन आप अभी नहीं बेचते", te: "మీరు అమ్మని ఆర్డర్లలో మళ్ళీ మళ్ళీ వచ్చే ఐటెంలు" },
  addItemsCta: { en: "Add items in My Stock", hi: "मेरे स्टॉक में आइटम जोड़ें", te: "నా స్టాక్‌లో జోడించండి" },
  topSellers:  { en: "Your top sellers", hi: "आपके सबसे ज्यादा बिकने वाले", te: "మీ టాప్ సెల్లర్‌లు" },
  topSellersHint: { en: "Most-ordered items in the last 90 days", hi: "पिछले 90 दिनों में सबसे ज्यादा बिकने वाले", te: "గత 90 రోజుల్లో అత్యధికంగా ఆర్డర్ చేసిన" },
  slowMovers:  { en: "Slow movers", hi: "धीमी बिक्री", te: "నెమ్మదిగా అమ్మే" },
  slowHint:    { en: "Items sitting on your shelf — consider reducing stock or offering a discount", hi: "जो आइटम बिक नहीं रहे — स्टॉक कम करें या छूट दें", te: "అమ్మని ఐటెంలు — స్టాక్ తగ్గించండి లేదా తగ్గింపు ఇవ్వండి" },
  asked:        { en: "asked", hi: "माँगा", te: "అడిగారు" },
  orders:       { en: "orders", hi: "ऑर्डर", te: "ఆర్డర్‌లు" },
  left:         { en: "left", hi: "बचा", te: "మిగిలి" },
  sitting:      { en: "sitting", hi: "बेकार पड़ा", te: "మిగిలి ఉంది" },
  nothingToFlag: { en: "Nothing to flag yet.", hi: "अभी कुछ बताने को नहीं।", te: "ఇంకా ఏమీ లేదు." },
  insightsEmptyHint: {
    en: "Insights become useful once you've received a few orders and have stock numbers filled in.",
    hi: "कुछ ऑर्डर मिलने और स्टॉक भरने के बाद यह उपयोगी होगा।",
    te: "కొన్ని ఆర్డర్‌లు వచ్చి స్టాక్ నింపిన తర్వాత ఇది ఉపయోగపడుతుంది.",
  },

  // Save banner shown when arriving from scan-save
  savedBangPrefix: { en: "Saved!", hi: "सेव हो गया!", te: "సేవ్ అయింది!" },
  newWord:    { en: "new", hi: "नया", te: "కొత్త" },
  mergedWithExisting: { en: "merged with existing stock", hi: "मौजूदा स्टॉक में जुड़ा", te: "ఉన్న స్టాక్‌తో కలిసింది" },
  needPriceStock: { en: "need price/stock — fix below.", hi: "कीमत/स्टॉक चाहिए — नीचे ठीक करें।", te: "ధర/స్టాక్ కావాలి — క్రింద సరిచేయండి." },

  rowsMissingHint: {
    en: "Rows missing price or stock get saved but hidden from kiranas until you fill them in from My Stock.",
    hi: "जिन रोज़ में कीमत या स्टॉक नहीं है, वे सेव होंगे लेकिन भरने तक किरानों को नहीं दिखेंगे।",
    te: "ధర/స్టాక్ లేని వరుసలు సేవ్ అవుతాయి కానీ నింపే వరకు కిరానాకు కనిపించవు.",
  },
};

type StringKey = keyof typeof STRINGS;

export function useWholesalerStrings() {
  const { language } = useLanguage();
  const lang = ((language as Lang) ?? "en") as Lang;
  // Return a callable getter so screens can read keys without re-rendering
  // on every prop access.
  return (key: StringKey): string => {
    const entry = STRINGS[key];
    if (!entry) return key;
    return entry[lang] ?? entry.en;
  };
}
