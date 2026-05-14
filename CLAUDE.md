# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Branch Strategy
- **main** → deploys to anna-stays.fi (PRODUCTION — never develop directly here)
- **staging** → deploys to staging.anna-stays.fi (all new features built here first)
- Merge staging → main when the user asks to push to main — no automatic test gate
- Tests are run on demand via skills when the user explicitly requests them (on staging, main, or both)

# Anna Stays — Project Context

## App
- Name: Anna Stays
- Live URL: anna-stays.fi
- Stack: React, Vite, Express, Supabase, Stripe, Resend, ntfy, Gemini, Vercel

## Commands

```bash
# Local dev (starts Express + Vite together)
npm run dev

# Type-check only (no emit) — the lint step
npm run lint

# Production build
npm run build
```

There is no separate test runner command — the project uses a hand-rolled E2E script:

```bash
npx tsx tests/run-booking-test.ts   # 11-step booking flow test
```

Start all five local services (Express, Vite, Stripe CLI, Mailpit, etc.) with:

```powershell
powershell -ExecutionPolicy Bypass -File tests\dev-start.ps1
```

## Architecture

### Dual-runtime design

The project runs the same API handler files in two environments:

| Environment | Runtime | How |
|---|---|---|
| Local dev | Express (`server.ts`) | Handlers imported and registered as `app.post(...)` routes |
| Production | Vercel serverless | Each `api/*.ts` file is a Vercel Function (default export = handler) |

`server.ts` is the local development entry point only. It wraps Vite's dev server as middleware. On Vercel, `vite build` produces `dist/` and `vercel.json` rewrites all non-API paths to `index.html`.

**Important**: `api/webhook.ts` must be registered before `express.json()` in `server.ts` because it reads the raw body stream for Stripe signature verification.

### Booking state machine

```
pending → awaiting_payment → confirmed
pending → declined
confirmed → cancelled
```

- **Instant book** apartments skip the pending state: frontend creates checkout session → Stripe webhook fires → booking inserted as `confirmed`.
- **Request-to-book** apartments: frontend saves a `pending` booking → admin approves via dashboard → `api/approve-booking.ts` creates a Stripe Payment Link and sets status to `awaiting_payment` → guest pays → Stripe webhook sets `confirmed`.
- The webhook (`api/webhook.ts`) handles both flows and differentiates via `session.metadata.source === 'approve_booking'`.

### Every booking status change must trigger three things
1. Guest email (via Resend)
2. Host email to info@anna-stays.fi
3. ntfy push notification to `process.env.NTFY_URL`

### Email architecture

Two parallel email systems exist — use `api/emailTemplate.ts` for all new emails:

- **`api/emailTemplate.ts`** — canonical HTML builder used by `webhook.ts`, `approve-booking.ts`, `cancel-booking.ts`, `decline-booking.ts`. Pure string helpers, no imports. Palette is defined in its header comment.
- **`src/lib/emailUtils.ts`** — older client-side template used only by `api/send-email.ts` fallback. Has a hardcoded staging URL — do not extend this file.

All API files send emails by calling the Resend REST API directly (not the SDK), so the `RESEND_API_URL` env var can be overridden locally to point at Mailpit (`http://localhost:2525`).

### Supabase tables
- `apartments` — listing config, images array, `is_instant_book`, `min`, weekend pricing fields
- `apartment_details` — per-apartment knowledge base entries (`category`, `content`, `is_private`)
- `apartment_prices` — event/season pricing overrides (`pricing_type`, `start_date`, `end_date`, `price_override`)
- `bookings` — booking records with full state machine fields + `admin_needs_attention` flag
- `guests` — one row per booking (email is no longer unique — a guest can have multiple rows)
- `airbnb_blocked_dates` — iCal-synced blocked ranges per apartment

The frontend client in `src/lib/supabase.ts` uses a hardcoded anon key (intentional — avoids env var issues on Vercel). Server-side API files must use `SUPABASE_SERVICE_ROLE_KEY` via `createClient(url, serviceKey)`.

### ChatBot (`src/components/ChatBot.tsx`)

The chatbot calls Gemini directly from the browser using `window.GEMINI_API_KEY` (set from `VITE_GEMINI_API_KEY` in `App.tsx`). It maintains a hardcoded `idMap` mapping short integer IDs (1/2/3) to Supabase UUIDs. When the chatbot has a verified booking context, it has access to private apartment details (`is_private: true` rows from `apartment_details`).

#### `forceOpen` prop (added 2026-05-14)

`ChatBot` accepts an optional `forceOpen?: boolean` prop (default `false`).

- When `false` (desktop): the floating 💬 button is visible; the panel is a fixed popup (`fixed bottom-[150px] right-7 w-[340px] h-[500px]`) toggled by the button.
- When `true` (mobile Chat tab): the floating button is hidden; the panel renders as a full-height inline layout (`flex flex-col h-full`) that fills its parent container — header pinned top, messages scrolling in the middle (`flex-1 overflow-y-auto min-h-0`), input bar pinned bottom. All fixed/absolute positioning is removed.

In `MobileApp` (`App.tsx`), the `ChatBot` inside the `activeTab === 'chat'` block uses `forceOpen={true}`. The desktop `ChatBot` in `LandingPage` is unchanged and does not pass `forceOpen`.

### Gemini usage
- **Frontend** (ChatBot): `VITE_GEMINI_API_KEY` → `window.GEMINI_API_KEY` → direct browser calls
- **Backend** (webhook, helsinki-events): `GEMINI_API_KEY` env var → server-side calls
- Model: `gemini-2.5-flash` for all uses
- `api/helsinki-events.ts` uses `responseMimeType: 'application/json'` and retries up to 3× on 503 errors

### Pricing priority (in order)
1. Active event price (`apartment_prices` where `pricing_type !== 'season'`)
2. High season price (`pricing_type === 'season'` with "high" in `event_name`)
3. Weekend pricing (`listing.weekend_pricing_enabled`)
4. Base price (`listing.price`)

### Mobile vs desktop layout

`App.tsx` renders `<LandingPage>` wrapped in `hidden lg:block` and `<MobileApp>` wrapped in `lg:hidden`. They share the same data but have completely different layouts — MobileApp uses a bottom tab bar (Stays / Helsinki / Chat). Both render the same modals (`BookingModal`, `GuideModal`, `EventsPage`, `Lightbox`, `ChatBot`).

### Admin access
Admin is detected by checking `session.user.email === "udy.bar.yosef@gmail.com"` via Supabase Auth OTP. The `/admin` route renders `AdminDashboard`, which has tabs: reservations, listings, pricing, knowledge base, UGC posts.

### iCal / Airbnb sync
`api/sync-airbnb.ts` fetches iCal URLs stored per apartment in the `apartments` table, parses VEVENT blocks, and upserts blocked date ranges into `airbnb_blocked_dates`. Triggered manually from the admin dashboard.

## Critical Rules
- Every booking status change must trigger three things: guest email, info@anna-stays.fi email, ntfy notification
- Never push to GitHub without explicit user approval
- Never modify /tests/ or /api/test/ files as part of real fixes
- Real fixes go in real API files only

## Environment Variables

- Local credentials in .env (gitignored)
- Production credentials in Vercel dashboard
- NTFY_URL and GEMINI_API_KEY must exist in both .env and Vercel

### Server-side API files must NEVER use VITE_ prefixed variables

Any code in `api/` must use:
- `NEXT_PUBLIC_SUPABASE_URL` (never `VITE_SUPABASE_URL`)
- `RESEND_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for all server-side Supabase operations

Before pushing any `api/` file, grep for `VITE_` and confirm zero matches.

## Test Infrastructure (local only)
- /tests/ — all test scripts, gitignored
- /api/test/ — all test endpoints, gitignored
- 5 services run simultaneously for testing

## Testing Rules

The 11-step automated test suite is not a required gate before pushing. Run it only when the user explicitly asks, targeting staging, main, or both as specified.

### Before testing production (anna-stays.fi):
1. Stop the Stripe CLI window (Ctrl+C)
2. Close all local service windows
3. Never have local Stripe CLI running while testing production
4. Local Stripe CLI and production webhook compete for the same Stripe events — the local server creates the booking first (lower latency), then the production webhook finds it already confirmed and skips emails

### After testing production:
1. Restart local services with: `powershell -ExecutionPolicy Bypass -File tests\dev-start.ps1`
2. Update STRIPE_WEBHOOK_SECRET in .env with the new whsec_ value from the Stripe CLI window
3. Restart the app window

## Staging / Production Sync

staging and main are currently **in sync** (last merged 2026-05-14, mobile chat layout fix + CLAUDE.md updates).

## Stripe Checkout Image

- The Stripe checkout page displays a fixed brand logo for ALL apartments — not apartment photos
- Image source: ANNA_STAYS_LOGO_URL environment variable (set in Vercel + local .env)
- Logo file: stored in Supabase apartment-images bucket as annas-stays-logo.png
- Logic in: api/create-checkout-session.ts, api/approve-booking.ts, server.ts
- Never pass listing.imgs to Stripe — the logo is always used regardless of apartment

## Cancellation Flow Facts

- **Pending bookings show "Decline Request"** — this sets `status = 'declined'` and sends different email subjects ("Booking Request Declined", "Regarding Your Reservation Request"). This is NOT the same as cancellation.
- **"Cancel Reservation" only appears on confirmed bookings** — sets `status = 'cancelled'` and `cancelled_at`. This is the true admin cancel path.
- **To test admin cancellation via QA:** create a booking request, then immediately force `status = 'confirmed'` via Supabase SQL (`UPDATE bookings SET status = 'confirmed' WHERE reference_number = '...' RETURNING id, status`), then cancel from the admin dashboard.
- **Guest email subject is "Reservation Cancelled" in both cases** — admin-cancel and guest-cancel both produce the same guest-facing subject. This is intentional. The differentiation is HOST email only: admin cancel → "Booking Cancelled by You", guest cancel → "Guest Cancelled".
- **ntfy differentiates by actor**: admin cancel → "Admin cancelled booking {REF}", guest cancel → "{GuestName} cancelled booking {REF}".

## Playwright / Browser Automation Rules

- **Calendar date selection requires dispatchEvent** — Playwright ref-based clicks and JavaScript `.click()` do not trigger React's root-delegated event listeners. The only reliable method:
  ```javascript
  const rect = cell.getBoundingClientRect();
  cell.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  }));
  ```
  Wait **600ms** between check-in and check-out clicks.
- **Stale element refs after React re-renders** — element refs captured in a snapshot become invalid after any React state change. Re-snapshot or use `browser_evaluate` with fresh `document.querySelector` calls after each interaction that triggers a re-render.
- **Beautiful Private Space: minimum 3 nights** — 2-night bookings will be rejected. Always use 3+ nights for this apartment.
- **Beautiful Private Space: July is mostly blocked** — Airbnb iCal sync blocks most of July. Use August or another open month for QA test bookings.

## Resend API Verification

- **Always use `curl` via the Bash tool** — Python `urllib` returns 403 and PowerShell `Invoke-WebRequest` fails in NonInteractive mode. The only reliable method:
  ```bash
  curl -s "https://api.resend.com/emails?limit=50" \
    -H "Authorization: Bearer {RESEND_API_KEY}"
  ```
- Read `RESEND_API_KEY` from `.env` before any QA run. Record test start time and filter all email results to `created_at` after that timestamp.

## Email Flow Impact Assessment
After every code change, Claude must assess and announce which email scenarios could be affected:

Scenarios to check:
1. Instant booking → guest confirmation email + host notification + ntfy
2. Booking request → guest acknowledgement email + host notification + ntfy
3. Approve booking → guest payment link email + host notification + ntfy
4. Payment confirmed (via payment link) → guest confirmation email + host notification + ntfy
5. Decline booking → guest decline email + host notification + ntfy
6. Cancel booking → guest cancellation email + host notification + ntfy
7. Host message to guest → guest email
8. Guest message to host → host ntfy

Format for announcement after each change:
```
EMAIL FLOW IMPACT:
- Scenarios affected: [list or 'none']
- Risk level: low / medium / high
- Recommendation: run automated test / manual test scenario X / no action needed
```
