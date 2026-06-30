import { Router } from "express";
import { db, hasDb, wholesalersTable, catalogItemsTable, usersTable, ordersTable, orderItemsTable } from "@workspace/db";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/phone";
import { getActor } from "../lib/actor";

const router = Router();

function isMissingColumnError(err: unknown): boolean {
  const msg = (err as any)?.message;
  return typeof msg === "string" && /column .* does not exist/i.test(msg);
}

async function ensureActorWholesaler(actor: { phone: string; wholesalerId?: string }): Promise<string> {
  if (!actor.wholesalerId) {
    throw new Error("Missing wholesaler id");
  }
  const normalizedPhone = normalizePhone(actor.phone);

  // PRIORITY 1: prefer the exact wholesalerId the caller is claiming. This is
  // the user's stored session value and must always win, even if there happen
  // to be other (legacy) wholesaler records with the same owner phone.
  const exactById = await db
    .select({ id: wholesalersTable.id })
    .from(wholesalersTable)
    .where(eq(wholesalersTable.id, actor.wholesalerId))
    .limit(1);
  if (exactById.length) return exactById[0].id;

  // PRIORITY 2: fall back to any ACTIVE wholesaler owned by this phone. We
  // only consider active records — deactivated dupes can't be picked here.
  const byPhone = await db
    .select({ id: wholesalersTable.id })
    .from(wholesalersTable)
    .where(
      and(
        eq(wholesalersTable.active, true),
        or(
          eq(wholesalersTable.ownerPhone, normalizedPhone),
          eq(wholesalersTable.ownerPhone, `+91${normalizedPhone}`),
        ),
      ),
    )
    .limit(1);
  if (byPhone.length) return byPhone[0].id;

  // PRIORITY 3: nothing found — create a new wholesaler record.
  const userRow = await db
    .select({ name: usersTable.name, shopName: usersTable.shopName })
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone))
    .limit(1);
  await db.insert(wholesalersTable).values({
    id: actor.wholesalerId,
    name: userRow[0]?.shopName || `Wholesale ${actor.phone}`,
    ownerName: userRow[0]?.name || "Wholesaler",
    ownerPhone: normalizedPhone,
    location: "Unknown",
    distance: "Unknown",
    active: true,
  });
  return actor.wholesalerId;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

router.get("/wholesalers", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const wholesalers = await db
      .select()
      .from(wholesalersTable)
      .where(eq(wholesalersTable.active, true))
      .orderBy(asc(wholesalersTable.name));

    const ids = wholesalers.map(w => w.id);
    const catalogRows = ids.length
      ? await db.select().from(catalogItemsTable)
      : [];
    const grouped: Record<string, typeof catalogRows> = {};
    for (const item of catalogRows) {
      (grouped[item.wholesalerId] ??= []).push(item);
    }
    
    let out = wholesalers.map(w => ({
      ...w,
      catalog: (grouped[w.id] ?? []).map((item: any) => ({
        ...item,
        category: item.category ?? null,
        stockQuantity: item.stockQuantity ?? null,
        taxPercent: item.taxPercent ?? null,
        discountType: item.discountType ?? null,
        discountValue: item.discountValue ?? null,
        leadTime: item.leadTime ?? null,
        extraInfo: item.extraInfo ?? null,
      })),
    }));
    const byOwnerPhone = new Map<string, (typeof out)[number]>();
    for (const ws of out) {
      const key = normalizePhone(ws.ownerPhone);
      const prev = byOwnerPhone.get(key);
      if (!prev || (ws.catalog?.length ?? 0) > (prev.catalog?.length ?? 0)) {
        byOwnerPhone.set(key, ws);
      }
    }
    out = Array.from(byOwnerPhone.values());

    const latStr = req.query.lat as string | undefined;
    const lngStr = req.query.lng as string | undefined;
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) {
        out = out.map(w => {
          if (w.lat != null && w.lng != null) {
            const dist = calculateDistance(lat, lng, w.lat, w.lng);
            return { ...w, computedDistance: dist };
          }
          return { ...w, computedDistance: Infinity };
        });
        out.sort((a, b) => (a as any).computedDistance - (b as any).computedDistance);
      }
    }

    res.json({ wholesalers: out });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List wholesalers failed");
    res.status(500).json({ error: "Failed to load wholesalers" });
  }
});

router.get("/wholesalers/:id", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const id = String(req.params.id);
    const rows = await db.select().from(wholesalersTable).where(eq(wholesalersTable.id, id)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const catalog = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, id))
      .orderBy(asc(catalogItemsTable.name));
    res.json({ wholesaler: { ...rows[0], catalog } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get wholesaler failed");
    res.status(500).json({ error: "Failed to load wholesaler" });
  }
});

// Availability lookup used by the review screen.
router.get("/wholesalers/:id/availability", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const items = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, String(req.params.id)));
    const map: Record<string, boolean> = {};
    for (const i of items) map[i.name.toLowerCase()] = i.available;
    res.json({ availability: map });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Availability failed");
    res.status(500).json({ error: "Failed to load availability" });
  }
});

router.get("/wholesaler/settings", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const [row] = await db
      .select()
      .from(wholesalersTable)
      .where(eq(wholesalersTable.id, resolved))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ settings: row });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get wholesaler settings failed");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.patch("/wholesaler/settings", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const body = req.body as any;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const writable = [
      "name", "ownerName", "location", "gstin", "fssai",
      "defaultTaxPercent", "defaultDiscountPercent",
      "defaultDeliveryTime", "fromAddress", "specialOffer",
    ];
    for (const k of writable) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const [row] = await db
      .update(wholesalersTable)
      .set(patch as any)
      .where(eq(wholesalersTable.id, resolved))
      .returning();

    // If the wholesaler renamed their shop, propagate to users.shopName so
    // the dashboard header (which reads from the user record) reflects the
    // new name immediately on next reload.
    if (typeof body.name === "string" && body.name.trim()) {
      const normalizedPhone = normalizePhone(actor.phone);
      await db
        .update(usersTable)
        .set({ shopName: body.name.trim(), updatedAt: new Date() })
        .where(eq(usersTable.phone, normalizedPhone));
    }

    res.json({ settings: row });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Update wholesaler settings failed");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/wholesaler/inventory/bulk", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const { items } = req.body as { items: any[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array required" });
      return;
    }
    // Be lenient — accept any row that has SOME name. Missing price/stock
    // is OK; the wholesaler can fill those in later from the My Stock list.
    // Items with price=0 are saved unavailable so a kirana can't order them yet.
    const ALLOWED_UNITS = new Set(["kg", "litre", "box", "piece", "packet"]);
    const cleaned = items
      .filter((i) => {
        const anyName = String(i?.name ?? "").trim() || String(i?.nameTe ?? "").trim() || String(i?.nameHi ?? "").trim();
        return !!anyName;
      })
      .map((i) => {
        const enName = String(i?.name ?? "").trim();
        const teName = String(i?.nameTe ?? "").trim();
        const hiName = String(i?.nameHi ?? "").trim();
        const canonical = enName || teName || hiName;
        const unit = ALLOWED_UNITS.has(String(i?.unit ?? "")) ? String(i.unit) : "kg";
        const price = Number.isFinite(Number(i?.pricePerUnit)) ? Math.max(0, Number(i.pricePerUnit)) : 0;
        return {
          wholesalerId: resolved,
          name: canonical,
          nameTe: teName,
          nameHi: hiName,
          unit,
          pricePerUnit: price,
          // If no price yet, hide from kiranas until the wholesaler sets one.
          available: i?.available === false ? false : price > 0,
          minOrderQty: Number(i?.minOrderQty) > 0 ? Number(i.minOrderQty) : 1,
          offer: i?.offer ?? null,
          category: i?.category ?? null,
          stockQuantity: Number.isFinite(Number(i?.stockQuantity)) ? Number(i.stockQuantity) : null,
          taxPercent: Number.isFinite(Number(i?.taxPercent)) ? Number(i.taxPercent) : null,
          discountType: i?.discountType ?? null,
          discountValue: Number.isFinite(Number(i?.discountValue)) ? Number(i.discountValue) : null,
          leadTime: i?.leadTime ?? null,
          extraInfo: i?.extraInfo ?? null,
        };
      });
    if (!cleaned.length) {
      res.status(400).json({ error: "No items to save — add a name to at least one row." });
      return;
    }
    // Dedupe: if an item with the same lowercase name already exists for
    // this wholesaler, merge rather than create a duplicate. Updates price,
    // stock, tax to the latest scanned values. Adds incoming stock onto the
    // existing pile (so re-scanning a fresh stock-take adds, not replaces).
    const existing = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, resolved));
    const byName = new Map<string, typeof existing[number]>();
    for (const e of existing) byName.set(e.name.trim().toLowerCase(), e);

    const toInsert: typeof cleaned = [];
    const updated: any[] = [];
    let mergedCount = 0;
    for (const row of cleaned) {
      const key = row.name.trim().toLowerCase();
      const prev = byName.get(key);
      if (!prev) {
        toInsert.push(row);
        continue;
      }
      mergedCount += 1;
      // Merge: take latest unit/price/tax, ADD stock (treating scan as a delivery).
      const newStock = (prev.stockQuantity ?? 0) + (row.stockQuantity ?? 0);
      const [u] = await db
        .update(catalogItemsTable)
        .set({
          // Preserve any earlier language fields the wholesaler already filled.
          nameTe: prev.nameTe || row.nameTe || "",
          nameHi: prev.nameHi || row.nameHi || "",
          unit: row.unit || prev.unit,
          pricePerUnit: row.pricePerUnit > 0 ? row.pricePerUnit : prev.pricePerUnit,
          stockQuantity: newStock > 0 ? newStock : prev.stockQuantity,
          taxPercent: row.taxPercent ?? prev.taxPercent,
          available: row.available || prev.available,
          updatedAt: new Date(),
        })
        .where(eq(catalogItemsTable.id, prev.id))
        .returning();
      if (u) updated.push(u);
    }

    let inserted: any[] = [];
    if (toInsert.length) {
      inserted = await db.insert(catalogItemsTable).values(toInsert).returning();
    }
    const allItems = [...inserted, ...updated];
    res.json({
      items: allItems,
      count: allItems.length,
      newCount: inserted.length,
      mergedCount,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler bulk inventory failed");
    res.status(500).json({ error: "Failed to bulk add inventory" });
  }
});

/**
 * Wholesaler insights — low stock, hot sellers, slow movers, and what
 * kiranas have asked for that the wholesaler doesn't yet stock.
 * Everything is computed per-request; no caching, fully real-time.
 */
router.get("/wholesaler/insights", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);

    // 1. Catalog state — split into low / out / plenty.
    const catalog = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, resolved));
    type CatRow = typeof catalogItemsTable.$inferSelect;
    type OrderItemRow = typeof orderItemsTable.$inferSelect;
    const lowStock = (catalog as CatRow[])
      .filter((c: CatRow) => c.stockQuantity != null && (c.stockQuantity as number) > 0 && (c.stockQuantity as number) < 5)
      .map((c: CatRow) => ({ name: c.name, stock: c.stockQuantity, unit: c.unit, pricePerUnit: c.pricePerUnit }));
    const outOfStock = (catalog as CatRow[])
      .filter((c: CatRow) => c.stockQuantity != null && (c.stockQuantity as number) <= 0)
      .map((c: CatRow) => ({ name: c.name, unit: c.unit }));

    // 2. Frequency of items ordered FROM this wholesaler in the last 90 days.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentOrders = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.wholesalerId, resolved),
        gt(ordersTable.createdAt, ninetyDaysAgo),
      ));
    const recentOrderIds: string[] = recentOrders.map((o: { id: string }) => o.id);
    const itemsForOrders: OrderItemRow[] = recentOrderIds.length
      ? (await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, recentOrderIds))) as OrderItemRow[]
      : [];

    // Tally by normalized item name across recent orders.
    const tally = new Map<string, number>();
    for (const oi of itemsForOrders) {
      const key = oi.name.trim().toLowerCase();
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const tallyEntries: { key: string; count: number }[] = Array.from(tally.entries()).map(([key, count]) => ({ key, count }));
    tallyEntries.sort((a, b) => b.count - a.count);

    // 3. Hot sellers — items the wholesaler stocks AND that recur frequently.
    const catalogByLowerName = new Map<string, CatRow>(
      (catalog as CatRow[]).map((c: CatRow): [string, CatRow] => [c.name.trim().toLowerCase(), c])
    );
    const hotSellers = tallyEntries
      .filter((t) => catalogByLowerName.has(t.key))
      .slice(0, 8)
      .map((t) => {
        const cat = catalogByLowerName.get(t.key)!;
        return { name: cat.name, orderedTimes: t.count, currentStock: cat.stockQuantity, unit: cat.unit };
      });

    // 4. Slow movers — items in catalog NOT ordered (or rarely) in the window.
    const slowMovers = (catalog as CatRow[])
      .filter((c: CatRow) => (c.stockQuantity ?? 0) > 0)
      .map((c: CatRow) => ({
        name: c.name,
        unit: c.unit,
        stock: c.stockQuantity,
        orderedTimes: tally.get(c.name.trim().toLowerCase()) ?? 0,
      }))
      .filter((c) => c.orderedTimes === 0)
      .slice(0, 8);

    // 5. Missed demand — items asked for in orders but NOT in catalog.
    const missedDemand = tallyEntries
      .filter((t) => !catalogByLowerName.has(t.key))
      .slice(0, 8)
      .map((t) => ({ name: t.key, askedTimes: t.count }));

    res.json({
      windowDays: 90,
      summary: {
        totalCatalogItems: catalog.length,
        recentOrderCount: recentOrders.length,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length,
      },
      lowStock,
      outOfStock,
      hotSellers,
      slowMovers,
      missedDemand,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler insights failed");
    res.status(500).json({ error: "Failed to load insights" });
  }
});

router.get("/wholesaler/inventory", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolvedWholesalerId = await ensureActorWholesaler(actor);
    const rows = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, resolvedWholesalerId))
      .orderBy(asc(catalogItemsTable.name));
    res.json({ inventory: rows });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory list failed");
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

router.post("/wholesaler/inventory", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolvedWholesalerId = await ensureActorWholesaler(actor);
    const body = req.body as any;
    const anyName = String(body?.name ?? "").trim() || String(body?.nameTe ?? "").trim() || String(body?.nameHi ?? "").trim();
    if (!anyName) {
      res.status(400).json({ error: "Item needs a name." });
      return;
    }
    // Price and stock are now optional — wholesaler can edit later.
    // Missing or invalid values are coerced to 0.
    const pricePerUnit = Number.isFinite(Number(body.pricePerUnit)) ? Math.max(0, Number(body.pricePerUnit)) : 0;
    const stockQuantity = Number.isFinite(Number(body.stockQuantity)) ? Math.max(0, Number(body.stockQuantity)) : 0;
    // Hide from kirana until both fields are usable, unless wholesaler explicitly opted in.
    const explicitlyAvailable = body.available === true;
    const available = explicitlyAvailable ? true : (pricePerUnit > 0 && stockQuantity > 0);
    const ALLOWED_UNITS = new Set(["kg", "litre", "box", "piece", "packet"]);
    const unit = ALLOWED_UNITS.has(String(body?.unit ?? "")) ? String(body.unit) : "kg";

    // Dedupe: if an item with the same name (case-insensitive) already
    // exists for this wholesaler, MERGE instead of creating a duplicate.
    const existingSame = await db
      .select()
      .from(catalogItemsTable)
      .where(eq(catalogItemsTable.wholesalerId, resolvedWholesalerId));
    const dupe = existingSame.find(e => e.name.trim().toLowerCase() === anyName.trim().toLowerCase());
    if (dupe) {
      const mergedStock = (dupe.stockQuantity ?? 0) + stockQuantity;
      const [merged] = await db
        .update(catalogItemsTable)
        .set({
          nameTe: dupe.nameTe || body.nameTe || "",
          nameHi: dupe.nameHi || body.nameHi || "",
          unit: unit || dupe.unit,
          pricePerUnit: pricePerUnit > 0 ? pricePerUnit : dupe.pricePerUnit,
          stockQuantity: mergedStock > 0 ? mergedStock : dupe.stockQuantity,
          taxPercent: body.taxPercent ?? dupe.taxPercent ?? null,
          available: available || dupe.available,
          minOrderQty: body.minOrderQty ?? dupe.minOrderQty,
          offer: body.offer ?? dupe.offer,
          category: body.category ?? dupe.category,
          discountType: body.discountType ?? dupe.discountType,
          discountValue: body.discountValue ?? dupe.discountValue,
          leadTime: body.leadTime ?? dupe.leadTime,
          extraInfo: body.extraInfo ?? dupe.extraInfo,
          updatedAt: new Date(),
        })
        .where(eq(catalogItemsTable.id, dupe.id))
        .returning();
      res.json({ item: merged, merged: true });
      return;
    }

    let row: any;
    try {
      const inserted = await db.insert(catalogItemsTable).values({
        wholesalerId: resolvedWholesalerId,
        name: anyName,
        nameTe: body.nameTe ?? "",
        nameHi: body.nameHi ?? "",
        unit,
        pricePerUnit,
        available,
        minOrderQty: body.minOrderQty ?? 1,
        offer: body.offer ?? null,
        category: body.category ?? null,
        stockQuantity,
        taxPercent: body.taxPercent ?? null,
        discountType: body.discountType ?? null,
        discountValue: body.discountValue ?? null,
        leadTime: body.leadTime ?? null,
        extraInfo: body.extraInfo ?? null,
      }).returning();
      row = inserted[0];
    } catch (err: any) {
      // Backward-compatible insert for partially migrated DB schema.
      if (!isMissingColumnError(err)) throw err;
      const inserted = await db.insert(catalogItemsTable).values({
        wholesalerId: resolvedWholesalerId,
        name: anyName,
        nameTe: body.nameTe ?? "",
        nameHi: body.nameHi ?? "",
        unit,
        pricePerUnit,
        available,
        minOrderQty: body.minOrderQty ?? 1,
        offer: body.offer ?? null,
      }).returning();
      row = inserted[0];
    }
    res.json({ item: row });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory create failed");
    res.status(500).json({ error: "Failed to create item" });
  }
});

router.patch("/wholesaler/inventory/:itemId", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolvedWholesalerId = await ensureActorWholesaler(actor);
    const itemId = Number(String(req.params.itemId));
    if (!Number.isFinite(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
    // Whitelist mutable columns. We were previously spreading req.body
    // wholesale which included `id`, `createdAt`, etc. — those are either
    // immutable or wrong type (string instead of Date) and made drizzle
    // explode with a 500.
    const body = req.body as any;
    const ALLOWED_UNITS = new Set(["kg", "litre", "box", "piece", "packet"]);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.nameTe === "string") patch.nameTe = body.nameTe;
    if (typeof body.nameHi === "string") patch.nameHi = body.nameHi;
    if (typeof body.unit === "string" && ALLOWED_UNITS.has(body.unit)) patch.unit = body.unit;
    if (Number.isFinite(Number(body.pricePerUnit))) patch.pricePerUnit = Math.max(0, Number(body.pricePerUnit));
    if (body.stockQuantity === null) patch.stockQuantity = null;
    else if (Number.isFinite(Number(body.stockQuantity))) patch.stockQuantity = Math.max(0, Number(body.stockQuantity));
    if (typeof body.available === "boolean") patch.available = body.available;
    if (Number.isFinite(Number(body.minOrderQty))) patch.minOrderQty = Math.max(0, Number(body.minOrderQty));
    if (body.offer !== undefined) patch.offer = body.offer === "" ? null : body.offer;
    if (body.category !== undefined) patch.category = body.category === "" ? null : body.category;
    if (Number.isFinite(Number(body.taxPercent))) patch.taxPercent = Math.max(0, Math.min(100, Number(body.taxPercent)));
    if (body.discountType !== undefined) patch.discountType = body.discountType;
    if (Number.isFinite(Number(body.discountValue))) patch.discountValue = Number(body.discountValue);
    if (body.leadTime !== undefined) patch.leadTime = body.leadTime === "" ? null : body.leadTime;
    if (body.extraInfo !== undefined) patch.extraInfo = body.extraInfo === "" ? null : body.extraInfo;

    const [row] = await db
      .update(catalogItemsTable)
      .set(patch as any)
      .where(and(eq(catalogItemsTable.id, itemId), eq(catalogItemsTable.wholesalerId, resolvedWholesalerId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ item: row });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory update failed");
    res.status(500).json({ error: err?.message || "Failed to update item" });
  }
});

router.delete("/wholesaler/inventory/:itemId", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolvedWholesalerId = await ensureActorWholesaler(actor);
    const itemId = Number(String(req.params.itemId));
    if (!Number.isFinite(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db
      .delete(catalogItemsTable)
      .where(and(eq(catalogItemsTable.id, itemId), eq(catalogItemsTable.wholesalerId, resolvedWholesalerId)));
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory delete failed");
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router;
