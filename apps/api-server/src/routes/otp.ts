import { Router } from "express";
import twilio from "twilio";
import { randomInt } from "crypto";
import { db, hasDb, otpTable, usersTable, wholesalersTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { checkOtpRate, tryReserveTwilioSend } from "../lib/quotas";
import { normalizePhone } from "../lib/phone";

const router = Router();

// In-memory fallback when DB is not configured (dev only).
const memOtp = new Map<string, { code: string; expiresAt: number }>();

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  return randomInt(1000, 10000).toString();
}

async function storeOtp(phone: string, code: string) {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  if (hasDb) {
    await db
      .insert(otpTable)
      .values({ phone, code, expiresAt })
      .onConflictDoUpdate({
        target: otpTable.phone,
        set: { code, expiresAt, createdAt: new Date() },
      });
  } else {
    memOtp.set(phone, { code, expiresAt: expiresAt.getTime() });
  }
}

async function consumeOtp(phone: string, code: string): Promise<"ok" | "wrong" | "expired" | "missing"> {
  if (hasDb) {
    const row = await db.select().from(otpTable).where(eq(otpTable.phone, phone)).limit(1);
    const stored = row[0];
    if (!stored) return "missing";
    if (stored.expiresAt.getTime() < Date.now()) {
      await db.delete(otpTable).where(eq(otpTable.phone, phone));
      return "expired";
    }
    if (stored.code !== code) return "wrong";
    await db.delete(otpTable).where(eq(otpTable.phone, phone));
    return "ok";
  }
  const stored = memOtp.get(phone);
  if (!stored) return "missing";
  if (stored.expiresAt < Date.now()) { memOtp.delete(phone); return "expired"; }
  if (stored.code !== code) return "wrong";
  memOtp.delete(phone);
  return "ok";
}

async function sendViaTwilio(phone: string, code: string): Promise<"sent" | "skipped" | "failed" | "quota"> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const channel = (process.env.TWILIO_CHANNEL ?? "sms").toLowerCase();
  if (!sid || !token || !from) return "skipped";

  // Hard daily cap so a buggy frontend or attacker can't drain Twilio
  // credit. When this trips the caller falls through to the
  // SHOW_OTP_IN_RESPONSE path so legitimate users in dev still
  // receive the code — production should set SHOW_OTP_IN_RESPONSE=false.
  const reservation = tryReserveTwilioSend();
  if (!reservation.allowed) {
    logger.warn({ phone, channel, count: reservation.count }, "Twilio daily cap — OTP not sent");
    return "quota";
  }

  try {
    const client = twilio(sid, token);
    const toNumber = phone.startsWith("+") ? phone : `+91${phone}`;
    // Capture the Twilio Message SID — this is the only handle that
    // lets us trace what ACTUALLY happened to the message after Twilio
    // accepted it. WhatsApp Sandbox returns "sent" via the API even
    // when the recipient hasn't joined the sandbox, but the SID in the
    // Twilio Console will show the real terminal status (undelivered/
    // failed/delivered) within ~5 seconds.
    const message = await client.messages.create({
      body: `Lasa Hub OTP: ${code}. Valid for 10 minutes. Do not share.`,
      to: channel === "whatsapp" ? `whatsapp:${toNumber}` : toNumber,
      from: channel === "whatsapp" ? `whatsapp:${from}` : from,
    });
    logger.info(
      { phone, channel, count: reservation.count, sid: message.sid, twilioStatus: message.status },
      "OTP delivered via Twilio — check console for terminal status",
    );
    return "sent";
  } catch (err: any) {
    // Surface the Twilio error code in the log — codes are documented
    // (21608 = trial unverified, 30007 = carrier reject, 63016 = WhatsApp
    // recipient not opted in, etc.) so an ops person can fix without
    // grepping source.
    logger.warn(
      {
        err: err?.message,
        twilioCode: err?.code,
        twilioStatus: err?.status,
        moreInfo: err?.moreInfo,
        phone,
        channel,
      },
      "Twilio delivery failed",
    );
    return "failed";
  }
}

router.post("/otp/send", async (req, res) => {
  try {
    const body = req.body as { phone: string };
    const phone = normalizePhone(body.phone);
    if (!phone || phone.length < 10) {
      res.status(400).json({ error: "Valid phone number required" });
      return;
    }
    // Layered throttle: cooldown → per-phone window → per-IP window.
    // The reason code drives a precise user-facing message instead of
    // a generic "too many requests" — a 30s cooldown is very different
    // from a 15-min lockout, and the user should know which they're in.
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";
    const rate = checkOtpRate(phone, ip);
    if (!rate.allowed) {
      logger.warn({ phone, ip, reason: rate.reason, retryAfterSec: rate.retryAfterSec }, "OTP rate limit hit");
      const msg =
        rate.reason === "cooldown"
          ? `Please wait ${rate.retryAfterSec}s before requesting another OTP — the previous one may still be on its way.`
          : rate.reason === "phone_limit"
          ? "Too many OTP requests for this number. Please wait 15 minutes before trying again."
          : "Too many OTP requests from this device. Please try again in an hour.";
      res.status(429).json({ error: msg, retryAfterSec: rate.retryAfterSec, reason: rate.reason });
      return;
    }
    const code = generateOtp();
    await storeOtp(phone, code);
    const deliveryStatus = await sendViaTwilio(phone, code);

    const showInResponse = (process.env.SHOW_OTP_IN_RESPONSE ?? "false").toLowerCase() === "true";
    const payload: any = { success: true, delivery: deliveryStatus };
    if (showInResponse || deliveryStatus !== "sent") payload.otp = code;
    res.json(payload);
  } catch (err: any) {
    logger.error({ err: err?.message }, "OTP send error");
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/otp/verify", async (req, res) => {
  try {
    const body = req.body as { phone: string; otp: string };
    const phone = normalizePhone(body.phone);
    const otp = body.otp;
    if (!phone || !otp) {
      res.status(400).json({ valid: false, reason: "missing_fields" });
      return;
    }
    // Enforcement: Only accept the real OTP generated and sent to the phone.
    // The dev backdoor ("1234") has been removed for production readiness.
    const result = await consumeOtp(phone, otp);
    if (result !== "ok") {
      res.json({ valid: false, reason: result });
      return;
    }
    res.json({ valid: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "OTP verify error");
    res.status(500).json({ valid: false, reason: "server_error" });
  }
});

// Upsert the user profile after OTP verification.
router.post("/users/upsert", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const body = req.body as {
      phone: string; role: "kirana" | "wholesaler";
      name: string; shopName?: string;
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
    const shopName = body.shopName?.trim() || `${body.name}'s ${body.role === "wholesaler" ? "Wholesale" : "Kirana"}`;
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existingUser.length && existingUser[0].role !== body.role) {
      res.status(409).json({ error: `Phone already registered as ${existingUser[0].role}` });
      return;
    }

    // If signing up as a wholesaler, try to claim an existing wholesaler
    // record by matching owner phone — so seeded Suresh/Ramesh/Krishna
    // users can sign in and see the orders placed to them.
    let wholesalerId = body.wholesalerId ?? null;
    if (body.role === "wholesaler" && !wholesalerId) {
      const existing = await db
        .select()
        .from(wholesalersTable)
        .where(
          or(
            eq(wholesalersTable.ownerPhone, phone),
            eq(wholesalersTable.ownerPhone, `+91${phone}`),
          ),
        )
        .limit(1);
      if (existing.length) {
        wholesalerId = existing[0].id;
        await db.update(wholesalersTable).set({
          ownerName: body.name,
          ownerPhone: phone,
          name: shopName,
          lat: body.lat ?? existing[0].lat ?? null,
          lng: body.lng ?? existing[0].lng ?? null,
          location: body.lat && body.lng ? `${body.lat.toFixed(4)}, ${body.lng.toFixed(4)}` : existing[0].location,
          active: true,
          updatedAt: new Date(),
        }).where(eq(wholesalersTable.id, existing[0].id));
      } else {
        // Auto-create a new wholesaler record
        const newId = `w_${phone}`;
        const [newWs] = await db.insert(wholesalersTable).values({
           id: newId,
           name: shopName,
           ownerName: body.name,
           ownerPhone: phone,
           location: body.lat && body.lng ? `${body.lat.toFixed(4)}, ${body.lng.toFixed(4)}` : "Unknown",
           distance: "Unknown",
           lat: body.lat ?? null,
           lng: body.lng ?? null,
           active: true,
        }).returning();
        wholesalerId = newWs.id;
      }
    }

    const values = {
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
    };
    const [row] = await db
      .insert(usersTable)
      .values(values)
      .onConflictDoUpdate({
        target: usersTable.phone,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    res.json({ user: row });
  } catch (err: any) {
    logger.error({ err: err?.message }, "User upsert error");
    res.status(500).json({ error: "Failed to save user" });
  }
});

router.get("/users/:phone", async (req, res) => {
  try {
    if (!hasDb) { res.status(503).json({ error: "DB not configured" }); return; }
    const phone = normalizePhone(String(req.params.phone));
    const rows = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
    let user = rows[0];

    // Self-heal: if the stored wholesalerId points to an inactive or
    // deleted wholesaler (e.g. after a cleanup pass), re-resolve to the
    // currently active wholesaler that owns this phone.
    if (user.role === "wholesaler") {
      const currentActive = await db
        .select({ id: wholesalersTable.id })
        .from(wholesalersTable)
        .where(
          and(
            eq(wholesalersTable.active, true),
            or(
              eq(wholesalersTable.ownerPhone, phone),
              eq(wholesalersTable.ownerPhone, `+91${phone}`),
            ),
          ),
        )
        .limit(1);
      const actualId = currentActive[0]?.id ?? null;
      if (actualId && user.wholesalerId !== actualId) {
        logger.info({ phone, was: user.wholesalerId, now: actualId }, "Self-healed stale user.wholesalerId");
        const [updated] = await db
          .update(usersTable)
          .set({ wholesalerId: actualId, updatedAt: new Date() })
          .where(eq(usersTable.phone, phone))
          .returning();
        if (updated) user = updated;
      }
    }

    res.json({ user });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Get user error");
    res.status(500).json({ error: "Failed to load user" });
  }
});

export default router;
