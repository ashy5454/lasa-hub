import { Router } from "express";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { logger } from "../lib/logger";
import { aiRateLimit, recordAiCall, cacheGet, cacheSet, sha256 } from "../lib/quotas";

const router = Router();

// Every AI endpoint goes through the same rate limiter (per-IP per-minute
// + server-wide per-day cap). Image responses are additionally cached by
// SHA-256 of the payload so repeat scans of the same photo don't bill twice.
router.use(["/ai/analyze-image", "/ai/analyze-inventory", "/ai/parse-voice"], aiRateLimit);

// Model fallback chain. 2.5-pro reads handwriting best but only works on
// a Tier-1+ paid Google Cloud project — on a free-tier or unhealthy-billing
// project pro returns `limit: 0` immediately. We walk down to 2.5-flash
// (much higher quota, still reads handwriting well) then 1.5-flash. All
// three are multimodal so they accept the same image+prompt payload —
// only the accuracy, cost, and quota differ.
//
// Override at deploy time via GEMINI_MODEL_CHAIN env var, e.g.:
//   GEMINI_MODEL_CHAIN=gemini-2.5-pro,gemini-2.5-flash
//   GEMINI_MODEL_CHAIN=gemini-2.5-flash       # flash-only, cheapest
// Useful when you want to force pro-only after fixing billing, or pin
// to flash if you're watching spend.
// IMPORTANT: every name here must exist on the v1beta endpoint at the
// moment the server runs. `gemini-1.5-flash` was deprecated and returns
// 404, which is why it was removed. Verify with:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY"
// Pro: best accuracy, paid-tier only. Flash: ~30× more quota, still reads
// handwriting well. Flash-lite + 2.0-flash: last-resort safety nets so
// the endpoint stays up even if both 2.5 lines are overloaded.
const DEFAULT_MODEL_CHAIN = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;
const MODEL_CHAIN: readonly string[] = (process.env.GEMINI_MODEL_CHAIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .length
  ? (process.env.GEMINI_MODEL_CHAIN as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : DEFAULT_MODEL_CHAIN;

function getGenAI() {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return new GoogleGenerativeAI(key);
}

function isQuotaError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  const status = err?.status ?? err?.statusCode;
  // Gemini SDK surfaces 429 in the message string and sometimes as status.
  return (
    status === 429 ||
    msg.includes("429") ||
    /quota/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /resource.?exhausted/i.test(msg)
  );
}

/**
 * Transient errors from Gemini that mean "this model is unhappy right now,
 * try the next one in the chain". Covers:
 *  - 503 (overload / "high demand")
 *  - 500 (Google-side internal error)
 *  - 502 / 504 (gateway problems)
 *  - Network/socket errors with no HTTP status
 * The right response to all of these is the same: roll forward to the
 * next fallback model instead of failing the user's request.
 */
function isTransientError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  const status = err?.status ?? err?.statusCode;
  if (status && [404, 500, 502, 503, 504].includes(status)) return true;
  return (
    /\b40[4]\b/.test(msg) ||  // model deprecated / not found → roll to next
    /\b50[0234]\b/.test(msg) ||
    /not found for API version/i.test(msg) ||
    /is not supported for generateContent/i.test(msg) ||
    /service unavailable/i.test(msg) ||
    /unavailable/i.test(msg) ||
    /overload/i.test(msg) ||
    /high demand/i.test(msg) ||
    /try again later/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg)
  );
}

/**
 * Tolerant JSON extractor. Gemini sometimes returns:
 *   - markdown code fences (already stripped below)
 *   - trailing commas:  [{"a":1},]
 *   - unescaped newlines inside string values
 *   - extra commentary before/after the JSON block
 * If strict JSON.parse fails we (1) strip trailing commas and retry,
 * then (2) fall back to extracting individual {...} object literals
 * and parsing each one independently. Any unparseable object is just
 * dropped — better to return 4 of the 5 items than fail the whole scan.
 */
function tolerantJsonParse(slice: string): any {
  try {
    return JSON.parse(slice);
  } catch {}
  const noTrailingCommas = slice.replace(/,\s*([\]}])/g, "$1");
  try {
    return JSON.parse(noTrailingCommas);
  } catch {}
  // Last resort: scoop individual {...} objects out and parse them.
  // Only used when the array bracketing is broken beyond repair.
  const objects: any[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < noTrailingCommas.length; i++) {
    const ch = noTrailingCommas[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          objects.push(JSON.parse(noTrailingCommas.slice(start, i + 1)));
        } catch {
          // skip this object
        }
        start = -1;
      }
    }
  }
  if (objects.length) return objects;
  throw new Error("Unrecoverable JSON from model");
}

/**
 * Run a Gemini call across the model fallback chain. If the first model
 * fails with a quota/429 error we transparently retry with the next one
 * so the user never sees a blank screen just because pro hit its daily cap.
 * Non-quota errors (bad image, malformed JSON) bubble up immediately.
 */
async function runWithFallback<T>(
  fn: (model: GenerativeModel) => Promise<T>,
): Promise<{ result: T; modelUsed: string }> {
  const genAI = getGenAI();
  let lastErr: any;
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await fn(model);
      return { result, modelUsed: modelName };
    } catch (err: any) {
      lastErr = err;
      if (isQuotaError(err) || isTransientError(err)) {
        logger.warn(
          { model: modelName, err: err?.message, kind: isQuotaError(err) ? "quota" : "transient" },
          "Gemini error — trying next model in chain",
        );
        continue;
      }
      // Truly unrecoverable errors (auth, malformed request) — switching
      // models won't help, so surface immediately.
      throw err;
    }
  }
  throw lastErr ?? new Error("All Gemini models exhausted");
}

function parseJsonFromText(text: string): unknown {
  const cleaned = text
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
  // Try array first (the prompt asks for an `items` array inside an object,
  // but Gemini sometimes returns the bare array). Use the tolerant parser
  // so trailing commas / partial truncation don't kill the whole response.
  const aStart = cleaned.indexOf("[");
  const aEnd = cleaned.lastIndexOf("]");
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    return tolerantJsonParse(cleaned.slice(aStart, aEnd + 1));
  }
  const oStart = cleaned.indexOf("{");
  const oEnd = cleaned.lastIndexOf("}");
  if (oStart !== -1 && oEnd !== -1 && oEnd > oStart) {
    return tolerantJsonParse(cleaned.slice(oStart, oEnd + 1));
  }
  throw new Error("No JSON found in model output");
}

router.post("/ai/analyze-image", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body as {
      imageBase64: string;
      mimeType?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }

    // Re-scanning the same photo is common: user taps "Try again" after
    // a quota warning, or the camera takes near-identical frames. Hash
    // the payload and short-circuit identical requests so we don't bill
    // Gemini twice for the same image.
    const cacheKey = `img:${sha256(imageBase64 + "|" + mimeType)}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, "AI image cache hit");
      res.json({ ...cached, cached: true });
      return;
    }

    const prompt = `You are reading a handwritten grocery/shopping list from rural India.
The list may be in English, Telugu (తెలుగు), or Hindi (हिन्दी).

Return ONLY a valid JSON object — no markdown, no explanation.
Shape:
{
  "sourceLanguage": "en" | "te" | "hi",
  "items": [
    {
      "name":   "<English canonical name>",
      "nameTe": "<Telugu script name (తెలుగు)>",
      "nameHi": "<Hindi script name (हिन्दी)>",
      "quantity": "<e.g. 5 kg>"
    }
  ]
}

Rules:
- sourceLanguage = the script the original list was written in. Detect from the actual writing.
- name = ENGLISH canonical name (e.g. "Toor Dal", "Rice Basmati", "Sunflower Oil"). Always provide.
- nameTe = same item in Telugu script. If unsure, do your best transliteration.
- nameHi = same item in Devanagari (Hindi) script. If unsure, do your best transliteration.
- quantity: keep units the user wrote (kg, litre, packet, piece). If no quantity, use "1".
- Skip headers, totals, or non-item lines.`;

    const { result, modelUsed } = await runWithFallback((model) =>
      model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        prompt,
      ]),
    );

    const text = result.response.text();
    logger.info({ text, modelUsed }, "Gemini image response");

    const parsed = parseJsonFromText(text) as any;
    // Backward-compatible shape: if Gemini returned a bare array, wrap it.
    let items: any[] = [];
    let sourceLanguage: string | null = null;
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && Array.isArray(parsed.items)) {
      items = parsed.items;
      sourceLanguage = parsed.sourceLanguage ?? null;
    }
    items = items.map((i: any) => ({
      name: i.name ?? i.nameEn ?? "",
      nameTe: i.nameTe ?? "",
      nameHi: i.nameHi ?? "",
      quantity: i.quantity ?? "1",
    }));
    const payload = { items, sourceLanguage, modelUsed, raw: text };
    cacheSet(cacheKey, payload);
    recordAiCall(modelUsed);
    res.json(payload);
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI image analysis error");
    const quota = isQuotaError(err);
    const transient = isTransientError(err);
    res.status(quota || transient ? 429 : 500).json({
      error: quota
        ? "AI is busy right now (daily quota reached). Please try again in a few minutes or use voice order."
        : transient
        ? "AI servers are overloaded right now. Please tap Try again — usually clears in under a minute."
        : err?.message || "Image analysis failed",
      retryable: quota || transient,
    });
  }
});

router.post("/ai/analyze-inventory", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body as {
      imageBase64: string;
      mimeType?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }

    const cacheKey = `inv:${sha256(imageBase64 + "|" + mimeType)}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, "AI inventory cache hit");
      res.json({ ...cached, cached: true });
      return;
    }

    const prompt = `You are reading a handwritten wholesaler inventory / price list from rural India.
The list may be in English, Telugu (తెలుగు), or Hindi (हिन्दी).

Return ONLY a valid JSON object — no markdown, no explanation.
Shape:
{
  "sourceLanguage": "en" | "te" | "hi",
  "items": [
    {
      "name":   "<English canonical name>",
      "nameTe": "<Telugu script name>",
      "nameHi": "<Hindi script name>",
      "unit": "kg" | "litre" | "box" | "piece" | "packet",
      "pricePerUnit": <number INR>,
      "stockQuantity": <number or null>,
      "taxPercent": <0-28>
    }
  ]
}

Rules:
- sourceLanguage = script the list was written in.
- name = ENGLISH canonical name. Always provide.
- nameTe / nameHi = same item in Telugu and Hindi scripts (transliterate if unsure).
- pricePerUnit must be a number in INR, no symbol.
- stockQuantity: number; if not legible, use null.
- taxPercent: number 0-28; if not visible, use 0.
- Skip header rows ("Item | Price | Stock") and totals.`;

    const { result, modelUsed } = await runWithFallback((model) =>
      model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        prompt,
      ]),
    );

    const text = result.response.text();
    logger.info({ text, modelUsed }, "Gemini inventory image response");

    const parsed = parseJsonFromText(text) as any;
    let items: any[] = [];
    let sourceLanguage: string | null = null;
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && Array.isArray(parsed.items)) {
      items = parsed.items;
      sourceLanguage = parsed.sourceLanguage ?? null;
    }
    items = items.map((i: any) => ({
      name: i.name ?? i.nameEn ?? "",
      nameTe: i.nameTe ?? "",
      nameHi: i.nameHi ?? "",
      unit: i.unit ?? "kg",
      pricePerUnit: Number(i.pricePerUnit) || 0,
      stockQuantity: i.stockQuantity == null ? null : (Number(i.stockQuantity) || 0),
      taxPercent: Number(i.taxPercent) || 0,
    }));
    const payload = { items, sourceLanguage, modelUsed, raw: text };
    cacheSet(cacheKey, payload);
    recordAiCall(modelUsed);
    res.json(payload);
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI inventory analysis error");
    const quota = isQuotaError(err);
    const transient = isTransientError(err);
    res.status(quota || transient ? 429 : 500).json({
      error: quota
        ? "AI is busy right now (daily quota reached). Please try again in a few minutes or add items manually."
        : transient
        ? "AI servers are overloaded right now. Please tap Try again — usually clears in under a minute."
        : err?.message || "Inventory analysis failed",
      retryable: quota || transient,
    });
  }
});

router.post("/ai/parse-voice", async (req, res) => {
  try {
    const { transcript } = req.body as { transcript: string };

    if (!transcript?.trim()) {
      res.status(400).json({ error: "transcript required" });
      return;
    }

    const cacheKey = `voice:${sha256(transcript.trim().toLowerCase())}`;
    const cached = cacheGet<any>(cacheKey);
    if (cached) {
      logger.info({ cacheKey }, "AI voice cache hit");
      res.json({ ...cached, cached: true });
      return;
    }

    const prompt = `Parse this spoken grocery order into structured items.
Transcript: "${transcript}"
Speech may be in English, Telugu (తెలుగు), or Hindi (हिन्दी), possibly mixed.

Return ONLY a valid JSON object — no markdown, no explanation.
Shape:
{
  "sourceLanguage": "en" | "te" | "hi",
  "items": [
    { "name": "<English canonical>", "nameTe": "<Telugu>", "nameHi": "<Hindi>", "quantity": "<e.g. 5 kg>" }
  ]
}

Rules:
- Quantities like "paanch kilo" → "5 kg", "do liter" → "2 L", "teen packet" → "3 packets".
- name = ENGLISH canonical. nameTe/nameHi = same item in those scripts.
- If quantity not spoken, use "1".`;

    const { result, modelUsed } = await runWithFallback((model) =>
      model.generateContent(prompt),
    );
    const text = result.response.text();
    logger.info({ text, modelUsed }, "Gemini voice response");

    const parsed = parseJsonFromText(text) as any;
    let items: any[] = [];
    let sourceLanguage: string | null = null;
    if (Array.isArray(parsed)) items = parsed;
    else if (parsed && Array.isArray(parsed.items)) { items = parsed.items; sourceLanguage = parsed.sourceLanguage ?? null; }
    items = items.map((i: any) => ({
      name: i.name ?? "",
      nameTe: i.nameTe ?? "",
      nameHi: i.nameHi ?? "",
      quantity: i.quantity ?? "1",
    }));
    const payload = { items, sourceLanguage, modelUsed, raw: text };
    cacheSet(cacheKey, payload);
    recordAiCall(modelUsed);
    res.json(payload);
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI voice parse error");
    const quota = isQuotaError(err);
    const transient = isTransientError(err);
    res.status(quota || transient ? 429 : 500).json({
      error: quota
        ? "AI is busy right now (daily quota reached). Please try again in a few minutes or type your order."
        : transient
        ? "AI servers are overloaded right now. Please tap and speak again — usually clears in under a minute."
        : err?.message || "Voice parsing failed",
      retryable: quota || transient,
    });
  }
});

export default router;
