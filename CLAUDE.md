## Branch Strategy
- **main** → deploys to anna-stays.fi (PRODUCTION — never develop directly here)
- **staging** → deploys to staging.anna-stays.fi (all new features built here first)
- Merge staging → main only after 11/11 test passes and feature is manually verified on staging
- Use tests/promote-to-production.ps1 to merge safely

# Anna Stays — Project Context

## App
- Name: Anna Stays
- Live URL: anna-stays.fi
- Stack: React, Vite, Express, Supabase, Stripe, Resend, ntfy, Gemini, Vercel

## Critical Rules
- Every booking status change must trigger three things: guest email, info@anna-stays.fi email, ntfy notification
- Never push to GitHub without explicit user approval
- Never modify /tests/ or /api/test/ files as part of real fixes
- Real fixes go in real API files only

## Local Development
- Start all services: powershell -ExecutionPolicy Bypass -File tests\dev-start.ps1
- Run automated test: npx tsx tests/run-booking-test.ts
- Local emails go to Mailpit localhost:8025
- RESEND_API_URL=http://localhost:2525 routes emails to Mailpit locally
- Stripe always test mode locally
- Update STRIPE_WEBHOOK_SECRET in .env after every Stripe CLI restart

## Environment Variables
- Local credentials in .env (gitignored)
- Production credentials in Vercel dashboard
- NTFY_URL and GEMINI_API_KEY must exist in both .env and Vercel

## Environment Variable Rules
- Server-side API files must NEVER use VITE_ prefixed environment variables
- VITE_ variables are frontend-only and completely invisible to Vercel serverless functions
- Any code written in the api/ folder must use these server-side variables:
  - NEXT_PUBLIC_SUPABASE_URL (never VITE_SUPABASE_URL)
  - RESEND_API_KEY (never VITE_RESEND_API_KEY)
  - GEMINI_API_KEY (never VITE_GEMINI_API_KEY)
  - SUPABASE_SERVICE_ROLE_KEY for all server-side Supabase operations
- Before pushing any api/ file to GitHub, always grep for VITE_ and confirm zero matches

## Test Infrastructure (local only)
- /tests/ — all test scripts, gitignored
- /api/test/ — all test endpoints, gitignored
- 5 services run simultaneously for testing

## Testing Rules

### After every code change:
1. Run `npx tsx tests/run-booking-test.ts`
2. All 11 steps must pass
3. Never push to GitHub if any step fails

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

staging and main are currently **in sync** (last merged 2026-05-13).

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
