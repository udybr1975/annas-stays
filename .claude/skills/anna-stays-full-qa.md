---
name: anna-stays-full-qa
description: Run the full 28-scenario end-to-end regression test for Anna's Stays on staging. Covers instant booking, booking request, approval + payment link, admin cancellation, and guest cancellation across both apartments. Verifies Supabase status, Resend emails, and ntfy notifications for every scenario.
---

# Anna Stays — Full E2E Regression Test

## Fixed Test Values

| Variable | Value |
|---|---|
| Staging URL | https://staging.anna-stays.fi |
| Guest email | udy.bar.yosef@gmail.com |
| Guest name | Test Guest |
| Supabase project ID | bdfvubwnxuzlcngzhiwy |
| Instant-book apartment | Cozy Studio |
| Request-only apartment | Beautiful Private Space |
| ntfy channel | https://ntfy.sh/annas-stays-helsinki-99 |

## Tools Required

- **Playwright MCP** — all browser interactions on staging
- **Supabase MCP** — SQL queries to verify booking status, cancelled_at, payment state
- **Resend API** — email verification via `GET https://api.resend.com/emails?limit=50`
- **ntfy.sh** — notification verification via Playwright on the ntfy channel URL

## Before Starting

1. Read `RESEND_API_KEY` from the `.env` file in the project root.
2. Record the test start time (ISO 8601, UTC). All email and ntfy checks must only consider items created after this timestamp.
3. Announce: "Test start time: {ISO timestamp}. RESEND_API_KEY loaded."

---

## CYCLE 1 — Instant Booking (Cozy Studio)

### 1.1 — Submit instant booking

Navigate to https://staging.anna-stays.fi. Click the Cozy Studio card to open the booking modal. Select check-in and check-out dates (minimum 2 nights, avoid already-booked dates — check the calendar). Fill in guest name "Test Guest" and email "udy.bar.yosef@gmail.com". Submit the booking. The booking should complete immediately without requiring admin approval.

**Calendar date selection (required technique):** Use `browser_evaluate` with `dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }))` — wait 600ms between check-in and check-out clicks. Direct `.click()` or ref-based clicks do not trigger React state.

Record the reference number (e.g. RES-XXXXXXXX).

### 1.2 — Verify Supabase status = confirmed

```sql
SELECT id, reference_number, status, apartment_id, created_at
FROM bookings
WHERE reference_number = '{ref}'
```

Assert `status = 'confirmed'`. Report PASS or FAIL.

### 1.3 — Verify guest confirmation email

Query Resend API. Find email to `udy.bar.yosef@gmail.com` after test start time for this reference number. Assert subject contains "Booking Confirmed". Report PASS or FAIL with exact subject found.

### 1.4 — Verify host notification email

Find email to `info@anna-stays.fi` after test start time. Assert subject contains "New Confirmed Booking". Report PASS or FAIL with exact subject found.

### 1.5 — Verify ntfy notification

Navigate to https://ntfy.sh/annas-stays-helsinki-99. Find the most recent notification after test start time. Assert it contains "Instant booking" and "Test Guest". Report PASS or FAIL with exact message text.

---

## CYCLE 2 — Booking Request (Beautiful Private Space)

### 2.1 — Submit booking request

Navigate to https://staging.anna-stays.fi. Click the Beautiful Private Space card. Select dates (minimum 3 nights). Fill in guest name "Test Guest" and email "udy.bar.yosef@gmail.com". Submit. The booking should enter pending/request state (no instant confirmation).

Record the reference number.

### 2.2 — Verify Supabase status = pending

Assert `status = 'pending'`. Report PASS or FAIL.

### 2.3 — Verify guest acknowledgement email

Assert email to `udy.bar.yosef@gmail.com` with subject containing "Request Received". Report PASS or FAIL with exact subject found.

### 2.4 — Verify host notification email

Assert email to `info@anna-stays.fi` with subject containing "New Booking Request". Report PASS or FAIL with exact subject found.

### 2.5 — Verify ntfy notification

Assert ntfy contains "New request" and "Test Guest". Report PASS or FAIL with exact message text.

---

## CYCLE 3 — Admin Approval + Payment Link

### 3.1 — Admin login

Navigate to https://staging.anna-stays.fi/admin. Enter the admin email and request OTP.

**PAUSE HERE.** Ask the user: "Please enter the 6-digit OTP code sent to the admin email."

Wait for user input, then enter the OTP to complete login.

### 3.2 — Approve the booking request

Find the booking from Cycle 2 in the admin dashboard. Click "Approve" or "Send Payment Link". Confirm the action.

### 3.3 — Verify Supabase status = awaiting_payment

```sql
SELECT status FROM bookings WHERE reference_number = '{ref}'
```

Assert `status = 'awaiting_payment'` (or equivalent). Report PASS or FAIL.

### 3.4 — Verify guest payment link email

Assert email to `udy.bar.yosef@gmail.com` with subject containing "Payment Link" or "Complete Your Booking". Report PASS or FAIL with exact subject found.

### 3.5 — Verify host approval notification email

Assert email to `info@anna-stays.fi` with subject indicating approval was sent. Report PASS or FAIL with exact subject found.

### 3.6 — Verify ntfy notification

Assert ntfy contains "Approved" and "Test Guest". Report PASS or FAIL with exact message text.

---

## CYCLE 4 — Admin Cancellation (of a confirmed booking)

### 4.1 — Create a new booking for cancellation test

Navigate to https://staging.anna-stays.fi. Submit a new booking request for Beautiful Private Space (3+ nights, different dates from Cycle 2). Record the reference number.

### 4.2 — Set booking to confirmed via Supabase

```sql
UPDATE bookings SET status = 'confirmed' WHERE reference_number = '{ref}' RETURNING status;
```

This is required because the admin cancel flow only works on confirmed bookings. Report the returned status.

### 4.3 — Admin cancels the booking

In the admin dashboard (stay logged in or re-authenticate), find the confirmed booking. Click "Cancel Reservation". Confirm the cancellation.

### 4.4 — Verify Supabase status = cancelled

```sql
SELECT status, cancelled_at FROM bookings WHERE reference_number = '{ref}'
```

Assert `status = 'cancelled'` and `cancelled_at` is set. Report PASS or FAIL.

### 4.5 — Verify guest cancellation email

Assert email to `udy.bar.yosef@gmail.com` with subject containing "Reservation Cancelled". Report PASS or FAIL with exact subject found.

### 4.6 — Verify host cancellation email

Assert email to `info@anna-stays.fi` with subject containing "Booking Cancelled by You". Report PASS or FAIL with exact subject found.

### 4.7 — Verify ntfy notification says "Admin cancelled"

Assert ntfy message contains "Admin cancelled booking" and the reference number. Report PASS or FAIL with exact message text. Take a screenshot named `cycle4-ntfy.png`.

---

## CYCLE 5 — Guest Cancellation

### 5.1 — Create a new booking for guest cancellation test

Submit a new booking request for Beautiful Private Space (3+ nights). Record the reference number and the booking UUID from Supabase.

### 5.2 — Set booking to confirmed via Supabase

```sql
UPDATE bookings SET status = 'confirmed' WHERE reference_number = '{ref}' RETURNING id, status;
```

Record the UUID.

### 5.3 — Guest cancels from manage-booking page

Navigate to `https://staging.anna-stays.fi/manage-booking/{uuid}?email=udy.bar.yosef@gmail.com`. Click "Cancel & Refund" (or equivalent cancel button). Confirm when prompted ("Are you absolutely sure?" → "Yes, Cancel"). The page should update inline to show "Cancelled".

Take a screenshot named `cycle5-cancel.png`.

### 5.4 — Verify Supabase status = cancelled

Assert `status = 'cancelled'` and `cancelled_at` is set. Report PASS or FAIL.

### 5.5 — Verify guest cancellation email subject

Assert email to `udy.bar.yosef@gmail.com` with subject containing "Reservation Cancelled".

> **NOTE:** The guest-facing subject is "Reservation Cancelled" for BOTH admin-initiated and guest-initiated cancellations. This is intentional product behaviour, not a bug. Do NOT fail this step if the subject says "Reservation Cancelled" rather than "Cancellation Confirmed".

Report PASS or FAIL with exact subject found.

### 5.6 — Verify host email subject says "Guest Cancelled"

Assert email to `info@anna-stays.fi` with subject containing "Guest Cancelled". This is the key differentiator from Cycle 4 (admin cancel → "Booking Cancelled by You"; guest cancel → "Guest Cancelled"). Report PASS or FAIL with exact subject found.

### 5.7 — Verify ntfy notification uses guest name

Assert ntfy message contains "Test Guest cancelled booking" (NOT "Admin cancelled booking"). Report PASS or FAIL with exact message text. Take a screenshot named `cycle5-ntfy.png`.

---

## Email Verification — Resend API

```bash
curl -s "https://api.resend.com/emails?limit=50" \
  -H "Authorization: Bearer {RESEND_API_KEY}"
```

Filter results by `created_at` after test start time. Match emails by `to` address and reference number in the subject line.

---

## Supabase SQL Reference

Use the Supabase MCP `execute_sql` tool with project ID `bdfvubwnxuzlcngzhiwy`.

```sql
-- Check booking status
SELECT id, reference_number, status, cancelled_at, created_at
FROM bookings
WHERE reference_number = '{ref}';

-- Force status for test setup
UPDATE bookings
SET status = 'confirmed'
WHERE reference_number = '{ref}'
RETURNING id, status;
```

---

## Final Report Format

After all cycles complete, produce a summary table:

```
ANNA STAYS — FULL E2E REGRESSION REPORT
Test run: {date}  Branch: staging  Duration: {time}

CYCLE 1 — Instant Booking (Cozy Studio)
  1.1 Booking submitted          PASS/FAIL  {ref}
  1.2 Supabase status confirmed  PASS/FAIL
  1.3 Guest confirmation email   PASS/FAIL  "{exact subject}"
  1.4 Host notification email    PASS/FAIL  "{exact subject}"
  1.5 ntfy notification          PASS/FAIL  "{exact message}"

CYCLE 2 — Booking Request (Beautiful Private Space)
  2.1 – 2.5  [same format]

CYCLE 3 — Admin Approval + Payment Link
  3.1 – 3.6  [same format]

CYCLE 4 — Admin Cancellation
  4.1 – 4.7  [same format]

CYCLE 5 — Guest Cancellation
  5.1 – 5.7  [same format]

TOTAL: X/28 passed

SUPABASE SNAPSHOT (all test bookings):
{table of ref, status, cancelled_at for all test bookings}

RESEND EMAILS (test window):
{list of id, to, subject, created_at for all emails after test start}
```

If any step fails, include the exact error, actual value found, and expected value in the Notes column.
