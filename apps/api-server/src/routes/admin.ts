import { Router, type NextFunction, type Request, type Response } from "express";
import { db, hasDb, wholesalersTable, catalogItemsTable, usersTable, ordersTable, orderItemsTable } from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { snapshotUsage, resetRateLimits } from "../lib/quotas";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "ADMIN_TOKEN not configured on server" });
    return;
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post("/admin/login", (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) { res.status(503).json({ error: "ADMIN_TOKEN not configured" }); return; }
  const { token } = req.body as { token: string };
  if (token === expected) { res.json({ ok: true }); return; }
  res.status(401).json({ ok: false });
});

/**
 * GET /api/usage — server-side quota dashboard. Auth-protected because
 * it leaks limit values. Use this from the admin panel (or
 * `curl -H "Authorization: Bearer $ADMIN_TOKEN" /api/usage`) to see
 * how close you are to Gemini's daily cap or Twilio's daily cap.
 * Resets at 00:00 UTC.
 */
router.get("/usage", requireAdmin, (_req, res) => {
  res.json(snapshotUsage());
});

/**
 * POST /api/admin/reset-rate-limits — escape hatch when a real user
 * (most commonly the founder testing the app) gets stuck behind the
 * per-phone OTP limiter or the per-IP AI limiter.
 *
 *   { "prefix": "otp:phone:8369490053" }   // clear one phone
 *   { "prefix": "otp:phone:" }              // clear all OTP buckets
 *   {}                                      // clear everything
 */
router.post("/admin/reset-rate-limits", requireAdmin, (req, res) => {
  const { prefix } = (req.body ?? {}) as { prefix?: string };
  const out = resetRateLimits(prefix);
  logger.warn({ prefix, ...out }, "Rate-limit state reset by admin");
  res.json(out);
});

/**
 * GET /api/admin/twilio-status/:sid — ask Twilio for the terminal
 * status of a message we sent. The SID is logged on every OTP send
 * (look for `OTP delivered via Twilio` in Render logs). Twilio's
 * API status field is the source of truth — "queued" or "sent" mean
 * the message is in flight; "delivered" means the recipient phone
 * acknowledged it; "undelivered" / "failed" mean it never arrived,
 * usually with an errorCode that tells you why.
 *
 * Common WhatsApp-Sandbox errorCodes you might see:
 *   63016  → recipient hasn't opted in to sandbox (or session expired)
 *   63003  → channel could not find a destination address
 *   21610  → recipient has explicitly unsubscribed
 *
 * Common SMS errorCodes:
 *   21608  → trial account, destination not in Verified Caller IDs
 *   30007  → carrier blocked (often DLT not registered for India)
 *   30008  → unknown / silent carrier filter
 */
router.get("/admin/twilio-status/:sid", requireAdmin, async (req, res) => {
  const sid = String(req.params.sid);
  if (!/^[A-Z]{2}[0-9a-f]{32}$/.test(sid)) {
    res.status(400).json({ error: "Invalid Twilio SID format (expected SM/MG/SMxxx... 34 chars)" });
    return;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    res.status(503).json({ error: "Twilio not configured on this server" });
    return;
  }
  try {
    // Use the REST API directly via fetch — saves us from instantiating
    // the heavy Twilio client just for a single GET. Basic auth.
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`;
    const r = await fetch(url, {
      headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") },
    });
    if (!r.ok) {
      const body = await r.text();
      res.status(r.status).json({ error: "Twilio responded with " + r.status, body: body.slice(0, 500) });
      return;
    }
    const j = (await r.json()) as any;
    res.json({
      sid: j.sid,
      status: j.status,                  // queued / sent / delivered / undelivered / failed
      errorCode: j.error_code,           // null if successful
      errorMessage: j.error_message,
      to: j.to,
      from: j.from,
      dateCreated: j.date_created,
      dateSent: j.date_sent,
      dateUpdated: j.date_updated,
      // Translate the most common error codes into plain English so
      // the operator doesn't have to grep Twilio docs.
      hint:
        j.error_code === 63016
          ? "Recipient hasn't joined the WhatsApp sandbox — or the 72-hour session expired. Have them send any WhatsApp message to your sandbox number to re-arm."
          : j.error_code === 63003
          ? "Channel could not find a destination address. Check the From number is a valid WhatsApp-enabled Twilio number."
          : j.error_code === 21608
          ? "Trial Twilio account — destination not in Verified Caller IDs. Add the number under Twilio Console → Phone Numbers → Verified Caller IDs, or upgrade past trial."
          : j.error_code === 30007
          ? "Carrier blocked the message. For India SMS this usually means DLT template not registered."
          : j.status === "delivered"
          ? "Message reached the phone. If user says they didn't see it, ask them to check spam / archived chats."
          : j.status === "queued" || j.status === "sent"
          ? "Still in flight — refresh in a few seconds."
          : null,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, sid }, "Twilio status lookup failed");
    res.status(500).json({ error: err?.message ?? "Lookup failed" });
  }
});

// --- Overview stats ---
router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const [u] = await db.execute(sql`SELECT count(*)::int AS c FROM users`).then(r => r.rows as any[]);
    const [w] = await db.execute(sql`SELECT count(*)::int AS c FROM wholesalers WHERE active = true`).then(r => r.rows as any[]);
    const [o] = await db.execute(sql`SELECT count(*)::int AS c FROM orders`).then(r => r.rows as any[]);
    const [p] = await db.execute(sql`SELECT count(*)::int AS c FROM orders WHERE status = 'pending'`).then(r => r.rows as any[]);
    // Wholesalers that submitted GSTIN or FSSAI but haven't been verified yet
    // = the admin's verification queue.
    const [pv] = await db.execute(sql`
      SELECT count(*)::int AS c FROM wholesalers
      WHERE active = true AND verified = false AND (
        (gstin IS NOT NULL AND length(gstin) > 0) OR
        (fssai IS NOT NULL AND length(fssai) > 0)
      )
    `).then(r => r.rows as any[]);
    res.json({ users: u.c, wholesalers: w.c, orders: o.c, pending: p.c, pendingVerification: pv.c });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin stats failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

/**
 * Wholesalers that have submitted GSTIN or FSSAI but haven't been
 * approved yet. Used by the admin Overview tab as a verification queue.
 */
router.get("/admin/pending-verifications", requireAdmin, async (_req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const rows = await db.execute(sql`
      SELECT id, name, owner_name as "ownerName", owner_phone as "ownerPhone",
             gstin, fssai, created_at as "createdAt", updated_at as "updatedAt"
      FROM wholesalers
      WHERE active = true AND verified = false AND (
        (gstin IS NOT NULL AND length(gstin) > 0) OR
        (fssai IS NOT NULL AND length(fssai) > 0)
      )
      ORDER BY updated_at DESC
    `).then(r => r.rows);
    res.json({ wholesalers: rows });
  } catch (err: any) {
    logger.error({ err: err?.message }, "pending verifications failed");
    res.status(500).json({ error: "Failed to load pending verifications" });
  }
});

// --- Wholesalers CRUD ---
router.get("/admin/wholesalers", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(wholesalersTable).orderBy(asc(wholesalersTable.name));
  // Per-wholesaler aggregates: order count, completed revenue.
  const agg = await db.execute(sql`
    SELECT wholesaler_id,
           count(*)::int AS order_count,
           coalesce(sum(case when status = 'delivered' then total_amount else 0 end), 0)::float AS revenue
    FROM orders
    GROUP BY wholesaler_id
  `).then(r => r.rows as any[]);
  const byId = new Map<string, { orderCount: number; revenue: number }>();
  for (const row of agg) {
    byId.set(row.wholesaler_id, { orderCount: row.order_count, revenue: Number(row.revenue) });
  }
  res.json({
    wholesalers: rows.map(w => ({
      ...w,
      orderCount: byId.get(w.id)?.orderCount ?? 0,
      revenue: byId.get(w.id)?.revenue ?? 0,
    })),
  });
});

router.post("/admin/wholesalers", requireAdmin, async (req, res) => {
  const body = req.body as Partial<typeof wholesalersTable.$inferInsert>;
  if (!body.id || !body.name || !body.ownerName || !body.ownerPhone || !body.location) {
    res.status(400).json({ error: "id, name, ownerName, ownerPhone, location required" });
    return;
  }
  const [row] = await db
    .insert(wholesalersTable)
    .values({
      id: body.id,
      name: body.name,
      ownerName: body.ownerName,
      ownerPhone: body.ownerPhone,
      location: body.location,
      distance: body.distance ?? "",
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      rating: body.rating ?? 4.5,
      specialOffer: body.specialOffer ?? null,
      active: body.active ?? true,
    })
    .returning();
  res.json({ wholesaler: row });
});

router.patch("/admin/wholesalers/:id", requireAdmin, async (req, res) => {
  const [row] = await db
    .update(wholesalersTable)
    .set({ ...(req.body as any), updatedAt: new Date() })
    .where(eq(wholesalersTable.id, String(req.params.id)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ wholesaler: row });
});

router.delete("/admin/wholesalers/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  try {
    // Cascade deletion across the rows that reference this wholesaler.
    // The orders FK is ON DELETE RESTRICT, so we must clear those first.
    // Wrap in a transaction so a partial failure doesn't leave dangling rows.
    await db.transaction(async (tx) => {
      // 1. Find every order against this wholesaler.
      const orderIds = (await tx
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.wholesalerId, id))
      ).map(r => r.id);
      // 2. Delete the line items for those orders, then the orders themselves.
      if (orderIds.length) {
        await tx.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
        await tx.delete(ordersTable).where(eq(ordersTable.wholesalerId, id));
      }
      // 3. Detach any users who were owners of this wholesaler.
      await tx.update(usersTable)
        .set({ wholesalerId: null, updatedAt: new Date() })
        .where(eq(usersTable.wholesalerId, id));
      // 4. catalog_items cascades automatically because the FK has onDelete:"cascade".
      // 5. Finally, drop the wholesaler row itself.
      const deleted = await tx.delete(wholesalersTable)
        .where(eq(wholesalersTable.id, id))
        .returning({ id: wholesalersTable.id });
      if (!deleted.length) throw new Error("Wholesaler not found");
    });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, id }, "admin delete wholesaler failed");
    res.status(500).json({ error: err?.message || "Failed to delete wholesaler" });
  }
});

// --- Catalog items for a wholesaler ---
router.get("/admin/wholesalers/:id/catalog", requireAdmin, async (req, res) => {
  const rows = await db
    .select()
    .from(catalogItemsTable)
    .where(eq(catalogItemsTable.wholesalerId, String(req.params.id)))
    .orderBy(asc(catalogItemsTable.name));
  res.json({ catalog: rows });
});

router.post("/admin/wholesalers/:id/catalog", requireAdmin, async (req, res) => {
  const body = req.body as Partial<typeof catalogItemsTable.$inferInsert>;
  if (!body.name || !body.unit || body.pricePerUnit === undefined) {
    res.status(400).json({ error: "name, unit, pricePerUnit required" });
    return;
  }
  const [row] = await db
    .insert(catalogItemsTable)
    .values({
      wholesalerId: String(req.params.id),
      name: body.name,
      nameTe: body.nameTe ?? "",
      nameHi: body.nameHi ?? "",
      unit: body.unit,
      pricePerUnit: body.pricePerUnit,
      available: body.available ?? true,
      minOrderQty: body.minOrderQty ?? 1,
      offer: body.offer ?? null,
    })
    .returning();
  res.json({ item: row });
});

router.patch("/admin/catalog/:itemId", requireAdmin, async (req, res) => {
  const itemId = parseInt(String(req.params.itemId), 10);
  if (Number.isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .update(catalogItemsTable)
    .set({ ...(req.body as any), updatedAt: new Date() })
    .where(eq(catalogItemsTable.id, itemId))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ item: row });
});

router.delete("/admin/catalog/:itemId", requireAdmin, async (req, res) => {
  const itemId = parseInt(String(req.params.itemId), 10);
  if (Number.isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(catalogItemsTable).where(eq(catalogItemsTable.id, itemId));
  res.json({ ok: true });
});

// --- Users ---
router.get("/admin/users", requireAdmin, async (_req, res) => {
  const rows = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json({ users: rows });
});

router.delete("/admin/users/:phone", requireAdmin, async (req, res) => {
  const phone = String(req.params.phone);
  try {
    await db.transaction(async (tx) => {
      // Clear orders placed by this kirana first (orders → users FK is RESTRICT).
      const orderIds = (await tx
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.kiranaPhone, phone))
      ).map(r => r.id);
      if (orderIds.length) {
        await tx.delete(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds));
        await tx.delete(ordersTable).where(eq(ordersTable.kiranaPhone, phone));
      }
      const deleted = await tx.delete(usersTable)
        .where(eq(usersTable.phone, phone))
        .returning({ phone: usersTable.phone });
      if (!deleted.length) throw new Error("User not found");
    });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, phone }, "admin delete user failed");
    res.status(500).json({ error: err?.message || "Failed to delete user" });
  }
});

router.patch("/admin/users/:phone", requireAdmin, async (req, res) => {
  const [row] = await db
    .update(usersTable)
    .set({ ...(req.body as any), updatedAt: new Date() })
    .where(eq(usersTable.phone, String(req.params.phone)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ user: row });
});

router.get("/admin/users/:phone/drilldown", requireAdmin, async (req, res) => {
  const phone = String(req.params.phone);
  const userRows = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!userRows.length) { res.status(404).json({ error: "User not found" }); return; }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.kiranaPhone, phone))
    .orderBy(desc(ordersTable.createdAt));

  const items = await db.select().from(orderItemsTable);
  const byOrder: Record<string, { name: string; quantity: string; available: boolean }[]> = {};
  for (const i of items) {
    (byOrder[i.orderId] ??= []).push({ name: i.name, quantity: i.quantity, available: i.available });
  }

  res.json({
    user: userRows[0],
    history: orders.map((o) => ({ ...o, items: byOrder[o.id] ?? [] })),
  });
});

// --- Orders monitor ---
router.get("/admin/orders", requireAdmin, async (_req, res) => {
  const status = _req.query.status as string | undefined;
  const wholesalerId = _req.query.wholesalerId as string | undefined;
  const kiranaPhone = _req.query.kiranaPhone as string | undefined;
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(
      status && ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"].includes(status)
        ? eq(ordersTable.status, status as any)
        : undefined,
      wholesalerId ? eq(ordersTable.wholesalerId, wholesalerId) : undefined,
      kiranaPhone ? eq(ordersTable.kiranaPhone, kiranaPhone) : undefined,
    ))
    .orderBy(desc(ordersTable.createdAt));
  const items = await db.select().from(orderItemsTable);
  const byOrder: Record<string, { name: string; quantity: string; available: boolean }[]> = {};
  for (const i of items) {
    (byOrder[i.orderId] ??= []).push({ name: i.name, quantity: i.quantity, available: i.available });
  }
  res.json({ orders: rows.map(r => ({ ...r, items: byOrder[r.id] ?? [] })) });
});

export default router;
