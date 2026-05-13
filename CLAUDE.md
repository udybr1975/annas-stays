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

## Recent Changes

All changes below are in `src/components/ExecutiveView.tsx` (mobile view only — desktop untouched).

- **Completed status:** on dashboard load, confirmed bookings whose checkout date has passed are auto-updated to `status = 'completed'` in Supabase and removed from the active list. A new "Completed" filter shows them sorted by checkout date descending.
- **Mobile filter menu:** replaced the horizontal tab row with a bottom sheet triggered by a burger button. Each option shows a live booking count badge. Filter selection closes the sheet.
- **Mobile calendar view:** full monthly calendar with apartment selector pills, month navigation, and booking bars rendered as colored horizontal strips (forest = confirmed, rose = pending, amber = awaiting payment, grey = completed). Bars split across week rows. Tapping any bar opens the existing BookingDrawer.
- **List/Calendar toggle:** full-width two-button toggle bar (`List | Calendar`) placed below the sticky header, scrolls with the page. Switches `mobileView` state between `'list'` and `'calendar'`.

Changes below are in `src/App.tsx`.

- **Mobile tab-based guest experience:** `MobileApp` component added to `App.tsx` (`lg:hidden`). Three tabs — Stays (apartment cards with booking), Helsinki (guide grid + This Week in Helsinki), Chat (full-screen ChatBot). Desktop `LandingPage` wrapped in `hidden lg:block`, completely untouched. Only `App.tsx` modified.
- **Staging/production sync status:** staging and production are currently in sync up to commit `fc2dbaf` (mobile calendar, filter menu, completed status). The new `MobileApp` (commit `9282ddf`) is on staging only — not yet promoted to production.

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
