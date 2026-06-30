import { Router, type NextFunction, type Request, type Response } from "express";
import { db } from "../lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../lib/logger";
import { snapshotUsage, resetRateLimits } from "../lib/quotas";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) { res.status(503).json({ error: "ADMIN_TOKEN not configured on server" }); return; }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
  if (token !== expected) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

router.post("/admin/login", (req, res) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) { res.status(503).json({ error: "ADMIN_TOKEN not configured" }); return; }
  const { token } = req.body as { token: string };
  if (token === expected) { res.json({ ok: true }); return; }
  res.status(401).json({ ok: false });
});

router.get("/usage", requireAdmin, (_req, res) => {
  res.json(snapshotUsage());
});

router.post("/admin/reset-rate-limits", requireAdmin, (req, res) => {
  const { prefix } = (req.body ?? {}) as { prefix?: string };
  const out = resetRateLimits(prefix);
  logger.warn({ prefix, ...out }, "Rate-limit state reset by admin");
  res.json(out);
});

// GET /api/admin/stats
router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const [usersCount, wholesalersCount, ordersSnap] = await Promise.all([
      db.collection("users").count().get(),
      db.collection("wholesalers").where("active", "==", true).count().get(),
      db.collection("orders").get(),
    ]);

    const totalOrders = ordersSnap.size;
    const pendingOrders = ordersSnap.docs.filter(d => d.data().status === "pending").length;

    // Wholesalers with gstin or fssai awaiting verification
    const [gstin, fssai] = await Promise.all([
      db.collection("wholesalers").where("active", "==", true).where("verified", "==", false).where("gstin", "!=", "").get(),
      db.collection("wholesalers").where("active", "==", true).where("verified", "==", false).where("fssai", "!=", "").get(),
    ]);
    const pendingVerificationIds = new Set([...gstin.docs.map(d => d.id), ...fssai.docs.map(d => d.id)]);

    res.json({
      users: usersCount.data().count,
      wholesalers: wholesalersCount.data().count,
      orders: totalOrders,
      pending: pendingOrders,
      pendingVerification: pendingVerificationIds.size,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin stats failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// GET /api/admin/pending-verifications
router.get("/admin/pending-verifications", requireAdmin, async (_req, res) => {
  try {
    const [gstin, fssai] = await Promise.all([
      db.collection("wholesalers").where("active", "==", true).where("verified", "==", false).where("gstin", "!=", "").get(),
      db.collection("wholesalers").where("active", "==", true).where("verified", "==", false).where("fssai", "!=", "").get(),
    ]);
    const seen = new Set<string>();
    const wholesalers: any[] = [];
    for (const d of [...gstin.docs, ...fssai.docs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      wholesalers.push({ id: d.id, ...d.data() });
    }
    wholesalers.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
    res.json({ wholesalers });
  } catch (err: any) {
    logger.error({ err: err?.message }, "pending verifications failed");
    res.status(500).json({ error: "Failed to load pending verifications" });
  }
});

// GET /api/admin/wholesalers
router.get("/admin/wholesalers", requireAdmin, async (_req, res) => {
  try {
    const wsSnap = await db.collection("wholesalers").orderBy("name").get();
    const ordersSnap = await db.collection("orders").get();

    const orderCount = new Map<string, number>();
    const revenue = new Map<string, number>();
    for (const d of ordersSnap.docs) {
      const o = d.data();
      orderCount.set(o.wholesalerId, (orderCount.get(o.wholesalerId) ?? 0) + 1);
      if (o.status === "delivered") {
        revenue.set(o.wholesalerId, (revenue.get(o.wholesalerId) ?? 0) + (Number(o.totalAmount) || 0));
      }
    }

    res.json({
      wholesalers: wsSnap.docs.map(d => ({
        id: d.id, ...d.data(),
        orderCount: orderCount.get(d.id) ?? 0,
        revenue: revenue.get(d.id) ?? 0,
      })),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin wholesalers failed");
    res.status(500).json({ error: "Failed to load wholesalers" });
  }
});

// POST /api/admin/wholesalers
router.post("/admin/wholesalers", requireAdmin, async (req, res) => {
  try {
    const body = req.body as any;
    if (!body.id || !body.name || !body.ownerName || !body.ownerPhone || !body.location) {
      res.status(400).json({ error: "id, name, ownerName, ownerPhone, location required" });
      return;
    }
    const data = {
      id: body.id, name: body.name, ownerName: body.ownerName,
      ownerPhone: body.ownerPhone, location: body.location,
      lat: body.lat ?? null, lng: body.lng ?? null,
      rating: body.rating ?? 4.5, specialOffer: body.specialOffer ?? null,
      active: body.active ?? true, verified: body.verified ?? false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection("wholesalers").doc(body.id).set(data);
    res.json({ wholesaler: data });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin create wholesaler failed");
    res.status(500).json({ error: "Failed to create wholesaler" });
  }
});

// PATCH /api/admin/wholesalers/:id
router.patch("/admin/wholesalers/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const ref = db.collection("wholesalers").doc(id);
    await ref.update({ ...(req.body as any), updatedAt: FieldValue.serverTimestamp() });
    const snap = await ref.get();
    if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ wholesaler: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin patch wholesaler failed");
    res.status(500).json({ error: "Failed to update wholesaler" });
  }
});

// DELETE /api/admin/wholesalers/:id — cascades orders, items, detaches users
router.delete("/admin/wholesalers/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  try {
    // 1. Find orders for this wholesaler
    const ordersSnap = await db.collection("orders").where("wholesalerId", "==", id).get();

    // 2. Delete order items subcollections + orders
    const batch = db.batch();
    for (const orderDoc of ordersSnap.docs) {
      const itemsSnap = await orderDoc.ref.collection("items").get();
      for (const item of itemsSnap.docs) batch.delete(item.ref);
      batch.delete(orderDoc.ref);
    }

    // 3. Delete catalog items subcollection
    const catalogSnap = await db.collection("wholesalers").doc(id).collection("catalog").get();
    for (const item of catalogSnap.docs) batch.delete(item.ref);

    // 4. Detach users
    const usersSnap = await db.collection("users").where("wholesalerId", "==", id).get();
    for (const u of usersSnap.docs) {
      batch.update(u.ref, { wholesalerId: null, updatedAt: FieldValue.serverTimestamp() });
    }

    // 5. Delete wholesaler doc
    batch.delete(db.collection("wholesalers").doc(id));

    await batch.commit();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, id }, "admin delete wholesaler failed");
    res.status(500).json({ error: err?.message || "Failed to delete wholesaler" });
  }
});

// GET /api/admin/wholesalers/:id/catalog
router.get("/admin/wholesalers/:id/catalog", requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection("wholesalers").doc(String(req.params.id)).collection("catalog").orderBy("name").get();
    res.json({ catalog: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load catalog" });
  }
});

// POST /api/admin/wholesalers/:id/catalog
router.post("/admin/wholesalers/:id/catalog", requireAdmin, async (req, res) => {
  try {
    const body = req.body as any;
    if (!body.name || !body.unit || body.pricePerUnit === undefined) {
      res.status(400).json({ error: "name, unit, pricePerUnit required" });
      return;
    }
    const data = {
      wholesalerId: String(req.params.id), name: body.name,
      nameTe: body.nameTe ?? "", nameHi: body.nameHi ?? "",
      unit: body.unit, pricePerUnit: body.pricePerUnit,
      available: body.available ?? true, minOrderQty: body.minOrderQty ?? 1,
      offer: body.offer ?? null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection("wholesalers").doc(String(req.params.id)).collection("catalog").add(data);
    res.json({ item: { id: ref.id, ...data } });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create catalog item" });
  }
});

// PATCH /api/admin/catalog/:itemId — requires wholesalerId in body or query to locate subcollection
router.patch("/admin/catalog/:itemId", requireAdmin, async (req, res) => {
  try {
    const body = req.body as any;
    const wholesalerId = body.wholesalerId ?? req.query.wholesalerId as string;
    if (!wholesalerId) { res.status(400).json({ error: "wholesalerId required" }); return; }
    const ref = db.collection("wholesalers").doc(wholesalerId).collection("catalog").doc(String(req.params.itemId));
    const { wholesalerId: _w, ...rest } = body;
    await ref.update({ ...rest, updatedAt: FieldValue.serverTimestamp() });
    const snap = await ref.get();
    res.json({ item: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update catalog item" });
  }
});

// DELETE /api/admin/catalog/:itemId
router.delete("/admin/catalog/:itemId", requireAdmin, async (req, res) => {
  try {
    const wholesalerId = req.query.wholesalerId as string;
    if (!wholesalerId) { res.status(400).json({ error: "wholesalerId query param required" }); return; }
    await db.collection("wholesalers").doc(wholesalerId).collection("catalog").doc(String(req.params.itemId)).delete();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete catalog item" });
  }
});

// GET /api/admin/users
router.get("/admin/users", requireAdmin, async (_req, res) => {
  try {
    const snap = await db.collection("users").orderBy("createdAt", "desc").get();
    res.json({ users: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// DELETE /api/admin/users/:phone
router.delete("/admin/users/:phone", requireAdmin, async (req, res) => {
  const phone = String(req.params.phone);
  try {
    const ordersSnap = await db.collection("orders").where("kiranaPhone", "==", phone).get();
    const batch = db.batch();
    for (const orderDoc of ordersSnap.docs) {
      const itemsSnap = await orderDoc.ref.collection("items").get();
      for (const item of itemsSnap.docs) batch.delete(item.ref);
      batch.delete(orderDoc.ref);
    }
    batch.delete(db.collection("users").doc(phone));
    await batch.commit();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message, phone }, "admin delete user failed");
    res.status(500).json({ error: err?.message || "Failed to delete user" });
  }
});

// PATCH /api/admin/users/:phone
router.patch("/admin/users/:phone", requireAdmin, async (req, res) => {
  try {
    const ref = db.collection("users").doc(String(req.params.phone));
    await ref.update({ ...(req.body as any), updatedAt: FieldValue.serverTimestamp() });
    const snap = await ref.get();
    res.json({ user: { id: snap.id, ...snap.data() } });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// GET /api/admin/users/:phone/drilldown
router.get("/admin/users/:phone/drilldown", requireAdmin, async (req, res) => {
  try {
    const phone = String(req.params.phone);
    const userSnap = await db.collection("users").doc(phone).get();
    if (!userSnap.exists) { res.status(404).json({ error: "User not found" }); return; }

    const ordersSnap = await db.collection("orders")
      .where("kiranaPhone", "==", phone)
      .orderBy("createdAt", "desc")
      .get();

    const history = await Promise.all(ordersSnap.docs.map(async d => {
      const itemsSnap = await d.ref.collection("items").get();
      const items = itemsSnap.docs.map(i => {
        const data = i.data();
        return { name: data.name, quantity: data.quantity, available: data.available };
      });
      return { id: d.id, ...d.data(), items };
    }));

    res.json({ user: { id: userSnap.id, ...userSnap.data() }, history });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load user drilldown" });
  }
});

// GET /api/admin/orders
router.get("/admin/orders", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const wholesalerId = req.query.wholesalerId as string | undefined;
    const kiranaPhone = req.query.kiranaPhone as string | undefined;

    let query = db.collection("orders") as FirebaseFirestore.Query;
    const validStatuses = ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"];
    if (status && validStatuses.includes(status)) query = query.where("status", "==", status);
    if (wholesalerId) query = query.where("wholesalerId", "==", wholesalerId);
    if (kiranaPhone) query = query.where("kiranaPhone", "==", kiranaPhone);

    const snap = await query.orderBy("createdAt", "desc").get();
    const orders = await Promise.all(snap.docs.map(async d => {
      const itemsSnap = await d.ref.collection("items").get();
      const items = itemsSnap.docs.map(i => {
        const data = i.data();
        return { name: data.name, quantity: data.quantity, available: data.available };
      });
      return { id: d.id, ...d.data(), items };
    }));

    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load orders" });
  }
});

export default router;
