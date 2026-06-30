/**
 * Unit-aware quantity parsing + conversion.
 *
 * The kirana writes order quantities in natural form ("500 gm", "2 L", "3
 * packets"). The wholesaler stores stock in catalog units ("kg", "litre",
 * "packet"). When we compare them — to decide if it's in stock, to compute
 * a bill, to decrement stock on confirm — we MUST compare in the same unit.
 *
 * This module centralizes:
 *   - parsing a free-text quantity string into { value, unit }
 *   - converting between equivalent units (gm ↔ kg, ml ↔ L) safely
 *   - asking "are these two units compatible?" so we don't accidentally
 *     compare 5 packets with 20 kg.
 */

export type UnitKind = "weight" | "volume" | "count" | "unknown";

const UNIT_ALIASES: Record<string, { canonical: string; kind: UnitKind; factorToBase: number }> = {
  // Weight — base unit is "kg"
  kg:       { canonical: "kg", kind: "weight", factorToBase: 1 },
  kgs:      { canonical: "kg", kind: "weight", factorToBase: 1 },
  kilo:     { canonical: "kg", kind: "weight", factorToBase: 1 },
  kilos:    { canonical: "kg", kind: "weight", factorToBase: 1 },
  kilogram: { canonical: "kg", kind: "weight", factorToBase: 1 },
  kilograms:{ canonical: "kg", kind: "weight", factorToBase: 1 },
  g:        { canonical: "kg", kind: "weight", factorToBase: 0.001 },
  gm:       { canonical: "kg", kind: "weight", factorToBase: 0.001 },
  gms:      { canonical: "kg", kind: "weight", factorToBase: 0.001 },
  gram:     { canonical: "kg", kind: "weight", factorToBase: 0.001 },
  grams:    { canonical: "kg", kind: "weight", factorToBase: 0.001 },

  // Volume — base unit is "litre"
  l:        { canonical: "litre", kind: "volume", factorToBase: 1 },
  ltr:      { canonical: "litre", kind: "volume", factorToBase: 1 },
  liter:    { canonical: "litre", kind: "volume", factorToBase: 1 },
  liters:   { canonical: "litre", kind: "volume", factorToBase: 1 },
  litre:    { canonical: "litre", kind: "volume", factorToBase: 1 },
  litres:   { canonical: "litre", kind: "volume", factorToBase: 1 },
  litry:    { canonical: "litre", kind: "volume", factorToBase: 1 },
  ml:       { canonical: "litre", kind: "volume", factorToBase: 0.001 },
  millilit: { canonical: "litre", kind: "volume", factorToBase: 0.001 },
  milliliter:{canonical: "litre", kind: "volume", factorToBase: 0.001 },

  // Count — each canonical unit stands alone
  piece:    { canonical: "piece",  kind: "count", factorToBase: 1 },
  pieces:   { canonical: "piece",  kind: "count", factorToBase: 1 },
  pc:       { canonical: "piece",  kind: "count", factorToBase: 1 },
  pcs:      { canonical: "piece",  kind: "count", factorToBase: 1 },
  packet:   { canonical: "packet", kind: "count", factorToBase: 1 },
  packets:  { canonical: "packet", kind: "count", factorToBase: 1 },
  pkt:      { canonical: "packet", kind: "count", factorToBase: 1 },
  pkts:     { canonical: "packet", kind: "count", factorToBase: 1 },
  pack:     { canonical: "packet", kind: "count", factorToBase: 1 },
  packs:    { canonical: "packet", kind: "count", factorToBase: 1 },
  box:      { canonical: "box",    kind: "count", factorToBase: 1 },
  boxes:    { canonical: "box",    kind: "count", factorToBase: 1 },
  bottle:   { canonical: "bottle", kind: "count", factorToBase: 1 },
  bottles:  { canonical: "bottle", kind: "count", factorToBase: 1 },
};

export interface ParsedQty {
  value: number;        // numeric value
  unit: string | null;  // raw unit token found in the string, lowercased
  canonical: string | null;  // mapped canonical unit (kg, litre, piece, ...)
  kind: UnitKind;
}

/**
 * Parse "500 gm", "2 L", "3 packets", "5kg", "1.5 litre" etc.
 * Returns { value, unit, canonical, kind }.
 */
export function parseQty(qty: string | number | null | undefined): ParsedQty {
  if (qty == null) return { value: 1, unit: null, canonical: null, kind: "unknown" };
  if (typeof qty === "number") {
    return { value: Number.isFinite(qty) ? qty : 1, unit: null, canonical: null, kind: "unknown" };
  }
  const s = String(qty).toLowerCase().trim();
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  const value = numMatch ? Number(numMatch[1]) : 1;
  // Pull out the alpha bit after the number (may be missing).
  const rest = s.slice(numMatch ? (numMatch.index ?? 0) + numMatch[0].length : 0).replace(/[^a-z]/g, "");
  // Try to match the longest known alias prefix in `rest`.
  let bestKey: string | null = null;
  for (const k of Object.keys(UNIT_ALIASES)) {
    if (rest.startsWith(k) && (bestKey === null || k.length > bestKey.length)) bestKey = k;
  }
  if (bestKey) {
    const info = UNIT_ALIASES[bestKey];
    return { value, unit: bestKey, canonical: info.canonical, kind: info.kind };
  }
  return { value, unit: rest || null, canonical: null, kind: "unknown" };
}

/**
 * Convert a value from one unit alias to the canonical of `toUnit`.
 * If incompatible (e.g. weight vs count), returns null — caller decides
 * what to do (most callers fall back to the raw value).
 */
export function convertQty(value: number, fromUnit: string | null, toUnit: string | null): number | null {
  if (!fromUnit && !toUnit) return value;
  const fromInfo = fromUnit ? UNIT_ALIASES[fromUnit.toLowerCase()] : null;
  const toInfo = toUnit ? UNIT_ALIASES[toUnit.toLowerCase()] : null;
  // No mapping data — assume same unit, return as-is.
  if (!fromInfo || !toInfo) return value;
  if (fromInfo.kind !== toInfo.kind) return null; // incompatible
  // Convert from-unit → base → to-unit
  return (value * fromInfo.factorToBase) / toInfo.factorToBase;
}

/**
 * Compute the "needed" quantity from an order item against a catalog row's
 * native unit. Returns the value in the catalog's unit, ready to compare
 * with stockQuantity. Falls back to the raw numeric value if units don't
 * match (so a packet count vs a kg count won't silently say "in stock").
 */
export function neededInCatalogUnit(orderQty: string | number, catalogUnit: string | null | undefined): {
  needed: number;        // value expressed in the catalog's unit
  raw: ParsedQty;        // the parsed order qty (with its own unit)
  compatible: boolean;   // whether kinds matched (true even if both null)
} {
  const raw = parseQty(orderQty);
  const converted = convertQty(raw.value, raw.unit, catalogUnit ?? null);
  if (converted == null) return { needed: raw.value, raw, compatible: false };
  return { needed: converted, raw, compatible: true };
}

/**
 * Human-readable rendering of "X kg" or "500 gm" preserving the unit the
 * KIRANA chose. We don't want to display "0.5 kg" when they typed "500 gm" —
 * stay in their words.
 */
export function formatQty(qty: ParsedQty): string {
  const u = qty.unit ?? qty.canonical ?? "";
  return u ? `${qty.value} ${u}` : `${qty.value}`;
}
