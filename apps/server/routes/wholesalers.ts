import { Router } from "express";
import { db } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/phone";
import { getActor } from "../lib/actor";

const router = Router();

async function ensureActorWholesaler(actor: { phone: string; wholesalerId?: string }): Promise<string> {
  if (!actor.wholesalerId) throw new Error("Missing wholesaler id");
  const normalizedPhone = normalizePhone(actor.phone);

  // Priority 1: exact doc exists
  const snap = await db.collection("wholesalers").doc(actor.wholesalerId).get();
  if (snap.exists) return actor.wholesalerId;

  // Priority 2: active wholesaler owned by this phone
  const byPhone = await db
    .collection("wholesalers")
    .where("ownerPhone", "in", [normalizedPhone, `+91${normalizedPhone}`])
    .where("active", "==", true)
    .limit(1)
    .get();
  if (!byPhone.empty) return byPhone.docs[0].id;

  // Priority 3: create from user data
  const userSnap = await db.collection("users").doc(normalizedPhone).get();
  const ud = userSnap.data();
  await db.collection("wholesalers").doc(actor.wholesalerId).set({
    id: actor.wholesalerId,
    name: ud?.shopName || `Wholesale ${actor.phone}`,
    ownerName: ud?.name || "Wholesaler",
    ownerPhone: normalizedPhone,
    location: "Unknown",
    active: true,
    verified: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return actor.wholesalerId;
}

function deg2rad(deg: number) { return deg * (Math.PI / 180); }

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /wholesalers — list active wholesalers with catalog
router.get("/wholesalers", async (req, res) => {
  try {
    const wsSnap = await db.collection("wholesalers").where("active", "==", true).get();
    const wholesalers = wsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Fetch catalog subcollections in parallel
    const catalogs = await Promise.all(
      wholesalers.map(w =>
        db.collection("wholesalers").doc(w.id).collection("catalog").get()
          .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
      )
    );

    let out = wholesalers.map((w, i) => ({
      ...w,
      catalog: catalogs[i].map((item: any) => ({
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

    // Dedup: one record per owner phone, prefer the one with more catalog items
    const byOwnerPhone = new Map<string, (typeof out)[number]>();
    for (const ws of out) {
      const key = normalizePhone(String(ws.ownerPhone ?? ""));
      const prev = byOwnerPhone.get(key);
      if (!prev || (ws.catalog?.length ?? 0) > (prev.catalog?.length ?? 0)) {
        byOwnerPhone.set(key, ws);
      }
    }
    out = Array.from(byOwnerPhone.values());

    // Sort by distance if lat/lng provided
    const latStr = req.query.lat as string | undefined;
    const lngStr = req.query.lng as string | undefined;
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isNaN(lat) && !isNaN(lng)) {
        out = out.map(w => ({
          ...w,
          computedDistance: (w.lat != null && w.lng != null) ? haversineKm(lat, lng, w.lat, w.lng) : Infinity,
        }));
        out.sort((a, b) => (a as any).computedDistance - (b as any).computedDistance);
      }
    }

    res.json({ wholesalers: out });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List wholesalers failed");
    res.status(500).json({ error: "Failed to load wholesalers" });
  }
});

// GET /wholesalers/:id
router.get("/wholesalers/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const snap = await db.collection("wholesalers").doc(id).get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
    const catalogSnap = await db.collection("wholesalers").doc(id).collection("catalog").orderBy("name").get();
    const catalog = catalogSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ wholesaler: { id: snap.id, ...snap.data(), catalog } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get wholesaler failed");
    res.status(500).json({ error: "Failed to load wholesaler" });
  }
});

// GET /wholesalers/:id/availability
router.get("/wholesalers/:id/availability", async (req, res) => {
  try {
    const snap = await db.collection("wholesalers").doc(String(req.params.id)).collection("catalog").get();
    const map: Record<string, boolean> = {};
    for (const d of snap.docs) {
      const item = d.data();
      map[String(item.name).toLowerCase()] = !!item.available;
    }
    res.json({ availability: map });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Availability failed");
    res.status(500).json({ error: "Failed to load availability" });
  }
});

// GET /wholesaler/settings
router.get("/wholesaler/settings", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const snap = await db.collection("wholesalers").doc(resolved).get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ settings: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get wholesaler settings failed");
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// PATCH /wholesaler/settings
router.patch("/wholesaler/settings", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const body = req.body as any;
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const writable = [
      "name", "ownerName", "location", "gstin", "fssai",
      "defaultTaxPercent", "defaultDiscountPercent",
      "defaultDeliveryTime", "fromAddress", "specialOffer",
    ];
    for (const k of writable) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    await db.collection("wholesalers").doc(resolved).update(patch);

    // Propagate shop name rename to user profile
    if (typeof body.name === "string" && body.name.trim()) {
      const phone = normalizePhone(actor.phone);
      await db.collection("users").doc(phone).update({
        shopName: body.name.trim(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const snap = await db.collection("wholesalers").doc(resolved).get();
    res.json({ settings: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Update wholesaler settings failed");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

const ALLOWED_UNITS = new Set(["kg", "litre", "box", "piece", "packet"]);

// POST /wholesaler/inventory/bulk
router.post("/wholesaler/inventory/bulk", async (req, res) => {
  try {
    const actor = await getActor(req);
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

    const cleaned = items
      .filter(i => {
        const anyName = String(i?.name ?? "").trim() || String(i?.nameTe ?? "").trim() || String(i?.nameHi ?? "").trim();
        return !!anyName;
      })
      .map(i => {
        const enName = String(i?.name ?? "").trim();
        const teName = String(i?.nameTe ?? "").trim();
        const hiName = String(i?.nameHi ?? "").trim();
        const canonical = enName || teName || hiName;
        const unit = ALLOWED_UNITS.has(String(i?.unit ?? "")) ? String(i.unit) : "kg";
        const price = Number.isFinite(Number(i?.pricePerUnit)) ? Math.max(0, Number(i.pricePerUnit)) : 0;
        return {
          name: canonical, nameTe: teName, nameHi: hiName, unit,
          pricePerUnit: price,
          available: i?.available === false ? false : price > 0,
          minOrderQty: Number(i?.minOrderQty) > 0 ? Number(i.minOrderQty) : 1,
          offer: i?.offer ?? null, category: i?.category ?? null,
          stockQuantity: Number.isFinite(Number(i?.stockQuantity)) ? Number(i.stockQuantity) : null,
          taxPercent: Number.isFinite(Number(i?.taxPercent)) ? Number(i.taxPercent) : null,
          discountType: i?.discountType ?? null,
          discountValue: Number.isFinite(Number(i?.discountValue)) ? Number(i.discountValue) : null,
          leadTime: i?.leadTime ?? null, extraInfo: i?.extraInfo ?? null,
        };
      });

    if (!cleaned.length) {
      res.status(400).json({ error: "No items to save — add a name to at least one row." });
      return;
    }

    // Load existing catalog for dedup
    const catRef = db.collection("wholesalers").doc(resolved).collection("catalog");
    const existingSnap = await catRef.get();
    const byName = new Map<string, { id: string; data: any }>();
    for (const d of existingSnap.docs) byName.set(d.data().name.trim().toLowerCase(), { id: d.id, data: d.data() });

    const allItems: any[] = [];
    let mergedCount = 0;

    const batch = db.batch();
    for (const row of cleaned) {
      const key = row.name.trim().toLowerCase();
      const prev = byName.get(key);
      if (prev) {
        mergedCount++;
        const newStock = (prev.data.stockQuantity ?? 0) + (row.stockQuantity ?? 0);
        const update = {
          nameTe: prev.data.nameTe || row.nameTe || "",
          nameHi: prev.data.nameHi || row.nameHi || "",
          unit: row.unit || prev.data.unit,
          pricePerUnit: row.pricePerUnit > 0 ? row.pricePerUnit : prev.data.pricePerUnit,
          stockQuantity: newStock > 0 ? newStock : prev.data.stockQuantity,
          taxPercent: row.taxPercent ?? prev.data.taxPercent,
          available: row.available || prev.data.available,
          updatedAt: FieldValue.serverTimestamp(),
        };
        batch.update(catRef.doc(prev.id), update);
        allItems.push({ id: prev.id, ...prev.data, ...update });
      } else {
        const newRef = catRef.doc();
        batch.set(newRef, { ...row, wholesalerId: resolved, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        allItems.push({ id: newRef.id, ...row, wholesalerId: resolved });
      }
    }
    await batch.commit();

    res.json({ items: allItems, count: allItems.length, newCount: allItems.length - mergedCount, mergedCount });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler bulk inventory failed");
    res.status(500).json({ error: "Failed to bulk add inventory" });
  }
});

// GET /wholesaler/insights
router.get("/wholesaler/insights", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);

    const catRef = db.collection("wholesalers").doc(resolved).collection("catalog");
    const catalogSnap = await catRef.get();
    const catalog = catalogSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const lowStock = catalog.filter(c => c.stockQuantity != null && c.stockQuantity > 0 && c.stockQuantity < 5)
      .map(c => ({ name: c.name, stock: c.stockQuantity, unit: c.unit, pricePerUnit: c.pricePerUnit }));
    const outOfStock = catalog.filter(c => c.stockQuantity != null && c.stockQuantity <= 0)
      .map(c => ({ name: c.name, unit: c.unit }));

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentOrdersSnap = await db.collection("orders")
      .where("wholesalerId", "==", resolved)
      .where("createdAt", ">", ninetyDaysAgo)
      .get();

    const orderItems: any[] = (await Promise.all(
      recentOrdersSnap.docs.map(d => d.ref.collection("items").get().then(s => s.docs.map(i => i.data())))
    )).flat();

    const tally = new Map<string, number>();
    for (const oi of orderItems) {
      const key = String(oi.name).trim().toLowerCase();
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const tallyEntries = Array.from(tally.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    const catalogByLowerName = new Map(catalog.map(c => [c.name.trim().toLowerCase(), c]));
    const hotSellers = tallyEntries.filter(t => catalogByLowerName.has(t.key)).slice(0, 8)
      .map(t => { const c = catalogByLowerName.get(t.key)!; return { name: c.name, orderedTimes: t.count, currentStock: c.stockQuantity, unit: c.unit }; });
    const slowMovers = catalog.filter(c => (c.stockQuantity ?? 0) > 0)
      .map(c => ({ name: c.name, unit: c.unit, stock: c.stockQuantity, orderedTimes: tally.get(c.name.trim().toLowerCase()) ?? 0 }))
      .filter(c => c.orderedTimes === 0).slice(0, 8);
    const missedDemand = tallyEntries.filter(t => !catalogByLowerName.has(t.key)).slice(0, 8)
      .map(t => ({ name: t.key, askedTimes: t.count }));

    res.json({
      windowDays: 90,
      summary: { totalCatalogItems: catalog.length, recentOrderCount: recentOrdersSnap.size, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length },
      lowStock, outOfStock, hotSellers, slowMovers, missedDemand,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler insights failed");
    res.status(500).json({ error: "Failed to load insights" });
  }
});

// GET /wholesaler/inventory
router.get("/wholesaler/inventory", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const snap = await db.collection("wholesalers").doc(resolved).collection("catalog").orderBy("name").get();
    res.json({ inventory: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory list failed");
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// POST /wholesaler/inventory
router.post("/wholesaler/inventory", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const body = req.body as any;
    const anyName = String(body?.name ?? "").trim() || String(body?.nameTe ?? "").trim() || String(body?.nameHi ?? "").trim();
    if (!anyName) { res.status(400).json({ error: "Item needs a name." }); return; }

    const pricePerUnit = Number.isFinite(Number(body.pricePerUnit)) ? Math.max(0, Number(body.pricePerUnit)) : 0;
    const stockQuantity = Number.isFinite(Number(body.stockQuantity)) ? Math.max(0, Number(body.stockQuantity)) : 0;
    const available = body.available === true ? true : (pricePerUnit > 0 && stockQuantity > 0);
    const unit = ALLOWED_UNITS.has(String(body?.unit ?? "")) ? String(body.unit) : "kg";

    const catRef = db.collection("wholesalers").doc(resolved).collection("catalog");
    const existingSnap = await catRef.get();
    const dupe = existingSnap.docs.find(d => d.data().name.trim().toLowerCase() === anyName.trim().toLowerCase());

    if (dupe) {
      const prev = dupe.data();
      const mergedStock = (prev.stockQuantity ?? 0) + stockQuantity;
      const update = {
        nameTe: prev.nameTe || body.nameTe || "",
        nameHi: prev.nameHi || body.nameHi || "",
        unit: unit || prev.unit,
        pricePerUnit: pricePerUnit > 0 ? pricePerUnit : prev.pricePerUnit,
        stockQuantity: mergedStock > 0 ? mergedStock : prev.stockQuantity,
        taxPercent: body.taxPercent ?? prev.taxPercent ?? null,
        available: available || prev.available,
        minOrderQty: body.minOrderQty ?? prev.minOrderQty,
        offer: body.offer ?? prev.offer, category: body.category ?? prev.category,
        discountType: body.discountType ?? prev.discountType,
        discountValue: body.discountValue ?? prev.discountValue,
        leadTime: body.leadTime ?? prev.leadTime, extraInfo: body.extraInfo ?? prev.extraInfo,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await dupe.ref.update(update);
      res.json({ item: { id: dupe.id, ...prev, ...update }, merged: true });
      return;
    }

    const newRef = catRef.doc();
    const data = {
      wholesalerId: resolved, name: anyName,
      nameTe: body.nameTe ?? "", nameHi: body.nameHi ?? "",
      unit, pricePerUnit, available, stockQuantity,
      minOrderQty: body.minOrderQty ?? 1, offer: body.offer ?? null,
      category: body.category ?? null, taxPercent: body.taxPercent ?? null,
      discountType: body.discountType ?? null, discountValue: body.discountValue ?? null,
      leadTime: body.leadTime ?? null, extraInfo: body.extraInfo ?? null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    await newRef.set(data);
    res.json({ item: { id: newRef.id, ...data } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory create failed");
    res.status(500).json({ error: "Failed to create item" });
  }
});

// PATCH /wholesaler/inventory/:itemId
router.patch("/wholesaler/inventory/:itemId", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const itemId = String(req.params.itemId);
    const body = req.body as any;

    const itemRef = db.collection("wholesalers").doc(resolved).collection("catalog").doc(itemId);
    const snap = await itemRef.get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
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

    await itemRef.update(patch);
    const updated = await itemRef.get();
    res.json({ item: { id: updated.id, ...updated.data() } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory update failed");
    res.status(500).json({ error: err?.message || "Failed to update item" });
  }
});

// DELETE /wholesaler/inventory/:itemId
router.delete("/wholesaler/inventory/:itemId", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler" || !actor.wholesalerId) {
      res.status(403).json({ error: "Wholesaler access required" });
      return;
    }
    const resolved = await ensureActorWholesaler(actor);
    const itemId = String(req.params.itemId);
    await db.collection("wholesalers").doc(resolved).collection("catalog").doc(itemId).delete();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Wholesaler inventory delete failed");
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router;
