---
name: anna-stays-cancellation-qa
description: Run the 15-scenario cancellation regression test for Anna's Stays on staging. Verifies that admin-initiated and guest-initiated cancellations produce the correct and distinct email subjects and ntfy messages. Two scenarios: Scenario A (admin cancels confirmed booking) and Scenario B (guest cancels from manage-booking page).
---

# Anna Stays — Cancellation Regression Test

## Purpose

Verify that the "differentiate admin vs guest cancellation messaging" feature is working correctly. The key assertions are:

| | Admin Cancel | Guest Cancel |
|---|---|---|
| Guest email subject | "Reservation Cancelled" | "Reservation Cancelled" |
| Host email subject | "Booking Cancelled by You" | "Guest Cancelled" |
| ntfy message | "Admin cancelled booking" | "{GuestName} cancelled booking" |

> **IMPORTANT:** The guest-facing email subject is intentionally identical ("Reservation Cancelled") for both admin-initiated and guest-initiated cancellations. Do NOT fail any step for this reason. The differentiation is in the HOST email and the ntfy message only.

## Fixed Test Values

| Variable | Value |
|---|---|
| Staging URL | https://staging.anna-stays.fi |
| Guest email | udy.bar.yosef@gmail.com |
| Guest name | Test Guest |
| Supabase project ID | bdfvubwnxuzlcngzhiwy |
| Test apartment | Beautiful Private Space (min 3 nights) |
| ntfy channel | https://ntfy.sh/annas-stays-helsinki-99 |

## Tools Required

- **Playwright MCP** — browser automation on staging
- **Supabase MCP** — SQL queries via `execute_sql` with project ID `bdfvubwnxuzlcngzhiwy`
- **Resend API** — `GET https://api.resend.com/emails?limit=50` with `Authorization: Bearer {RESEND_API_KEY}`
- **ntfy.sh** — Playwright navigation to https://ntfy.sh/annas-stays-helsinki-99

## Before Starting

1. Read `RESEND_API_KEY` from the `.env` file in the project root.
2. Record test start time in UTC (ISO 8601). All email and ntfy checks only consider items after this timestamp.
3. Announce: "Test start time: {ISO timestamp}. RESEND_API_KEY loaded. Beginning Scenario A."

---

## SCENARIO A — Admin Cancellation

### A.1 — Create a booking

Navigate to https://staging.anna-stays.fi. Click the Beautiful Private Space card. Select check-in and check-out dates (minimum 3 nights — check the calendar to avoid conflicts; most of July may be blocked by Airbnb iCal sync, use August or another open month).

**Required date selection technique:** Use `browser_evaluate` with:
```javascript
function realClick(dayText) {
  const dateCells = Array.from(document.querySelectorAll('div')).filter(el =>
    el.className.includes('relative') && el.className.includes('text-center') && el.className.includes('py-2')
  );
  const cell = dateCells.find(el => el.textContent.trim() === dayText);
  if (!cell) return 'not found: ' + dayText;
  const rect = cell.getBoundingClientRect();
  cell.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  }));
  return 'clicked ' + dayText;
}
realClick('8'); // check-in day
setTimeout(() => realClick('11'), 600); // check-out day, 600ms later
```

Fill in guest name "Test Guest" and email "udy.bar.yosef@gmail.com". Submit the booking.

Record the reference number (e.g. RES-XXXXXXXX).

### A.2 — Verify Supabase status = pending

```sql
SELECT id, reference_number, status, created_at
FROM bookings
WHERE reference_number = '{ref_A}';
```

Assert `status = 'pending'`. Report PASS or FAIL.

### A.3 — Force status to confirmed via Supabase

Admin cancellation only works on confirmed bookings. Set the status directly:

```sql
UPDATE bookings
SET status = 'confirmed'
WHERE reference_number = '{ref_A}'
RETURNING id, status;
```

Assert returned `status = 'confirmed'`. Report PASS or FAIL.

### A.4 — Admin login and cancel

Navigate to https://staging.anna-stays.fi/admin. Enter the admin email and request an OTP.

**PAUSE HERE.** Ask the user: "Please enter the 6-digit OTP code sent to the admin email."

Wait for the user to provide the code, then enter it to complete login.

In the admin dashboard, locate the booking for ref_A. Click "Cancel Reservation". Confirm when prompted.

Take a screenshot named `A4-admin-cancel.png`.

### A.5 — Verify Supabase status = cancelled

```sql
SELECT status, cancelled_at
FROM bookings
WHERE reference_number = '{ref_A}';
```

Assert `status = 'cancelled'` and `cancelled_at` is not null. Report PASS or FAIL with exact values.

### A.6 — Verify guest email subject

Query Resend API:
```bash
curl -s "https://api.resend.com/emails?limit=50" \
  -H "Authorization: Bearer {RESEND_API_KEY}"
```

Find email to `udy.bar.yosef@gmail.com` after test start time containing ref_A in the subject.

Assert subject contains "Reservation Cancelled". Report PASS or FAIL with exact subject line.

### A.7 — Verify host email subject says "Booking Cancelled by You"

Find email to `info@anna-stays.fi` after test start time containing ref_A.

Assert subject contains "Booking Cancelled by You". Report PASS or FAIL with exact subject line.

### A.8 — Verify ntfy says "Admin cancelled booking"

Navigate to https://ntfy.sh/annas-stays-helsinki-99. Find the most recent notification after test start time.

Assert the message body contains "Admin cancelled booking" and the reference number. Do NOT accept "Test Guest cancelled booking" — that would mean the wrong path ran.

Take a screenshot named `A8-ntfy.png`.

Report PASS or FAIL with exact message text.

---

## SCENARIO B — Guest Cancellation

### B.1 — Create a new booking

Navigate to https://staging.anna-stays.fi. Submit a new booking for Beautiful Private Space (3+ nights, different dates from Scenario A). Record the reference number (ref_B) and the booking UUID.

### B.2 — Verify Supabase status = pending

```sql
SELECT id, reference_number, status
FROM bookings
WHERE reference_number = '{ref_B}';
```

Assert `status = 'pending'`. Record the UUID (`id` column). Report PASS or FAIL.

### B.3 — Force status to confirmed via Supabase

```sql
UPDATE bookings
SET status = 'confirmed'
WHERE reference_number = '{ref_B}'
RETURNING id, status;
```

Assert returned `status = 'confirmed'`. Report PASS or FAIL.

### B.4 — Guest cancels from manage-booking page

Navigate to:
```
https://staging.anna-stays.fi/manage-booking/{uuid}?email=udy.bar.yosef@gmail.com
```

The page should show booking details with a cancel option. Click "Cancel & Refund" (or the equivalent cancel button). When the confirmation prompt appears ("Are you absolutely sure?" / "Yes, Cancel"), confirm.

The page should update inline to show "Cancelled" status with the cancellation date.

Take a screenshot named `B4-guest-cancel.png`.

### B.5 — Verify Supabase status = cancelled

```sql
SELECT status, cancelled_at
FROM bookings
WHERE reference_number = '{ref_B}';
```

Assert `status = 'cancelled'` and `cancelled_at` is not null. Report PASS or FAIL with exact values.

### B.6 — Verify guest email subject

Find email to `udy.bar.yosef@gmail.com` after test start time containing ref_B.

Assert subject contains "Reservation Cancelled".

> **NOTE:** This is intentionally the same subject as the admin-cancel guest email. The product does not send a different subject to the guest based on who initiated the cancellation. "Reservation Cancelled" here is CORRECT and expected — do NOT fail this step.

Report PASS or FAIL with exact subject line.

### B.7 — Verify host email subject says "Guest Cancelled"

Find email to `info@anna-stays.fi` after test start time containing ref_B.

Assert subject contains "Guest Cancelled". This is the critical differentiator from Scenario A (which produces "Booking Cancelled by You"). Report PASS or FAIL with exact subject line.

### B.8 — Verify ntfy uses guest name

Navigate to https://ntfy.sh/annas-stays-helsinki-99 (reload or navigate fresh). Find the most recent notification after test start time for ref_B.

Assert the message body contains "Test Guest cancelled booking" (NOT "Admin cancelled booking"). The guest name must appear in the message.

Take a screenshot named `B8-ntfy.png`.

Report PASS or FAIL with exact message text.

---

## Final Report Format

```
ANNA STAYS — CANCELLATION REGRESSION REPORT
Test run: {date}  Branch: staging

SCENARIO A — Admin Cancellation ({ref_A})
  A.1  Booking created (pending)              PASS/FAIL
  A.2  Supabase status = pending              PASS/FAIL
  A.3  Status forced to confirmed             PASS/FAIL
  A.4  Admin cancelled via dashboard          PASS/FAIL
  A.5  Supabase status = cancelled            PASS/FAIL  cancelled_at: {value}
  A.6  Guest email "Reservation Cancelled"    PASS/FAIL  "{exact subject}"
  A.7  Host email "Booking Cancelled by You"  PASS/FAIL  "{exact subject}"
  A.8  ntfy "Admin cancelled booking"         PASS/FAIL  "{exact message}"

SCENARIO B — Guest Cancellation ({ref_B})
  B.1  Booking created (pending)              PASS/FAIL
  B.2  Supabase status = pending              PASS/FAIL
  B.3  Status forced to confirmed             PASS/FAIL
  B.4  Guest cancelled via manage-booking     PASS/FAIL
  B.5  Supabase status = cancelled            PASS/FAIL  cancelled_at: {value}
  B.6  Guest email "Reservation Cancelled"    PASS/FAIL  "{exact subject}"
  B.7  Host email "Guest Cancelled"           PASS/FAIL  "{exact subject}"
  B.8  ntfy "Test Guest cancelled booking"    PASS/FAIL  "{exact message}"

TOTAL: X/16 passed

KEY DIFFERENTIATORS SUMMARY:
  Host email:  A="Booking Cancelled by You"  B="Guest Cancelled"   [{PASS/FAIL}]
  ntfy:        A="Admin cancelled booking"   B="Test Guest cancel"  [{PASS/FAIL}]
  Guest email: A="Reservation Cancelled"     B="Reservation Cancelled" [expected same — intentional]
```

If any step fails, include the actual value found and the expected value.
