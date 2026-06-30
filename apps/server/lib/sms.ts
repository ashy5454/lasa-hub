import { logger } from "./logger";

// SMS via Fast2SMS (India). Set FAST2SMS_API_KEY in .env to enable.
// https://www.fast2sms.com/
// Falls back silently to a no-op if the key is missing.

const API_KEY = process.env.FAST2SMS_API_KEY;

export async function sendOrderSMS(to: string, message: string): Promise<void> {
  if (!API_KEY) return; // not configured — skip silently

  // Strip country code for Fast2SMS (expects 10-digit Indian number)
  const phone = to.replace(/^\+91/, "").replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) {
    logger.warn({ to }, "sendOrderSMS: invalid phone, skipping");
    return;
  }

  try {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",          // Quick SMS (no DLT required)
        message,
        language: "english",
        flash: 0,
        numbers: phone,
      }),
    });
    const json = await res.json() as any;
    if (!json.return) {
      logger.warn({ json, to }, "Fast2SMS delivery failed");
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, to }, "Fast2SMS request failed");
  }
}
