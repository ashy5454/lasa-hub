import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/constants/api";
import { WHOLESALERS as STATIC_FALLBACK, type Wholesaler, type CatalogItem } from "@/data/wholesalers";
import { sameItem } from "@/utils/itemSynonyms";
import { neededInCatalogUnit, parseQty as parseQtyUnit } from "@/utils/units";
import { findCatalogItem as sharedFindCatalogItem } from "@/utils/catalogMatch";

export type Stock = "in_stock" | "low_stock" | "out_of_stock" | "not_carried" | "below_min_order" | "wrong_unit";

export interface StockCheck {
  state: Stock;
  needed: number;
  onHand: number | null;        // null = unknown stock (legacy items)
  minOrderQty: number;          // wholesaler's minimum
  catalog?: CatalogItem;
}

/**
 * Normalize an item name for matching: lowercase, strip whitespace, drop
 * common punctuation. Catches "Rice", "rice", " rice ", "Rice." as the same.
 */
function normName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,;:!?()'"-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SupplierQuote {
  wholesaler: Wholesaler;
  inStockCount: number;
  lowStockCount: number;
  missingCount: number;
  total: number;                // estimated total at wholesaler defaults
  subtotal: number;
  tax: number;
  discount: number;
  distanceKm: number | null;
  score: number;
}

interface WholesalersContextType {
  wholesalers: Wholesaler[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  getById: (id: string) => Wholesaler | undefined;
  isAvailable: (wholesalerId: string, itemName: string) => boolean;
  stockFor: (wholesalerId: string, itemName: string, requiredQty: number | string, nameTe?: string, nameHi?: string) => StockCheck;
  rankSuppliers: (items: { name: string; quantity: string; nameTe?: string; nameHi?: string }[], kirana?: { lat?: number; lng?: number }) => SupplierQuote[];
}

function parseQty(q: string): number {
  const m = q.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const WholesalersContext = createContext<WholesalersContextType | null>(null);

function normalizeCatalog(row: any): CatalogItem {
  return {
    name: row.name,
    nameTe: row.nameTe ?? row.name_te ?? "",
    nameHi: row.nameHi ?? row.name_hi ?? "",
    unit: row.unit,
    pricePerUnit: row.pricePerUnit ?? row.price_per_unit,
    available: !!row.available,
    minOrderQty: row.minOrderQty ?? row.min_order_qty ?? 1,
    offer: row.offer ?? undefined,
    stockQuantity: row.stockQuantity ?? row.stock_quantity ?? null,
    taxPercent: row.taxPercent ?? row.tax_percent ?? null,
    category: row.category ?? null,
    discountType: row.discountType ?? row.discount_type ?? null,
    discountValue: row.discountValue ?? row.discount_value ?? null,
    leadTime: row.leadTime ?? row.lead_time ?? null,
    extraInfo: row.extraInfo ?? row.extra_info ?? null,
  };
}

function normalizeWholesaler(row: any): Wholesaler {
  return {
    id: row.id,
    name: row.name,
    ownerName: row.ownerName ?? row.owner_name,
    phone: row.ownerPhone ?? row.owner_phone ?? "",
    location: row.location,
    distance: row.distance ?? "",
    computedDistance: row.computedDistance,
    rating: row.rating ?? 4.5,
    specialOffer: row.specialOffer ?? row.special_offer ?? undefined,
    catalog: Array.isArray(row.catalog) ? row.catalog.map(normalizeCatalog) : [],
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    gstin: row.gstin ?? null,
    fssai: row.fssai ?? null,
    verified: !!row.verified,
    defaultTaxPercent: Number(row.defaultTaxPercent ?? row.default_tax_percent ?? 0) || 0,
    defaultDiscountPercent: Number(row.defaultDiscountPercent ?? row.default_discount_percent ?? 0) || 0,
    defaultDeliveryTime: row.defaultDeliveryTime ?? row.default_delivery_time ?? null,
    fromAddress: row.fromAddress ?? row.from_address ?? null,
  };
}

import { useAuth } from "./AuthContext";

export function WholesalersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>(STATIC_FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      let url = "/api/wholesalers";
      if (user?.lat && user?.lng) {
        url += `?lat=${user.lat}&lng=${user.lng}`;
      }
      const { wholesalers: raw } = await apiGet<{ wholesalers: any[] }>(url);
      if (raw && raw.length) {
        setWholesalers(raw.map(normalizeWholesaler));
      }
    } catch (err) {
      console.warn("Wholesalers fetch failed, using static fallback:", (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.lat, user?.lng]);

  useEffect(() => { refresh(); }, [refresh]);

  const getById = useCallback(
    (id: string) => wholesalers.find(w => w.id === id),
    [wholesalers],
  );

  // Find a catalog item — delegates to the shared util so kirana side,
  // wholesaler order detail, and any future caller all use the same
  // 3-step (exact → synonym → contains) match logic.
  const findCatalogItem = useCallback(
    (w: Wholesaler, ...candidates: (string | null | undefined)[]) =>
      sharedFindCatalogItem(w.catalog, ...candidates),
    [],
  );

  const isAvailable = useCallback(
    (wholesalerId: string, itemName: string) => {
      const w = wholesalers.find(x => x.id === wholesalerId);
      if (!w) return false;
      const match = findCatalogItem(w, itemName);
      if (!match) return false;
      if (!match.available) return false;
      if (match.stockQuantity == null) return true;
      return match.stockQuantity > 0;
    },
    [wholesalers, findCatalogItem],
  );

  const stockFor = useCallback(
    (wholesalerId: string, itemName: string, requiredQty: number | string, nameTe?: string, nameHi?: string): StockCheck => {
      const w = wholesalers.find(x => x.id === wholesalerId);
      if (!w) return { state: "not_carried", needed: typeof requiredQty === "number" ? requiredQty : parseQtyUnit(requiredQty).value, onHand: null, minOrderQty: 1 };
      const match = findCatalogItem(w, itemName, nameTe, nameHi);
      if (!match || !match.available) {
        const fallbackNeeded = typeof requiredQty === "number" ? requiredQty : parseQtyUnit(requiredQty).value;
        return { state: "not_carried", needed: fallbackNeeded, onHand: 0, minOrderQty: match?.minOrderQty ?? 1, catalog: match };
      }
      // Convert the kirana's qty into the catalog's native unit so the
      // comparison is apples-to-apples. e.g. "500 gm" against a catalog
      // row of {unit: "kg", stock: 20} becomes 0.5 vs 20.
      const { needed, compatible } = typeof requiredQty === "number"
        ? { needed: requiredQty, compatible: true }
        : neededInCatalogUnit(requiredQty, match.unit);
      // Catalog's minimum is expressed in catalog units already.
      const minOrderQty = match.minOrderQty ?? 1;
      const onHand = match.stockQuantity ?? null;
      // If the units are incompatible (e.g. kirana ordered 5 packets of an
      // item the wholesaler sells by kg) we now use a dedicated `wrong_unit`
      // state. Previously we conflated this with `not_carried`, which made
      // the UI say "shop doesn't sell this item" — that was deeply
      // confusing because the shop *does* carry it, just in a different
      // unit. The new state lets the review screen render an actionable
      // message ("Shop sells this by kg, not by pack") instead.
      if (!compatible) {
        return { state: "wrong_unit", needed, onHand: onHand ?? 0, minOrderQty, catalog: match };
      }
      if (needed < minOrderQty) {
        return { state: "below_min_order", needed, onHand, minOrderQty, catalog: match };
      }
      if (onHand == null) return { state: "in_stock", needed, onHand: null, minOrderQty, catalog: match };
      if (onHand <= 0) return { state: "out_of_stock", needed, onHand, minOrderQty, catalog: match };
      if (onHand < needed) return { state: "low_stock", needed, onHand, minOrderQty, catalog: match };
      return { state: "in_stock", needed, onHand, minOrderQty, catalog: match };
    },
    [wholesalers, findCatalogItem],
  );

  const rankSuppliers = useCallback(
    (items: { name: string; quantity: string; nameTe?: string; nameHi?: string }[], kirana?: { lat?: number; lng?: number }): SupplierQuote[] => {
      const quotes = wholesalers.map((w) => {
        let inStock = 0, low = 0, missing = 0;
        let subtotal = 0, tax = 0;
        for (const it of items) {
          // Pass the raw quantity string so stockFor can unit-convert.
          const s = stockFor(w.id, it.name, it.quantity, it.nameTe, it.nameHi);
          if (s.state === "in_stock") inStock += 1;
          else if (s.state === "low_stock") low += 1;
          else if (s.state === "below_min_order") low += 1;
          else if (s.state === "wrong_unit") low += 1; // shop carries it, just in a different unit — still a partial coverage win
          else missing += 1;
          if (s.catalog?.available && s.state !== "not_carried" && s.state !== "out_of_stock" && s.state !== "wrong_unit") {
            // `s.needed` is already in catalog units (kg/litre/etc), so
            // pricing is correct regardless of whether the kirana typed
            // "500 gm" or "0.5 kg".
            const lineSub = s.catalog.pricePerUnit * s.needed;
            const lineTaxPct = (s.catalog.taxPercent ?? w.defaultTaxPercent ?? 0);
            subtotal += lineSub;
            tax += lineSub * (lineTaxPct / 100);
          }
        }
        const discount = subtotal * ((w.defaultDiscountPercent ?? 0) / 100);
        const total = subtotal + tax - discount;
        let distanceKm: number | null = null;
        if (typeof (w as any).computedDistance === "number" && Number.isFinite((w as any).computedDistance)) {
          distanceKm = (w as any).computedDistance;
        } else if (kirana?.lat != null && kirana?.lng != null && w.lat != null && w.lng != null) {
          distanceKm = haversineKm(kirana.lat, kirana.lng, (w as any).lat, (w as any).lng);
        }
        return {
          wholesaler: w,
          inStockCount: inStock,
          lowStockCount: low,
          missingCount: missing,
          subtotal: Math.round(subtotal),
          tax: Math.round(tax),
          discount: Math.round(discount),
          total: Math.round(total),
          distanceKm,
          score: 0,
        } satisfies SupplierQuote;
      });
      const n = items.length || 1;
      const maxCost = Math.max(1, ...quotes.map(q => q.total));
      const maxDist = Math.max(1, ...quotes.map(q => q.distanceKm ?? 0));
      for (const q of quotes) {
        const coverage = (q.inStockCount + q.lowStockCount * 0.5) / n;
        const priceScore = q.total > 0 ? 1 - q.total / maxCost : 0;
        const distScore = q.distanceKm != null ? 1 - q.distanceKm / maxDist : 0.5;
        const verifiedBoost = q.wholesaler.verified ? 0.05 : 0;
        q.score = coverage * 0.55 + priceScore * 0.25 + distScore * 0.15 + verifiedBoost;
      }
      return quotes.sort((a, b) => b.score - a.score);
    },
    [wholesalers, stockFor],
  );

  return (
    <WholesalersContext.Provider value={{ wholesalers, isLoading, refresh, getById, isAvailable, stockFor, rankSuppliers }}>
      {children}
    </WholesalersContext.Provider>
  );
}

export function useWholesalers() {
  const ctx = useContext(WholesalersContext);
  if (!ctx) throw new Error("useWholesalers must be inside WholesalersProvider");
  return ctx;
}
