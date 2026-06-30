import { Router } from "express";
import { db } from "../lib/firebase";
import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/phone";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// POST /users/upsert — called after Firebase Phone Auth succeeds on the client.
// Creates or updates the user profile in Firestore. Also auto-creates or claims
// the wholesaler document when role=wholesaler.
router.post("/users/upsert", async (req, res) => {
  try {
    const body = req.body as {
      phone: string;
      role: "kirana" | "wholesaler";
      name: string;
      shopName?: string;
      language?: "en" | "hi" | "te";
      trustedWholesalerId?: string;
      wholesalerId?: string;
      lat?: number;
      lng?: number;
      gstin?: string;
      fssai?: string;
    };

    const phone = normalizePhone(body.phone);
    if (!phone || !body.role || !body.name) {
      res.status(400).json({ error: "phone, role, name required" });
      return;
    }

    const shopName =
      body.shopName?.trim() ||
      `${body.name}'s ${body.role === "wholesaler" ? "Wholesale" : "Kirana"}`;

    const userRef = db.collection("users").doc(phone);
    const userSnap = await userRef.get();

    if (userSnap.exists && userSnap.data()?.role !== body.role) {
      res.status(409).json({ error: `Phone already registered as ${userSnap.data()?.role}` });
      return;
    }

    let wholesalerId = body.wholesalerId ?? null;

    if (body.role === "wholesaler" && !wholesalerId) {
      // Try to claim existing wholesaler by phone
      const wsSnap = await db
        .collection("wholesalers")
        .where("ownerPhone", "in", [phone, `+91${phone}`])
        .limit(1)
        .get();

      if (!wsSnap.empty) {
        const ws = wsSnap.docs[0];
        wholesalerId = ws.id;
        await ws.ref.update({
          ownerName: body.name,
          ownerPhone: phone,
          name: shopName,
          lat: body.lat ?? ws.data().lat ?? null,
          lng: body.lng ?? ws.data().lng ?? null,
          location:
            body.lat && body.lng
              ? `${body.lat.toFixed(4)}, ${body.lng.toFixed(4)}`
              : ws.data().location,
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        // Auto-create wholesaler
        wholesalerId = `w_${phone}`;
        await db
          .collection("wholesalers")
          .doc(wholesalerId)
          .set({
            id: wholesalerId,
            name: shopName,
            ownerName: body.name,
            ownerPhone: phone,
            location:
              body.lat && body.lng
                ? `${body.lat.toFixed(4)}, ${body.lng.toFixed(4)}`
                : "Unknown",
            lat: body.lat ?? null,
            lng: body.lng ?? null,
            active: true,
            rating: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
      }
    }

    const userData = {
      phone,
      role: body.role,
      name: body.name,
      shopName,
      language: body.language ?? "te",
      trustedWholesalerId: body.trustedWholesalerId ?? null,
      wholesalerId,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      gstin: body.gstin?.trim() || null,
      fssai: body.fssai?.trim() || null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!userSnap.exists) {
      await userRef.set({ ...userData, createdAt: FieldValue.serverTimestamp() });
    } else {
      await userRef.update(userData);
    }

    const saved = await userRef.get();
    res.json({ user: { id: saved.id, ...saved.data() } });
  } catch (err: any) {
    logger.error({ err: err?.message }, "User upsert error");
    res.status(500).json({ error: "Failed to save user" });
  }
});

// GET /users/:phone — fetch user profile
router.get("/users/:phone", async (req, res) => {
  try {
    const phone = normalizePhone(String(req.params.phone));
    const snap = await db.collection("users").doc(phone).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let user = { id: snap.id, ...snap.data() } as any;

    // Self-heal stale wholesalerId for wholesaler users
    if (user.role === "wholesaler") {
      const wsSnap = await db
        .collection("wholesalers")
        .where("ownerPhone", "in", [phone, `+91${phone}`])
        .where("active", "==", true)
        .limit(1)
        .get();

      const actualId = wsSnap.empty ? null : wsSnap.docs[0].id;
      if (actualId && user.wholesalerId !== actualId) {
        logger.info({ phone, was: user.wholesalerId, now: actualId }, "Self-healed stale wholesalerId");
        await db.collection("users").doc(phone).update({
          wholesalerId: actualId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        user.wholesalerId = actualId;
      }
    }

    res.json({ user });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get user error");
    res.status(500).json({ error: "Failed to load user" });
  }
});

export default router;
