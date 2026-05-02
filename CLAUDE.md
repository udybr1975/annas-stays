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

## Test Infrastructure (local only)
- /tests/ — all test scripts, gitignored
- /api/test/ — all test endpoints, gitignored
- 5 services run simultaneously for testing
