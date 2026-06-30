import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Load workspace-root .env (lib/db reads DATABASE_URL from process.env at import time,
// so this must run before any other module imports @workspace/db).
config({ path: path.resolve(here, "../../../../.env") });
config({ path: path.resolve(here, "../../.env"), override: false });

// ── Startup env validation ──────────────────────────────────────────
// Catch the kind of subtle deployment mistake that wastes hours of
// debugging — a missing letter in an env-var key (SHOW_OTP_IN_RESPONS
// instead of SHOW_OTP_IN_RESPONSE), or shipping a dev-only flag into
// production. We log loud and clear at boot so the operator sees it
// in the first lines of the Render log.

const KNOWN_KEYS = new Set([
  "NODE_ENV", "PORT", "CORS_ORIGIN",
  "DATABASE_URL",
  "ADMIN_TOKEN",
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL_CHAIN",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "TWILIO_CHANNEL",
  "SHOW_OTP_IN_RESPONSE",
  "AI_RPM_PER_IP", "AI_RPD_TOTAL",
  "OTP_RPM_PER_PHONE", "OTP_RESEND_COOLDOWN_SEC", "OTP_PER_HOUR_PER_IP",
  "TWILIO_DAILY_LIMIT",
  "FAST2SMS_API_KEY",
]);

// Tiny string-distance check so "SHOW_OTP_IN_RESPONS" gets flagged as
// "did you mean SHOW_OTP_IN_RESPONSE?". Levenshtein distance up to 2
// catches one missing / extra / swapped character — exactly the typo
// classes humans make in long SCREAMING_SNAKE keys.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i - 1] === b[j - 1]
      ? dp[i - 1][j - 1]
      : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  }
  return dp[m][n];
}

const warnings: string[] = [];

// 1. Look for env vars that LOOK like one of ours but with a typo.
for (const key of Object.keys(process.env)) {
  if (KNOWN_KEYS.has(key)) continue;
  // Skip obviously unrelated platform envs (PATH, HOME, RENDER_*, etc.)
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
  if (key.startsWith("RENDER_") || key.startsWith("VERCEL_") || key.startsWith("npm_")) continue;
  if (key.length < 6) continue;
  for (const known of KNOWN_KEYS) {
    if (editDistance(key, known) <= 2) {
      warnings.push(
        `Env var "${key}" looks like a typo of "${known}". Did you mean "${known}"? The misspelled key is being ignored.`,
      );
      break;
    }
  }
}

// 2. Catch dev flags accidentally shipped to prod.
const isProd = process.env.NODE_ENV === "production";
const showOtp = (process.env.SHOW_OTP_IN_RESPONSE ?? "true").toLowerCase() === "true";
if (isProd && showOtp) {
  warnings.push(
    `SHOW_OTP_IN_RESPONSE is "true" while NODE_ENV is "production". The OTP will be leaked in every /api/otp/send response — anyone who can see the network tab can log in as any phone. Set SHOW_OTP_IN_RESPONSE=false on the host.`,
  );
}

// 3. Warn if Twilio is half-configured (one cred but not all).
const twilioPieces = [
  ["TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID],
  ["TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN],
  ["TWILIO_FROM_NUMBER", process.env.TWILIO_FROM_NUMBER],
] as const;
const setCount = twilioPieces.filter(([, v]) => !!v).length;
if (setCount > 0 && setCount < 3) {
  const missing = twilioPieces.filter(([, v]) => !v).map(([k]) => k).join(", ");
  warnings.push(
    `Twilio is partially configured (${setCount}/3 vars set). Missing: ${missing}. OTP delivery will silently fall back to "skipped".`,
  );
}

if (warnings.length) {
  // Print BEFORE the logger is initialised so warnings show even if
  // logging fails for some reason. Render's log viewer picks these up.
  // eslint-disable-next-line no-console
  console.warn("\n" + "=".repeat(72));
  // eslint-disable-next-line no-console
  console.warn("ENV CONFIG WARNINGS — fix these before treating the server as production-ready");
  // eslint-disable-next-line no-console
  console.warn("=".repeat(72));
  for (const w of warnings) console.warn("  - " + w);
  // eslint-disable-next-line no-console
  console.warn("=".repeat(72) + "\n");
}
