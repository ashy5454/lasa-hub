/**
 * Catalog item lookup — the single source of truth for "did the kirana ask
 * for something this wholesaler sells?".
 *
 * STRICT match strategy (in strict-to-loose order, first hit wins):
 *   1. Exact normalized name match              (Rice ↔ rice ↔ " Rice ")
 *   2. Synonym group match (cross-language)     (haldi ↔ turmeric ↔ పసుపు)
 *
 * Deliberately NO substring/contains-match. The earlier "Oil → Sunflower
 * Oil" / "Chips → Balaji Chips" behaviour was too aggressive: a kirana
 * asking for generic "chips" would silently get whatever brand the
 * wholesaler stocks, which is wrong if the kirana wanted "Lays" but the
 * wholesaler only has "Balaji". For ambiguous matches we surface
 * SUGGESTIONS (see findSimilarCatalogItems) and let the kirana pick.
 *
 * Used by:
 *   - kirana review screen (WholesalersContext.findCatalogItem)
 *   - wholesaler order detail (live inventory match)
 *   - server-side fulfillment filter (mirrored in api-server)
 *
 * If any side wants slightly different behaviour later, branch via an
 * option rather than forking this function — keeping both sides in
 * lockstep is critical for the kirana and wholesaler to agree on what
 * "in stock" means.
 */

import { sameItem } from "./itemSynonyms";

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,;:!?()'"\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generic shape that any catalog item satisfies — `name` is the only
 * required field; `nameTe` / `nameHi` are tried as additional match keys
 * if present.
 */
export interface MatchableCatalogItem {
  name: string;
  nameTe?: string | null;
  nameHi?: string | null;
}

/**
 * Find the catalog item that best matches any of the supplied candidate
 * names. Candidates are typically [item.name, item.nameTe, item.nameHi]
 * from a kirana's order, so a Hindi-script name can hit an English catalog
 * row and vice versa.
 *
 * Returns undefined if nothing matches even at the contains-stage.
 */
export function findCatalogItem<T extends MatchableCatalogItem>(
  catalog: readonly T[],
  ...candidates: (string | null | undefined)[]
): T | undefined {
  const raw = candidates.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  if (raw.length === 0 || catalog.length === 0) return undefined;
  const keys = raw.map(norm);

  // 1. Exact normalized match against name, nameTe, or nameHi
  for (const k of keys) {
    const hit = catalog.find((c) =>
      norm(c.name) === k ||
      (c.nameTe != null && norm(c.nameTe) === k) ||
      (c.nameHi != null && norm(c.nameHi) === k),
    );
    if (hit) return hit;
  }

  // 2. Synonym match (cross-language)
  for (const candidate of raw) {
    const hit = catalog.find((c) =>
      sameItem(candidate, c.name) ||
      sameItem(candidate, c.nameTe ?? "") ||
      sameItem(candidate, c.nameHi ?? ""),
    );
    if (hit) return hit;
  }

  // 3. "Qualified" match — the user wrote a MORE specific name than the
  //    catalog (e.g. "Cotton wicks (for lamps)" vs catalog "Cotton Wicks",
  //    "Lays Magic Masala" vs catalog "Lays"). Safe in this direction
  //    because the user is *narrowing*, not the wholesaler substituting
  //    a brand for a generic. The reverse direction (catalog name contains
  //    user name) is what we explicitly do NOT do — that was the old
  //    "Chips → Balaji Chips" bug.
  //
  //    Rule: every whitespace-delimited word of the catalog name must
  //    appear in the user name. Single-word catalog entries need 4+ chars
  //    to avoid false matches like "Oil" matching "Sunflower Oil 1L".
  const userKeys = keys; // already normalized above
  for (const c of catalog) {
    const catNames = [c.name, c.nameTe, c.nameHi].filter(
      (n): n is string => !!n && !!n.trim(),
    );
    for (const cname of catNames) {
      const catWords = norm(cname).split(" ").filter(Boolean);
      if (catWords.length === 0) continue;
      // Guard against single short words mass-matching everything.
      if (catWords.length === 1 && catWords[0].length < 4) continue;
      for (const userKey of userKeys) {
        const userWords = new Set(userKey.split(" ").filter(Boolean));
        if (catWords.every((w) => userWords.has(w))) {
          return c;
        }
      }
    }
  }

  return undefined;
}

/**
 * Return up to `limit` catalog items that might be what the kirana meant,
 * for the case where findCatalogItem returns nothing. This is the "did you
 * mean…" list shown next to an unmatched item.
 *
 * Strategy:
 *   - Substring overlap in either direction on normalized names
 *     ("chips" finds "Balaji Cream & Onion Chips", "Lays")
 *   - Substring overlap against any of the catalog item's language variants
 *   - Ranked: shortest catalog name first (most likely the closest brand)
 *
 * NEVER auto-substitutes — these are *suggestions* shown to the kirana
 * with a "Add this to my order" affordance.
 */
export function findSimilarCatalogItems<T extends MatchableCatalogItem>(
  catalog: readonly T[],
  query: string | null | undefined,
  limit = 3,
): T[] {
  if (!query || !query.trim()) return [];
  const q = norm(query);
  if (q.length < 2) return [];

  const seen = new Set<T>();
  const matches: T[] = [];
  for (const c of catalog) {
    const candidates = [c.name, c.nameTe, c.nameHi]
      .filter((n): n is string => !!n && !!n.trim())
      .map(norm);
    const hit = candidates.some((cn) => cn.length > 1 && (cn.includes(q) || q.includes(cn)));
    if (hit && !seen.has(c)) {
      seen.add(c);
      matches.push(c);
    }
  }
  // Shortest catalog-name first → most likely the closest brand.
  matches.sort((a, b) => norm(a.name).length - norm(b.name).length);
  return matches.slice(0, limit);
}
