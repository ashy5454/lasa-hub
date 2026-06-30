/**
 * Quota & rate-limit protection.
 *
 * Why this exists: when the app goes live a single user (or a buggy
 * loop in the frontend) can burn through the Gemini daily quota or
 * Twilio SMS credit in minutes. This module gives every expensive
 * endpoint the same defenses:
 *
 *   1. Per-IP token-bucket rate limit (catches abuse and dev mistakes)
 *   2. Per-day global counter with a configurable hard cap
 *   3. SHA-256 response cache for idempotent calls (saves money)
 *
 * Everything is in-memory. For multi-instance production swap the
 * Map storage for Redis — interface stays the same. For a single
 * Node process serving the whole app (which is the current setup)
 * this is enough and adds zero infra cost.
 *
 * Usage limits are sourced from env vars so you can tune them per
 * environment without editing code:
 *
 *   AI_RPM_PER_IP           Gemini calls per IP per minute (default 6)
 *   AI_RPD_TOTAL            Gemini calls server-wide per day (default 1200)
 *   OTP_RPM_PER_PHONE       OTP sends per phone per 15 min (default 3)
 *   TWILIO_DAILY_LIMIT      Twilio sends server-wide per day (default 40)
 */

import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { logger } from "./logger";

// ── Counters ──────────────────────────────────────────────────────────
// Daily counters reset at the start of each UTC day. We pin to UTC
// (not Asia/Kolkata) so that resets happen at a predictable instant
// regardless of where the user is.

type DailyCounter = { count: number; resetAt: number };
const dailyCounters = new Map<string, DailyCounter>();

function startOfNextUtcDay(): number {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function bumpDaily(key: string, limit: number): { count: number; allowed: boolean } {
  const now = Date.now();
  let c = dailyCounters.get(key);
  if (!c || c.resetAt <= now) {
    c = { count: 0, resetAt: startOfNextUtcDay() };
    dailyCounters.set(key, c);
  }
  if (c.count >= limit) return { count: c.count, allowed: false };
  c.count += 1;
  return { count: c.count, allowed: true };
}

export function peekDaily(key: string): { count: number; resetAt: number } {
  const c = dailyCounters.get(key);
  if (!c || c.resetAt <= Date.now()) return { count: 0, resetAt: startOfNextUtcDay() };
  return { count: c.count, resetAt: c.resetAt };
}

// ── Sliding-window rate limiter (per IP / per phone) ─────────────────
// Token bucket would be slightly more elegant but the sliding-window
// counter is easier to reason about and one extra `filter` on a small
// array per request is cheap. Each key's history is capped so worst-case
// memory is bounded by the number of distinct keys we see.

type Hit = number; // timestamp in ms
const hitsByKey = new Map<string, Hit[]>();

function checkWindow(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (hitsByKey.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= max) {
    hitsByKey.set(key, hits);
    return false;
  }
  hits.push(now);
  hitsByKey.set(key, hits);
  return true;
}

// ── Response cache (SHA-256 keyed) ───────────────────────────────────
// Used by /api/ai/analyze-image so that re-scanning the same photo
// (e.g. the user taps "Try again" because of a quota error and pro
// has freed up) returns the cached parse instead of burning another
// Gemini call. LRU-trimmed to TTL + max-entry bound.

type CacheEntry<T> = { value: T; expiresAt: number };
const responseCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — long enough for retries, short enough that stale prompts don't pile up
const CACHE_MAX_ENTRIES = 200;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function cacheGet<T>(key: string): T | undefined {
  const e = responseCache.get(key);
  if (!e) return undefined;
  if (e.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet<T>(key: string, value: T): void {
  if (responseCache.size >= CACHE_MAX_ENTRIES) {
    // Evict the oldest entry. Map iteration order is insertion order
    // so the first key is the oldest.
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Env-driven limits ────────────────────────────────────────────────
function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Dev defaults are intentionally lax so the founder doesn't trip her own
// safety guards while smoke-testing. Prod defaults are tight so a single
// abusive IP can't drain Twilio credit or Gemini quota. NODE_ENV gates
// the difference; explicit env vars still win over both defaults.
const isProd = process.env.NODE_ENV === "production";

export const LIMITS = {
  aiRpmPerIp: int("AI_RPM_PER_IP", isProd ? 6 : 60),
  aiRpdTotal: int("AI_RPD_TOTAL", isProd ? 1200 : 5000),
  // Per phone: 5 sends per 15 min matches AWS Cognito / Twilio Verify /
  // Razorpay norms. Three was too tight given rural India SMS latency
  // (60-90s delivery is common, user hits Resend before the first SMS
  // arrives, locks themselves out).
  otpPer15minPerPhone: int("OTP_RPM_PER_PHONE", isProd ? 5 : 30),
  // Cooldown between consecutive sends to the SAME phone. Forces a
  // small wait between resend taps so the per-15min bucket lasts
  // longer for a real user retrying through bad signal.
  otpResendCooldownSec: int("OTP_RESEND_COOLDOWN_SEC", isProd ? 30 : 0),
  // Per IP cap on OTP sends. Defends against enumeration attacks where
  // one attacker rotates through thousands of phone numbers from a
  // single source. Per-phone limits don't catch this because each
  // phone has its own counter.
  otpPerHourPerIp: int("OTP_PER_HOUR_PER_IP", isProd ? 20 : 200),
  twilioDailyLimit: int("TWILIO_DAILY_LIMIT", isProd ? 40 : 200),
} as const;

// ── Helpers used by routes ───────────────────────────────────────────

function clientIp(req: Request): string {
  // Trust the first IP in X-Forwarded-For when behind a proxy. If the
  // header is missing fall back to socket remote. We don't validate
  // the IP shape — it's a rate-limit key, not an audit log.
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Express middleware: rate-limits AI endpoints and tracks a daily
 * server-wide cap. Returns 429 with a friendly Telugu/Hindi-aware
 * message when either limit is exceeded.
 */
export function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const okPerMin = checkWindow(`ai:ip:${ip}`, 60_000, LIMITS.aiRpmPerIp);
  if (!okPerMin) {
    logger.warn({ ip, limit: LIMITS.aiRpmPerIp }, "AI rate limit (per-IP per-minute) hit");
    res.status(429).json({
      error: "Too many AI requests — please wait a minute before trying again.",
      retryable: true,
    });
    return;
  }
  // Daily total check (probe without incrementing — the route increments
  // only on actual call success to avoid double-counting cache hits).
  const daily = peekDaily("ai:total");
  if (daily.count >= LIMITS.aiRpdTotal) {
    logger.warn({ daily, limit: LIMITS.aiRpdTotal }, "AI daily total cap hit");
    res.status(429).json({
      error: "AI is busy today (daily cap reached). Please try voice order or come back tomorrow.",
      retryable: false,
      resetAt: daily.resetAt,
    });
    return;
  }
  next();
}

/** Routes call this AFTER a successful Gemini hit (not on cache hit). */
export function recordAiCall(modelUsed?: string): void {
  bumpDaily("ai:total", LIMITS.aiRpdTotal);
  if (modelUsed) bumpDaily(`ai:model:${modelUsed}`, Number.MAX_SAFE_INTEGER);
}

/** Per-model usage counts for the diagnostic endpoint. */
function modelCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  const now = Date.now();
  for (const [key, c] of dailyCounters) {
    if (!key.startsWith("ai:model:")) continue;
    if (c.resetAt <= now) continue;
    out[key.slice("ai:model:".length)] = c.count;
  }
  return out;
}

/**
 * OTP rate limit — three layered checks:
 *
 *   1. Cooldown between consecutive sends to the same phone (30s prod)
 *      Cheap protection against resend-button mashing. Lets real users
 *      retry but forces them to wait the time SMS actually takes to land.
 *   2. Per-phone bucket: 5 sends per 15 min (prod)
 *      Catches sustained abuse on one number. Industry norm.
 *   3. Per-IP bucket: 20 sends per hour (prod)
 *      Catches phone-number enumeration from a single source. The
 *      per-phone cap alone misses this because each new number starts
 *      with a fresh counter.
 *
 * The first failing check decides the response. Returns `reason` so
 * the route can give a precise message ("wait 30 seconds" vs "wait
 * 15 minutes" vs "too many attempts from this device").
 */
export function checkOtpRate(
  phone: string,
  ip: string,
): { allowed: boolean; retryAfterSec: number; reason: string } {
  // 1. Cooldown — look at the last hit for this phone.
  const cooldownMs = LIMITS.otpResendCooldownSec * 1000;
  if (cooldownMs > 0) {
    const hits = hitsByKey.get(`otp:phone:${phone}`) ?? [];
    const lastHit = hits[hits.length - 1];
    if (lastHit && Date.now() - lastHit < cooldownMs) {
      const wait = Math.ceil((cooldownMs - (Date.now() - lastHit)) / 1000);
      return { allowed: false, retryAfterSec: wait, reason: "cooldown" };
    }
  }
  // 2. Per-phone window.
  if (!checkWindow(`otp:phone:${phone}`, 15 * 60_000, LIMITS.otpPer15minPerPhone)) {
    return { allowed: false, retryAfterSec: 15 * 60, reason: "phone_limit" };
  }
  // 3. Per-IP window. Note: we already recorded a hit on the phone
  // bucket above. If the IP cap trips here we still allow the phone
  // bucket entry — that's intentional; the per-phone cap should
  // reflect "how many SMS this number has burned" regardless of IP.
  if (!checkWindow(`otp:ip:${ip}`, 60 * 60_000, LIMITS.otpPerHourPerIp)) {
    return { allowed: false, retryAfterSec: 60 * 60, reason: "ip_limit" };
  }
  return { allowed: true, retryAfterSec: 0, reason: "ok" };
}

/**
 * Twilio daily quota guard. Call this before every send. Returns
 * false if we've already burned through the configured daily cap —
 * the caller should skip the Twilio call and fall back to showing
 * the OTP in the response (the existing `SHOW_OTP_IN_RESPONSE` path).
 */
export function tryReserveTwilioSend(): { allowed: boolean; count: number } {
  const { count, allowed } = bumpDaily("twilio:sends", LIMITS.twilioDailyLimit);
  if (!allowed) {
    logger.warn({ count, limit: LIMITS.twilioDailyLimit }, "Twilio daily cap reached — skipping send");
  }
  return { allowed, count };
}

/**
 * Reset rate-limit state. Used by the admin "unblock" endpoint when a
 * legitimate user gets stuck behind the per-phone OTP limiter (e.g.
 * the founder hammering the resend button while testing). Optional
 * `keyPrefix` lets the admin clear just one bucket (e.g. "otp:phone:")
 * instead of nuking everything.
 */
export function resetRateLimits(keyPrefix?: string): { cleared: number } {
  if (!keyPrefix) {
    const n = hitsByKey.size;
    hitsByKey.clear();
    return { cleared: n };
  }
  let n = 0;
  for (const key of [...hitsByKey.keys()]) {
    if (key.startsWith(keyPrefix)) {
      hitsByKey.delete(key);
      n++;
    }
  }
  return { cleared: n };
}

/** For the /api/usage diagnostic endpoint. */
export function snapshotUsage() {
  return {
    limits: LIMITS,
    today: {
      aiCalls: peekDaily("ai:total"),
      aiCallsByModel: modelCounts(),
      twilioSends: peekDaily("twilio:sends"),
    },
    cache: {
      entries: responseCache.size,
      ttlMinutes: CACHE_TTL_MS / 60_000,
    },
  };
}
