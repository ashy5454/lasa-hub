/**
 * Localized labels for the four stock states, on both the kirana side
 * (looking at a wholesaler's catalog row) and the wholesaler side (looking
 * at an order item against their own catalog).
 *
 * Centralized here so we never have a mix of English and Hindi leaking
 * onto the same screen — whatever language the user chose, all four states
 * speak it.
 */

export type StockState =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "not_carried"
  | "below_min_order"
  | "wrong_unit";

interface Args {
  state: StockState;
  onHand?: number | null;
  needed?: number;
  minOrderQty?: number;
  unit?: string;          // e.g. "kg", "litre" — the wholesaler's unit
  orderedUnit?: string;   // the kirana's unit, used for wrong_unit messaging
}

function fmtN(n: number): string {
  // Drop trailing zeros for cleaner display: 0.5 stays 0.5, 5.0 → 5
  if (!Number.isFinite(n)) return "?";
  return String(Number(n.toFixed(3)));
}

// ── Wholesaler perspective ────────────────────────────────────────────────
export function wholesalerStockLabel(language: "en" | "te" | "hi", a: Args): string {
  const u = a.unit ? ` ${a.unit}` : "";
  const need = a.needed != null ? fmtN(a.needed) : "?";
  const have = a.onHand != null ? fmtN(a.onHand) : "?";

  if (language === "hi") {
    switch (a.state) {
      case "in_stock":
        return a.onHand == null ? "आपके पास है" : `आपके पास ${have}${u} है`;
      case "low_stock":
        return `सिर्फ ${have}${u} बचा है — उन्हें ${need}${u} चाहिए`;
      case "out_of_stock":
        return "खत्म हो गया — फिर से स्टॉक करें";
      case "not_carried":
        return "आप यह नहीं बेचते";
      case "below_min_order":
        return `न्यूनतम ऑर्डर ${a.minOrderQty}${u} है`;
      case "wrong_unit":
        return `आप ${a.unit ?? ""} में बेचते हैं, उन्होंने ${a.orderedUnit ?? ""} में मांगा`;
    }
  }
  if (language === "te") {
    switch (a.state) {
      case "in_stock":
        return a.onHand == null ? "మీ దగ్గర ఉంది" : `మీ దగ్గర ${have}${u} ఉంది`;
      case "low_stock":
        return `${have}${u} మాత్రమే మిగిలి ఉంది — వారికి ${need}${u} కావాలి`;
      case "out_of_stock":
        return "అయిపోయింది — మళ్ళీ నిల్వ చేయండి";
      case "not_carried":
        return "మీరు దీన్ని అమ్మరు";
      case "below_min_order":
        return `కనీస ఆర్డర్ ${a.minOrderQty}${u}`;
      case "wrong_unit":
        return `మీరు ${a.unit ?? ""} లో అమ్ముతారు, వారు ${a.orderedUnit ?? ""} లో అడిగారు`;
    }
  }
  // English (default)
  switch (a.state) {
    case "in_stock":
      return a.onHand == null ? "you have this in stock" : `you have ${have}${u} in stock`;
    case "low_stock":
      return `only ${have}${u} left — they need ${need}${u}`;
    case "out_of_stock":
      return "out of stock — need to restock";
    case "not_carried":
      return "you don't sell this item";
    case "below_min_order":
      return `your minimum is ${a.minOrderQty}${u}`;
    case "wrong_unit":
      return `you sell by ${a.unit ?? ""}, they asked in ${a.orderedUnit ?? ""}`;
  }
}

// ── Kirana perspective (slightly different wording) ───────────────────────
export function kiranaStockLabel(language: "en" | "te" | "hi", a: Args): string {
  const u = a.unit ? ` ${a.unit}` : "";
  const need = a.needed != null ? fmtN(a.needed) : "?";
  const have = a.onHand != null ? fmtN(a.onHand) : "?";

  if (language === "hi") {
    switch (a.state) {
      case "in_stock":
        return a.onHand == null ? "दुकान में मौजूद है" : `दुकान में ${have}${u} है`;
      case "low_stock":
        return `दुकान में सिर्फ ${have}${u} है, आपको ${need}${u} चाहिए`;
      case "below_min_order":
        return `दुकान का न्यूनतम ${a.minOrderQty}${u} है, आपने ${need}${u} ऑर्डर किया`;
      case "out_of_stock":
        return "दुकान में अभी नहीं है";
      case "not_carried":
        return "यह दुकान यह नहीं बेचती";
      case "wrong_unit":
        return `दुकान ${a.unit ?? ""} में बेचती है, आपने ${a.orderedUnit ?? ""} में मांगा — मात्रा बदलें`;
    }
  }
  if (language === "te") {
    switch (a.state) {
      case "in_stock":
        return a.onHand == null ? "షాపులో ఉంది" : `షాపులో ${have}${u} ఉంది`;
      case "low_stock":
        return `షాపులో ${have}${u} మాత్రమే ఉంది, మీకు ${need}${u} కావాలి`;
      case "below_min_order":
        return `షాప్ కనీసం ${a.minOrderQty}${u}, మీరు ${need}${u} ఆర్డర్ చేశారు`;
      case "out_of_stock":
        return "షాపులో అయిపోయింది";
      case "not_carried":
        return "ఈ షాపు దీన్ని అమ్మదు";
      case "wrong_unit":
        return `షాపు ${a.unit ?? ""} లో అమ్ముతుంది, మీరు ${a.orderedUnit ?? ""} లో అడిగారు — పరిమాణం మార్చండి`;
    }
  }
  // English (default)
  switch (a.state) {
    case "in_stock":
      return a.onHand == null ? "shop has it in stock" : `shop has ${have}${u} in stock`;
    case "low_stock":
      return `shop only has ${have}${u}, you need ${need}${u}`;
    case "below_min_order":
      return `shop's minimum order is ${a.minOrderQty}${u}, you ordered ${need}${u}`;
    case "out_of_stock":
      return "shop is out of this item";
    case "not_carried":
      return "shop doesn't sell this item";
    case "wrong_unit":
      return `shop sells this by ${a.unit ?? ""}, not by ${a.orderedUnit ?? ""} — change the unit`;
  }
}
