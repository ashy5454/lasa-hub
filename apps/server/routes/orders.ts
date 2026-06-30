import { Router } from "express";
import { db, hasDb, ordersTable, orderItemsTable, usersTable, wholesalersTable, catalogItemsTable } from "@workspace/db";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import twilio from "twilio";
import { logger } from "../lib/logger";
import { isItemInCatalog } from "../lib/catalogMatchServer";
import { normalizePhone } from "../lib/phone";
import { getActor } from "../lib/actor";

function parseQty(v: string): number {
  const m = String(v ?? "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

/**
 * Unit-aware decrement: convert an order quantity string ("500 gm", "2 L",
 * "3 packets") into the catalog item's native unit (kg/litre/piece/etc).
 * Mirrors the frontend logic in utils/units.ts so the stock decrement is
 * always done in the same unit the catalog tracks.
 */
function neededInCatalogUnit(orderQty: string, catalogUnit: string | null | undefined): number {
  const s = String(orderQty ?? "").toLowerCase().trim();
  const num = s.match(/(\d+(?:\.\d+)?)/);
  const value = num ? Number(num[1]) : 1;
  const rest = s.slice(num ? (num.index ?? 0) + num[0].length : 0).replace(/[^a-z]/g, "");
  const cat = String(catalogUnit ?? "").toLowerCase();
  // Weight: gm/g/gram → kg via /1000
  if ((rest.startsWith("gm") || rest === "g" || rest.startsWith("gram")) && (cat === "kg")) return value / 1000;
  if ((rest === "kg" || rest.startsWith("kilo")) && (cat === "gm" || cat === "g")) return value * 1000;
  // Volume: ml → litre via /1000
  if (rest === "ml" && (cat === "litre" || cat === "l")) return value / 1000;
  if ((rest === "l" || rest.startsWith("liter") || rest.startsWith("litre")) && (cat === "ml")) return value * 1000;
  // Default: no conversion
  return value;
}

const router = Router();

type Status = "pending" | "confirmed" | "out_for_delivery" | "delivered" | "cancelled";

async function getWholesalerAliases(actor: { phone: string; wholesalerId?: string }) {
  const normalizedPhone = normalizePhone(actor.phone);
  const rows = await db
    .select({ id: wholesalersTable.id })
    .from(wholesalersTable)
    .where(
      or(
        eq(wholesalersTable.ownerPhone, normalizedPhone),
        eq(wholesalersTable.ownerPhone, `+91${normalizedPhone}`),
      ),
    );
  const ids = new Set(rows.map(r => r.id));
  if (actor.wholesalerId) ids.add(actor.wholesalerId);
  return Array.from(ids);
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
  const value = Number(m[1]);
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function extractKiranaRatingFromNotes(notes?: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/\[kirana_rating:(\d)\]/i);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isInteger(v) || v < 1 || v > 5) return null;
  return v;
}

async function hydrate(orderIds: string[]) {
  type Hydrated = { name: string; nameTe: string; nameHi: string; sourceLanguage: string | null; quantity: string; available: boolean };
  if (!orderIds.length) return new Map<string, Hydrated[]>();
  const items = await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
  const byOrder = new Map<string, Hydrated[]>();
  for (const i of items as any[]) {
    const arr = byOrder.get(i.orderId) ?? [];
    arr.push({
      name: i.name,
      nameTe: i.nameTe ?? i.name_te ?? "",
      nameHi: i.nameHi ?? i.name_hi ?? "",
      sourceLanguage: i.sourceLanguage ?? i.source_language ?? null,
      quantity: i.quantity,
      available: !!i.available,
    });
    byOrder.set(i.orderId, arr);
  }
  return byOrder;
}

async function loadOrdersWithItems(rows: any[]) {
  const byOrder = await hydrate(rows.map(r => r.id));
  return rows.map((r: any) => ({
    ...r,
    subtotalAmount: r.subtotalAmount ?? null,
    tax: r.tax ?? null,
    invoiceNumber: r.invoiceNumber ?? null,
    invoiceImageUrl: r.invoiceImageUrl ?? null,
    paymentStatus: r.paymentStatus ?? null,
    fromAddress: r.fromAddress ?? null,
    toAddress: r.toAddress ?? null,
    deliveryAddress: r.deliveryAddress ?? null,
    items: byOrder.get(r.id) ?? [],
  }));
}

// Create order (kirana side).
router.post("/orders", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const body = req.body as {
      kiranaPhone: string; kiranaName: string; shopName: string;
      wholesalerId: string;
      items: { name: string; nameTe?: string; nameHi?: string; sourceLanguage?: string | null; quantity: string; available: boolean }[];
      notes?: string;
      deliveryAddress?: string;
    };
    const actor = getActor(req);
    if (
      !actor ||
      actor.role !== "kirana" ||
      normalizePhone(actor.phone) !== normalizePhone(body.kiranaPhone)
    ) {
      res.status(403).json({ error: "Only the logged-in kirana can place this order" });
      return;
    }
    if (!body.kiranaPhone || !body.wholesalerId || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: "kiranaPhone, wholesalerId, items required" });
      return;
    }
    // Ensure user row exists (FK) — upsert a minimal record.
    await db
      .insert(usersTable)
      .values({
        phone: body.kiranaPhone,
        role: "kirana",
        name: body.kiranaName,
        shopName: body.shopName,
        language: "te",
      })
      .onConflictDoNothing({ target: usersTable.phone });

    const id = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const [order] = await db
      .insert(ordersTable)
      .values({
        id,
        kiranaPhone: body.kiranaPhone,
        kiranaName: body.kiranaName,
        shopName: body.shopName,
        wholesalerId: body.wholesalerId,
        status: "pending",
        notes: body.notes ?? null,
        deliveryAddress: body.deliveryAddress ?? null,
        toAddress: body.deliveryAddress ?? null,
        paymentStatus: "pending",
      })
      .returning();
    if (body.items.length) {
      await db.insert(orderItemsTable).values(
        body.items.map(i => ({
          orderId: id,
          name: i.name,
          nameTe: i.nameTe ?? "",
          nameHi: i.nameHi ?? "",
          sourceLanguage: i.sourceLanguage ?? null,
          quantity: i.quantity,
          available: !!i.available,
        })),
      );
    }

    // Best-effort notify the wholesaler (non-blocking).
    (async () => {
      try {
        const [ws] = await db.select().from(wholesalersTable).where(eq(wholesalersTable.id, body.wholesalerId)).limit(1);
        if (!ws) return;
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM_NUMBER;
        if (!sid || !token || !from) return;
        const channel = (process.env.TWILIO_CHANNEL ?? "sms").toLowerCase();
        const client = twilio(sid, token);
        const to = ws.ownerPhone.startsWith("+") ? ws.ownerPhone : `+91${ws.ownerPhone}`;
        await client.messages.create({
          body: `Lasa Hub: new order from ${body.shopName} (${body.items.length} items). Open the app to review.`,
          to: channel === "whatsapp" ? `whatsapp:${to}` : to,
          from: channel === "whatsapp" ? `whatsapp:${from}` : from,
        });
      } catch (err: any) {
        logger.warn({ err: err?.message }, "Wholesaler notify failed (non-fatal)");
      }
    })();

    res.json({ order: { ...order, items: body.items } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Create order failed");
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/orders/by-kirana/:phone", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (
      !actor ||
      actor.role !== "kirana" ||
      normalizePhone(actor.phone) !== normalizePhone(String(req.params.phone))
    ) {
      res.status(403).json({ error: "Unauthorized for this kirana orders list" });
      return;
    }
    const rows = await db
      .select({
        id: ordersTable.id,
        kiranaPhone: ordersTable.kiranaPhone,
        kiranaName: ordersTable.kiranaName,
        shopName: ordersTable.shopName,
        wholesalerId: ordersTable.wholesalerId,
        status: ordersTable.status,
        totalAmount: ordersTable.totalAmount,
        discount: ordersTable.discount,
        deliveryTime: ordersTable.deliveryTime,
        invoiceNote: ordersTable.invoiceNote,
        notes: ordersTable.notes,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
      })
      .from(ordersTable)
      .where(eq(ordersTable.kiranaPhone, String(req.params.phone)))
      .orderBy(desc(ordersTable.createdAt));
    res.json({ orders: await loadOrdersWithItems(rows) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List by kirana failed");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

router.get("/orders/by-wholesaler/:id", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
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
    const filters = [inArray(ordersTable.wholesalerId, aliases)];
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!Number.isNaN(d.getTime())) filters.push(gt(ordersTable.updatedAt, d));
    }
    const rows = await db
      .select({
        id: ordersTable.id,
        kiranaPhone: ordersTable.kiranaPhone,
        kiranaName: ordersTable.kiranaName,
        shopName: ordersTable.shopName,
        wholesalerId: ordersTable.wholesalerId,
        status: ordersTable.status,
        totalAmount: ordersTable.totalAmount,
        discount: ordersTable.discount,
        deliveryTime: ordersTable.deliveryTime,
        invoiceNote: ordersTable.invoiceNote,
        notes: ordersTable.notes,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
      })
      .from(ordersTable)
      .where(and(...filters))
      .orderBy(desc(ordersTable.createdAt));
    res.json({ orders: await loadOrdersWithItems(rows) });
  } catch (err: any) {
    logger.error({ err: err?.message }, "List by wholesaler failed");
    res.status(500).json({ error: "Failed to list orders" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, String(req.params.id))).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const actor = getActor(req);
    if (!actor) { res.status(401).json({ error: "Missing user context" }); return; }
    const order = rows[0];
    if (actor.role === "kirana" && order.kiranaPhone !== actor.phone) {
      res.status(403).json({ error: "Unauthorized for this order" });
      return;
    }
    if (actor.role === "wholesaler" && order.wholesalerId !== actor.wholesalerId) {
      const aliases = await getWholesalerAliases(actor);
      if (!aliases.includes(order.wholesalerId)) {
        res.status(403).json({ error: "Unauthorized for this order" });
        return;
      }
    }
    const [withItems] = await loadOrdersWithItems(rows);
    res.json({ order: withItems });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get order failed");
    res.status(500).json({ error: "Failed to load order" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const body = req.body as {
      status?: Status;
      totalAmount?: number;
      subtotalAmount?: number;
      tax?: number;
      discount?: number;
      deliveryTime?: string;
      invoiceNote?: string;
      invoiceNumber?: string;
      paymentStatus?: string;
      fromAddress?: string;
      toAddress?: string;
      deliveryAddress?: string;
      invoiceImageUrl?: string;
    };
    const actor = getActor(req);
    if (!actor || actor.role !== "wholesaler") {
      res.status(403).json({ error: "Only wholesalers can update orders" });
      return;
    }
    const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, String(req.params.id))).limit(1);
    if (!existing.length) { res.status(404).json({ error: "Not found" }); return; }
    const aliases = await getWholesalerAliases(actor);
    if (!aliases.includes(existing[0].wholesalerId)) {
      res.status(403).json({ error: "Unauthorized for this order" });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) {
      const allowed: Status[] = ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"];
      if (!allowed.includes(body.status)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
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

    // If transitioning to confirmed, decrement stock for matched catalog items.
    // Done in the same transaction-like sequence as the order update so partial
    // failures still surface to the wholesaler.
    if (body.status === "confirmed" && existing[0].status !== "confirmed") {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, String(req.params.id)));
      const catalog = await db
        .select()
        .from(catalogItemsTable)
        .where(eq(catalogItemsTable.wholesalerId, existing[0].wholesalerId));
      const byName = new Map<string, typeof catalog[number]>();
      for (const c of catalog) byName.set(c.name.toLowerCase(), c);
      for (const it of items) {
        const cat = byName.get(it.name.toLowerCase());
        if (!cat || cat.stockQuantity == null) continue;
        // Convert "500 gm" to 0.5 kg before subtracting from a kg-tracked
        // stock pile, so we don't over-decrement.
        const need = neededInCatalogUnit(it.quantity, cat.unit);
        const next = Math.max(0, Number(cat.stockQuantity) - need);
        await db
          .update(catalogItemsTable)
          .set({
            stockQuantity: next,
            available: next > 0 ? cat.available : false,
            updatedAt: new Date(),
          })
          .where(eq(catalogItemsTable.id, cat.id));
      }
    }

    const [row] = await db
      .update(ordersTable)
      .set(patch as any)
      .where(eq(ordersTable.id, String(req.params.id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    // Notify kirana about status changes (non-blocking).
    if (body.status) {
      (async () => {
        try {
          const sid = process.env.TWILIO_ACCOUNT_SID;
          const token = process.env.TWILIO_AUTH_TOKEN;
          const from = process.env.TWILIO_FROM_NUMBER;
          if (!sid || !token || !from) return;
          const channel = (process.env.TWILIO_CHANNEL ?? "sms").toLowerCase();
          const client = twilio(sid, token);
          const to = row.kiranaPhone.startsWith("+") ? row.kiranaPhone : `+91${row.kiranaPhone}`;
          // Pull the items for this order, then split into:
          //   - fulfilled   : item is in catalog AND stock ≥ ordered qty
          //   - partial     : item is in catalog BUT stock < ordered qty
          //   - skipped     : item is not in the catalog at all (or unavailable)
          // The SMS shows each row with the actual deliverable amount so the
          // kirana never expects more than what's coming.
          const orderItems = await db
            .select()
            .from(orderItemsTable)
            .where(eq(orderItemsTable.orderId, row.id));
          const catalog = await db
            .select()
            .from(catalogItemsTable)
            .where(eq(catalogItemsTable.wholesalerId, row.wholesalerId));

          // Convert kirana's quantity into the catalog's unit so we can
          // compare apples-to-apples (500 gm vs 20 kg, 2 L vs 5 ml…).
          const fulfilled: string[] = [];
          const partial: string[] = [];
          const skipped: string[] = [];
          for (const it of orderItems as any[]) {
            const cat = isItemInCatalog(catalog, it.name, it.nameTe, it.nameHi) as any;
            if (!cat || !cat.available) {
              skipped.push(`  • ${it.name}`);
              continue;
            }
            const needInCatalogUnit = neededInCatalogUnit(it.quantity, cat.unit);
            const onHand = Number(cat.stockQuantity ?? Infinity);
            if (needInCatalogUnit <= onHand) {
              fulfilled.push(`  • ${it.name}  —  ${it.quantity}`);
            } else {
              // Wholesaler will deliver whatever they have. Show both.
              const deliverable = Number.isFinite(onHand) ? `${onHand} ${cat.unit}` : `${it.quantity}`;
              partial.push(`  • ${it.name}  —  ${deliverable}  (you asked for ${it.quantity}, shop only has ${deliverable})`);
            }
          }
          const itemList = [...fulfilled, ...partial].join("\n") || "  (no items)";
          const skippedNote = skipped.length
            ? `\n\nNot delivered (shop doesn't sell these):\n${skipped.join("\n")}`
            : "";
          const partialNote = partial.length
            ? `\n\nNote: some items were delivered in smaller quantity than asked because shop ran short.`
            : "";
          const msg = body.status === "confirmed"
            ? `*Lasa Hub: order confirmed*\nDelivery: ${body.deliveryTime ?? "TBD"}\nInvoice: ${body.invoiceNumber ?? row.id}\nTotal: ₹${body.totalAmount ?? row.totalAmount ?? "-"}\n\nItems being delivered:\n${itemList}${partialNote}${skippedNote}`
            : body.status === "out_for_delivery"
            ? `*Lasa Hub: order out for delivery*\n\nItems on the way:\n${itemList}${partialNote}${skippedNote}`
            : body.status === "delivered"
            ? `*Lasa Hub: order delivered*\nPlease check each item before signing off.\n\nDelivered items:\n${itemList}${partialNote}${skippedNote}\n\nIf anything is missing or wrong, message your wholesaler now.`
            : body.status === "cancelled"
            ? `*Lasa Hub: order cancelled*\n\nOrder contents (for your records):\n${itemList}`
            : null;
          if (!msg) return;
          await client.messages.create({
            body: msg,
            to: channel === "whatsapp" ? `whatsapp:${to}` : to,
            from: channel === "whatsapp" ? `whatsapp:${from}` : from,
          });
          if (body.status === "confirmed") {
            const bill = [
              `*Lasa Hub Invoice*`,
              ``,
              `*Order:* ${row.id}`,
              `*Invoice:* ${body.invoiceNumber ?? row.id}`,
              `*Shop:* ${row.shopName}`,
              `*Subtotal:* ₹${body.subtotalAmount ?? row.subtotalAmount ?? "-"}`,
              `*Tax:* ₹${body.tax ?? row.tax ?? 0}`,
              `*Discount:* ₹${body.discount ?? row.discount ?? 0}`,
              `*Total:* ₹${body.totalAmount ?? row.totalAmount ?? "-"}`,
              `*Delivery:* ${body.deliveryTime ?? row.deliveryTime ?? "TBD"}`,
              `*Address:* ${body.toAddress ?? row.toAddress ?? row.deliveryAddress ?? "-"}`,
              `*Payment:* ${body.paymentStatus ?? row.paymentStatus ?? "pending"}`,
              `*Notes:* ${body.invoiceNote ?? row.invoiceNote ?? "-"}`,
              ``,
              `_For support, contact your wholesaler on Lasa Hub._`,
            ].join("\n");
            await client.messages.create({
              body: bill,
              to: channel === "whatsapp" ? `whatsapp:${to}` : to,
              from: channel === "whatsapp" ? `whatsapp:${from}` : from,
            });
          }
        } catch (err: any) {
          logger.warn({ err: err?.message }, "Kirana notify failed (non-fatal)");
        }
      })();
    }

    const [withItems] = await loadOrdersWithItems([row]);
    res.json({ order: withItems });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Patch order failed");
    res.status(500).json({ error: "Failed to update order" });
  }
});

// Either side can rate after a delivered order.
//   - Kirana → rates the wholesaler (stored in wholesalers.rating)
//   - Wholesaler → rates the kirana (stored in users.rating)
// Each side may rate ONCE per order. Tags in order.notes track who rated.
router.post("/orders/:id/rating", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const actor = getActor(req);
    if (!actor) {
      res.status(403).json({ error: "Login required" });
      return;
    }

    const rating = Number((req.body as { rating?: number }).rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: "rating must be an integer between 1 and 5" });
      return;
    }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, String(req.params.id))).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.status !== "delivered") {
      res.status(400).json({ error: "Rating allowed only after delivery is completed" });
      return;
    }

    const actorPhone = normalizePhone(actor.phone);
    let isKirana = false, isWholesaler = false;
    if (actor.role === "kirana" && normalizePhone(order.kiranaPhone) === actorPhone) {
      isKirana = true;
    } else if (actor.role === "wholesaler") {
      // Verify the wholesaler is the recipient of this order.
      const aliases = await getWholesalerAliases(actor);
      if (aliases.includes(order.wholesalerId)) isWholesaler = true;
    }
    if (!isKirana && !isWholesaler) {
      res.status(403).json({ error: "You can only rate orders you were part of" });
      return;
    }

    // Block double-rating from the same side.
    if (isKirana && extractRatingFromNotes(order.notes)) {
      res.status(409).json({ error: "You've already rated this wholesaler for this order" });
      return;
    }
    if (isWholesaler && extractKiranaRatingFromNotes(order.notes)) {
      res.status(409).json({ error: "You've already rated this kirana for this order" });
      return;
    }

    const tag = isKirana ? `[rating:${rating}]` : `[kirana_rating:${rating}]`;
    const nextNotes = `${order.notes ? `${order.notes}\n` : ""}${tag}`;
    await db.update(ordersTable).set({ notes: nextNotes, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));

    if (isKirana) {
      // Recompute wholesaler's rolling avg across all their delivered+rated orders.
      const deliveredRows = await db
        .select({ notes: ordersTable.notes })
        .from(ordersTable)
        .where(and(eq(ordersTable.wholesalerId, order.wholesalerId), eq(ordersTable.status, "delivered")));
      const ratings = deliveredRows
        .map(r => extractRatingFromNotes(r.notes))
        .filter((r): r is number => typeof r === "number");
      if (ratings.length) {
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        await db
          .update(wholesalersTable)
          .set({ rating: Number(avg.toFixed(2)), updatedAt: new Date() })
          .where(eq(wholesalersTable.id, order.wholesalerId));
      }
    } else {
      // Recompute kirana's avg.
      const deliveredRows = await db
        .select({ notes: ordersTable.notes })
        .from(ordersTable)
        .where(and(eq(ordersTable.kiranaPhone, order.kiranaPhone), eq(ordersTable.status, "delivered")));
      const ratings = deliveredRows
        .map(r => extractKiranaRatingFromNotes(r.notes))
        .filter((r): r is number => typeof r === "number");
      if (ratings.length) {
        const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
        await db
          .update(usersTable)
          .set({ rating: Number(avg.toFixed(2)), ratingCount: ratings.length, updatedAt: new Date() })
          .where(eq(usersTable.phone, order.kiranaPhone));
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Submit rating failed");
    res.status(500).json({ error: "Failed to submit rating" });
  }
});

export default router;
