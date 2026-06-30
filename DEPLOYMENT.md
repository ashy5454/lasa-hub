# Lasa Hub — local + deployment guide

## 0. Prereqs

- Node 22+ and pnpm 10+ (`brew install pnpm` on macOS)
- A Neon (or Supabase / Railway Postgres) account
- A Google Gemini API key (https://aistudio.google.com/app/apikey)
- Optional: a Twilio account with a purchased SMS number (or WhatsApp sandbox for testing)

## 1. First-time local setup

```bash
# From the repo root:
cp .env.example .env          # if you don't already have a .env
# Open .env and set at minimum: DATABASE_URL, GEMINI_API_KEY, ADMIN_TOKEN
# If you want real OTPs: set TWILIO_* too (see notes below).

pnpm install

# Apply the DB schema to your Postgres instance
pnpm --filter @workspace/db run push

# Start the API (port 8080). The server will auto-seed the 3 demo wholesalers
# on first boot if the `wholesalers` table is empty.
pnpm --filter @workspace/api-server run dev
```

In a second terminal:

```bash
# Start the Expo web app (port 8081 by default)
cd "artifacts/lasa-hub"
PORT=8081 EXPO_PUBLIC_API_BASE=http://localhost:8080 pnpm dev --web
```

Then open http://localhost:8081 in your browser (or on your phone's browser if you're on the same Wi‑Fi — replace `localhost` with your Mac's LAN IP).

## 2. Test the demo login

- OTP **`1234`** is a permanent dev backdoor while `SHOW_OTP_IN_RESPONSE=true` in `.env`.
- If you set up Twilio below, the real OTP is sent as an SMS (or WhatsApp) to the phone number you enter.

## 3. Admin panel

Open `http://localhost:8081/admin` — it prompts for your `ADMIN_TOKEN` (the value from `.env`). Admin can:

- See live stats (users, wholesalers, orders, pending)
- Add / edit / disable wholesalers
- Add / edit / delete catalog items per wholesaler
- Monitor every order (auto-refreshes every 10s)
- View / delete users

Make sure `ADMIN_TOKEN` is long and random. Rotate it if it leaks.

## 4. Gemini (handwriting + voice)

- The browser uses the Web Speech API to transcribe voice. **Chrome / Edge works best.** Safari is flaky. This is a browser limitation, not our code.
- Handwriting: the photo is sent to `/api/ai/analyze-image` which calls Gemini 1.5 Flash. Lighting + focus matters a lot for recognition quality on handwritten Telugu/Hindi lists.
- Voice: the transcript is sent to `/api/ai/parse-voice` which calls Gemini to structure the items.

### Tips to make handwriting work reliably for rural users

1. **White background, dark pen** — Gemini reads this dramatically better than pencil on grey paper.
2. **Hold phone flat above the list, good lighting** — the UI already nudges this, but reinforce it verbally.
3. **One item per line, quantity next to the item.** Column alignment helps a lot.
4. **Expected format for best results:** `Rice — 5 kg`, `Toor Dal — 2 kg`, etc.

You can also swap the model to `gemini-1.5-pro` in [artifacts/api-server/src/routes/ai.ts](artifacts/api-server/src/routes/ai.ts) for better accuracy at higher cost if Flash isn't enough.

## 5. Twilio notes

- Your starting number `+14155238886` is the **WhatsApp sandbox** number. Real SMS **will not send** from it.
- For SMS: go to https://console.twilio.com → Phone Numbers → Buy a number (~$1/mo in the US, INR numbers are harder to get). Then set:
  ```
  TWILIO_FROM_NUMBER=+1XXXXXXXXXX
  TWILIO_CHANNEL=sms
  ```
- For WhatsApp: keep `+14155238886`, set `TWILIO_CHANNEL=whatsapp`, and have each tester **first** message the Twilio sandbox to join (see https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn).
- Twilio media (image/pdf) on WhatsApp requires a **publicly accessible URL**. `localhost` URLs will fail because Twilio cannot fetch local files.
- In local/dev, use the built-in rich-text WhatsApp invoice body (bold/structured lines), which works without external file hosting.

## 6. Deploy to production

### 6a. Database — Neon (recommended, free tier)

1. Create a project at https://neon.tech
2. Copy the connection string from the dashboard
3. Put it in your server env as `DATABASE_URL`
4. Run `pnpm --filter @workspace/db run push` **once locally** pointing at the Neon URL to create tables

### 6b. API server — Render

1. Push this repo to GitHub (private is fine)
2. New → Web Service → connect the repo
3. **Root directory:** `artifacts/api-server`
4. **Build command:** `cd ../.. && pnpm install && pnpm --filter @workspace/api-server run build`
5. **Start command:** `pnpm --filter @workspace/api-server run start`
6. **Environment variables:** copy *all* of `.env` except `EXPO_PUBLIC_API_BASE`. Don't forget `PORT` — Render provides this automatically, your code already reads it.
7. After deploy, note the URL (e.g. `https://lasa-api.onrender.com`).

### 6c. Web app — Vercel (or Netlify)

The Expo web build is static output. Easiest path:

```bash
cd "artifacts/lasa-hub"
EXPO_PUBLIC_API_BASE=https://lasa-api.onrender.com pnpm exec expo export --platform web
```

This produces `dist/`. Upload that folder to:
- **Vercel:** `vercel --prod dist/`
- **Netlify:** drag-and-drop `dist/` at https://app.netlify.com/drop

Or set up a Vercel project pointed at this repo with:
- Build command: `cd artifacts/lasa-hub && pnpm exec expo export --platform web`
- Output directory: `artifacts/lasa-hub/dist`
- Env var: `EXPO_PUBLIC_API_BASE=https://<your-api-domain>`

### 6d. Don't forget

- **Rotate all shared keys** (Gemini, Twilio, admin token) since they were leaked in chat.
- Set `SHOW_OTP_IN_RESPONSE=false` in production so OTPs are never returned to the client. The `1234` dev backdoor will also stop working.
- Set `CORS_ORIGIN` to your web app's actual URL (not `*`) once it's live.
- Turn off `SHOW_OTP_IN_RESPONSE` only *after* verifying Twilio SMS delivery actually works for your rural test phones.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Server refuses to start, says `DATABASE_URL is not set` | Put a Postgres URL in `.env` |
| Seed didn't run | Run `pnpm --filter @workspace/db run push` first; then restart the server |
| Gemini always falls back to demo items | `GEMINI_API_KEY` missing or invalid — check server logs |
| Voice mic button does nothing on iPhone Safari | Safari's SpeechRecognition is not supported. Use Chrome on Android, or desktop Chrome. |
| Wholesaler user doesn't see orders | The wholesaler account must have `wholesalerId` matching an existing wholesaler. The server auto-assigns this if the sign-up phone matches `wholesalers.owner_phone`. Otherwise, set it via the admin panel (`users` → edit) or log in with the exact phone number from the seeded wholesaler. |
| Permission prompt for mic/camera | Expected on first use. Must be allowed by the user. |

## 8. Reset everything

```bash
# Wipe the DB tables and start fresh
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS order_items, orders, catalog_items, wholesalers, users, otp_codes CASCADE;"
pnpm --filter @workspace/db run push     # recreate
# next server boot reseeds the 3 demo wholesalers
```

## 9. Production checklist (recommended values)

Set these in your production host (Render/Railway/etc):

- `NODE_ENV=production`
- `PORT` (provided by host)
- `DATABASE_URL=postgres://...` (Neon/RDS, SSL enabled)
- `ADMIN_TOKEN=<64+ char random secret>`
- `CORS_ORIGIN=https://<your-web-domain>`
- `SHOW_OTP_IN_RESPONSE=false`
- `TWILIO_CHANNEL=whatsapp` (or `sms`, based on rollout)
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_FROM_NUMBER=+...`
- `GEMINI_API_KEY=...`
- `EXPO_PUBLIC_API_BASE=https://<your-api-domain>` (frontend build-time env)

Release gate before go-live:

1. Admin login works with rotated token only.
2. Kirana/wholesaler role isolation verified.
3. Wholesaler inventory CRUD works and persists.
4. Order -> confirmation -> WhatsApp rich invoice text arrives.
5. `SHOW_OTP_IN_RESPONSE=false` verified in API responses.
6. CORS blocked for non-allowed origins.
7. Basic backup snapshot of DB taken.
