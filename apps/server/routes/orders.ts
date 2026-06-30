import { Router } from "express";
import { db } from "../lib/firebase";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "../lib/logger";
import { isItemInCatalog } from "../lib/catalogMatchServer";
import { normalizePhone } from "../lib/phone";
import { getActor } from "../lib/actor";

const router = Router();

type Status = "pending" | "confirmed" | "out_for_delivery" | "delivered" | "cancelled";

function parseQty(v: string): number {
  const m = String(v ?? "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

function neededInCatalogUnit(orderQty: string, catalogUnit: string | null | undefined): number {
  const s = String(orderQty ?? "").toLowerCase().trim();
  const num = s.match(/(\d+(?:\.\d+)?)/);
  const value = num ? Number(num[1]) : 1;
  const rest = s.slice(num ? (num.index ?? 0) + num[0].length : 0).replace(/[^a-z]/g, "");
  const cat = String(catalogUnit ?? "").toLowerCase();
  if ((rest.startsWith("gm") || rest === "g" || rest.startsWith("gram")) && cat === "kg") return value / 1000;
  if ((rest === "kg" || rest.startsWith("kilo")) && (cat === "gm" || cat === "g")) return value * 1000;
  if (rest === "ml" && (cat === "litre" || cat === "l")) return value / 1000;
  if ((rest === "l" || rest.startsWith("liter") || rest.startsWith("litre")) && cat === "ml") return value * 1000;
  return value;
}

function toValidNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function extractRatingFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/\[rating:(\d)\]/i);
  if (!m) return null;
  const v = Number(m[1]);
  return (Number.isInteger(v) && v >= 1 && v <= 5) ? v : null;
}

function extractKiranaRatingFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/\[kirana_rating:(\d)\]/i);
  if (!m) return null;
  const v = Number(m[1]);
  return (Number.isInteger(v) && v >= 1 && v <= 5) ? v : null;
}

async function getWholesalerAliases(actor: { phone: string; wholesalerId?: string }): Promise<string[]> {
  const normalizedPhone = normalizePhone(actor.phone);
  const snap = await db.collection("wholesalers")
    .where("ownerPhone", "in", [normalizedPhone, `+91${normalizedPhone}`])
    .get();
  const ids = new Set(snap.docs.map(d => d.id));
  if (actor.wholesalerId) ids.add(actor.wholesalerId);
  return Array.from(ids);
}

async function hydrateOrders(orderDocs: any[]) {
  if (!orderDocs.length) return new Map<string, any[]>();
  const results = await Promise.all(
    orderDocs.map(async (o: any) => {
      const snap = await db.collection("orders").doc(o.id).collection("items").get();
      return { orderId: o.id, items: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
    })
  );
  const map = new Map<string, any[]>();
  for (const { orderId, items } of results) map.set(orderId, items);
  return map;
}

function enrichOrder(doc: any, items: any[]) {
  return {
    ...doc,
    subtotalAmount: doc.subtotalAmount ?? null,
    tax: doc.tax ?? null,
    invoiceNumber: doc.invoiceNumber ?? null,
    invoiceImageUrl: doc.invoiceImageUrl ?? null,
    paymentStatus: doc.paymentStatus ?? null,
    fromAddress: doc.fromAddress ?? null,
    toAddress: doc.toAddress ?? null,
    deliveryAddress: doc.deliveryAddress ?? null,
    items: items.map(i => ({
      name: i.name,
      nameTe: i.nameTe ?? "",
      nameHi: i.nameHi ?? "",
      sourceLanguage: i.sourceLanguage ?? null,
      quantity: i.quantity,
      available: !!i.available,
    })),
  };
}

// POST /orders — kirana places an order
router.post("/orders", async (req, res) => {
  try {
    const body = req.body as {
      kiranaPhone: string; kiranaName: string; shopName: string;
      wholesalerId: string;
      items: { name: string; nameTe?: string; nameHi?: string; sourceLanguage?: string | null; quantity: string; available: boolean }[];
      notes?: string;
      deliveryAddress?: string;
    };
    const actor = await getActor(req);
    if (!actor || actor.role !== "kirana" || normalizePhone(actor.phone) !== normalizePhone(body.kiranaPhone)) {
      res.status(403).json({ error: "Only the logged-in kirana can place this order" });
      return;
    }
    if (!body.kiranaPhone || !body.wholesalerId || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: "kiranaPhone, wholesalerId, items required" });
      return;
    }

    // Ensure kirana user record exists
    const phone = normalizePhone(body.kiranaPhone);
    const userRef = db.collection("users").doc(phone);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set({
        phone, role: "kirana", name: body.kiranaName, shopName: body.shopName, language: "te",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const id = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const orderData = {
      id,
      kiranaPhone: body.kiranaPhone,
      kiranaName: body.kiranaName,
      shopName: body.shopName,
      wholesalerId: body.wholesalerId,
      status: "pending" as Status,
      notes: body.notes ?? null,
      deliveryAddress: body.deliveryAddress ?? null,
      toAddress: body.deliveryAddress ?? null,
      paymentStatus: "pending",
      totalAmount: null,
      discount: null,
      deliveryTime: null,
      invoiceNote: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const orderRef = db.collection("orders").doc(id);
    await orderRef.set(orderData);

    if (body.items.length) {
      const batch = db.batch();
      for (const item of body.items) {
        const itemRef = orderRef.collection("items").doc();
        batch.set(itemRef, {
          orderId: id,
          name: item.name,
          nameTe: item.nameTe ?? "",
          nameHi: item.nameHi ?? "",
          sourceLanguage: item.sourceLanguage ?? null,
          quantity: item.quantity,
          available: !!item.available,
        });
      }
      await batch.commit();
    }

    res.json({ order: { ...orderData, items: body.items } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Create order failed");
    res.status(500).json({ error: "Failed to create order" });
  }
});

// GET /orders/by-kirana/:phone
router.get("/orders/by-kirana/:phone", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "kirana" || normalizePhone(actor.phone) !== normalizePhone(String(req.params.phone))) {
      res.status(403).json({ error: "Unauthorized for this kirana orders list" });
      return;
    }
    const snap = await db.collection("orders")
      .where("kiranaPhone", "==", String(req.params.phone))
      .orderBy("createdAt", "desc")
      .get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const itemsMap = await hydrateOrders(docs);
    res.json({ orders: docs.map(d => enrichOrder(d, itemsMap.get(d.id) ?? [])) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List by kirana failed");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// GET /orders/by-wholesaler/:id
router.get("/orders/by-wholesaler/:id", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler") {
      res.status(403).json({ error: "Unauthorized for this wholesaler orders list" });
      return;
    }
    const aliases = await getWholesalerAliases(actor);
    if (!aliases.includes(String(req.params.id))) {
      res.status(403).json({ error: "Unauthorized for this wholesaler orders list" });
      return;
    }

    const sinceRaw = req.query.since as string | undefined;
    const since = sinceRaw ? new Date(sinceRaw) : null;

    // Firestore `in` supports up to 30 items — aliases are always 1–3
    let query = db.collection("orders").where("wholesalerId", "in", aliases);
    if (since && !isNaN(since.getTime())) {
      query = query.where("updatedAt", ">", Timestamp.fromDate(since)) as any;
    }
    const snap = await (query as any).orderBy("createdAt", "desc").get();
    const docs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const itemsMap = await hydrateOrders(docs);
    res.json({ orders: docs.map((d: any) => enrichOrder(d, itemsMap.get(d.id) ?? [])) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List by wholesaler failed");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

// GET /orders/:id
router.get("/orders/:id", async (req, res) => {
  try {
    const snap = await db.collection("orders").doc(String(req.params.id)).get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
    const actor = await getActor(req);
    if (!actor) { res.status(401).json({ error: "Missing user context" }); return; }
    const order = { id: snap.id, ...snap.data() } as any;

    if (actor.role === "kirana" && normalizePhone(order.kiranaPhone) !== normalizePhone(actor.phone)) {
      res.status(403).json({ error: "Unauthorized for this order" }); return;
    }
    if (actor.role === "wholesaler") {
      const aliases = await getWholesalerAliases(actor);
      if (!aliases.includes(order.wholesalerId)) {
        res.status(403).json({ error: "Unauthorized for this order" }); return;
      }
    }

    const itemsSnap = await snap.ref.collection("items").get();
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ order: enrichOrder(order, items) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get order failed");
    res.status(500).json({ error: "Failed to load order" });
  }
});

// PATCH /orders/:id
router.patch("/orders/:id", async (req, res) => {
  try {
    const body = req.body as {
      status?: Status;
      totalAmount?: number; subtotalAmount?: number; tax?: number; discount?: number;
      deliveryTime?: string; invoiceNote?: string; invoiceNumber?: string;
      paymentStatus?: string; fromAddress?: string; toAddress?: string;
      deliveryAddress?: string; invoiceImageUrl?: string;
    };
    const actor = await getActor(req);
    if (!actor || actor.role !== "wholesaler") {
      res.status(403).json({ error: "Only wholesalers can update orders" });
      return;
    }

    const orderRef = db.collection("orders").doc(String(req.params.id));
    const existing = await orderRef.get();
    if (!existing.exists) { res.status(404).json({ error: "Not found" }); return; }
    const existingData = existing.data() as any;

    const aliases = await getWholesalerAliases(actor);
    if (!aliases.includes(existingData.wholesalerId)) {
      res.status(403).json({ error: "Unauthorized for this order" }); return;
    }

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.status) {
      const allowed: Status[] = ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"];
      if (!allowed.includes(body.status)) { res.status(400).json({ error: "Invalid status" }); return; }
      patch.status = body.status;
    }
    if (body.totalAmount !== undefined) patch.totalAmount = toValidNumber(body.totalAmount);
    if (body.subtotalAmount !== undefined) patch.subtotalAmount = toValidNumber(body.subtotalAmount);
    if (body.tax !== undefined) patch.tax = toValidNumber(body.tax);
    if (body.discount !== undefined) patch.discount = toValidNumber(body.discount);
    if (body.deliveryTime !== undefined) patch.deliveryTime = body.deliveryTime;
    if (body.invoiceNote !== undefined) patch.invoiceNote = body.invoiceNote;
    if (body.invoiceNumber !== undefined) patch.invoiceNumber = body.invoiceNumber;
    if (body.paymentStatus !== undefined) patch.paymentStatus = body.paymentStatus;
    if (body.fromAddress !== undefined) patch.fromAddress = body.fromAddress;
    if (body.toAddress !== undefined) patch.toAddress = body.toAddress;
    if (body.deliveryAddress !== undefined) patch.deliveryAddress = body.deliveryAddress;
    if (body.invoiceImageUrl !== undefined) patch.invoiceImageUrl = body.invoiceImageUrl;

    // Decrement stock when confirming
    if (body.status === "confirmed" && existingData.status !== "confirmed") {
      const itemsSnap = await orderRef.collection("items").get();
      const orderItems = itemsSnap.docs.map(d => d.data());
      const catSnap = await db.collection("wholesalers").doc(existingData.wholesalerId).collection("catalog").get();
      const byName = new Map<string, { ref: any; data: any }>();
      for (const d of catSnap.docs) byName.set(d.data().name.toLowerCase(), { ref: d.ref, data: d.data() });

      const stockBatch = db.batch();
      for (const it of orderItems) {
        const cat = byName.get(String(it.name).toLowerCase());
        if (!cat || cat.data.stockQuantity == null) continue;
        const need = neededInCatalogUnit(String(it.quantity), cat.data.unit);
        const next = Math.max(0, Number(cat.data.stockQuantity) - need);
        stockBatch.update(cat.ref, {
          stockQuantity: next,
          available: next > 0 ? cat.data.available : false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await stockBatch.commit();
    }

    await orderRef.update(patch);
    const updated = await orderRef.get();
    const updatedData = { id: updated.id, ...updated.data() } as any;
    const itemsSnap = await orderRef.collection("items").get();
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ order: enrichOrder(updatedData, items) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Patch order failed");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// POST /orders/:id/rating
router.post("/orders/:id/rating", async (req, res) => {
  try {
    const actor = await getActor(req);
    if (!actor) { res.status(403).json({ error: "Login required" }); return; }

    const rating = Number((req.body as { rating?: number }).rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: "rating must be an integer between 1 and 5" }); return;
    }

    const orderRef = db.collection("orders").doc(String(req.params.id));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) { res.status(404).json({ error: "Order not found" }); return; }
    const order = orderSnap.data() as any;

    if (order.status !== "delivered") {
      res.status(400).json({ error: "Rating allowed only after delivery is completed" }); return;
    }

    const actorPhone = normalizePhone(actor.phone);
    let isKirana = false, isWholesaler = false;
    if (actor.role === "kirana" && normalizePhone(order.kiranaPhone) === actorPhone) {
      isKirana = true;
    } else if (actor.role === "wholesaler") {
      const aliases = await getWholesalerAliases(actor);
      if (aliases.includes(order.wholesalerId)) isWholesaler = true;
    }
    if (!isKirana && !isWholesaler) {
      res.status(403).json({ error: "You can only rate orders you were part of" }); return;
    }
    if (isKirana && extractRatingFromNotes(order.notes)) {
      res.status(409).json({ error: "You've already rated this wholesaler for this order" }); return;
    }
    if (isWholesaler && extractKiranaRatingFromNotes(order.notes)) {
      res.status(409).json({ error: "You've already rated this kirana for this order" }); return;
    }

    const tag = isKirana ? `[rating:${rating}]` : `[kirana_rating:${rating}]`;
    const nextNotes = `${order.notes ? `${order.notes}\n` : ""}${tag}`;
    await orderRef.update({ notes: nextNotes, updatedAt: FieldValue.serverTimestamp() });

    if (isKirana) {
      const deliveredSnap = await db.collection("orders")
        .where("wholesalerId", "==", order.wholesalerId)
        .where("status", "==", "delivered")
        .get();
      const ratings = deliveredSnap.docs.map(d => extractRatingFromNotes(d.data().notes)).filter((r): r is number => typeof r === "number");
      if (ratings.length) {
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        await db.collection("wholesalers").doc(order.wholesalerId).update({
          rating: Number(avg.toFixed(2)), updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      const deliveredSnap = await db.collection("orders")
        .where("kiranaPhone", "==", order.kiranaPhone)
        .where("status", "==", "delivered")
        .get();
      const ratings = deliveredSnap.docs.map(d => extractKiranaRatingFromNotes(d.data().notes)).filter((r): r is number => typeof r === "number");
      if (ratings.length) {
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        await db.collection("users").doc(normalizePhone(order.kiranaPhone)).update({
          rating: Number(avg.toFixed(2)), ratingCount: ratings.length, updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Submit rating failed");
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

export default router;
