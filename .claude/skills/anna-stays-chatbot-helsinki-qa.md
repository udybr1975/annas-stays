---
name: anna-stays-chatbot-helsinki-qa
description: Run the full automated QA test for the Anna's Stays chatbot (verified and unverified guest scenarios, public vs private data, category bubbles) and the This Week in Helsinki events feature. Covers desktop and mobile viewports. Uses Playwright MCP for browser interactions and Supabase MCP for data verification.
---

# Anna Stays — Chatbot & Helsinki Events QA

## Fixed Test Values

| Variable | Value |
|---|---|
| Staging URL | https://staging.anna-stays.fi |
| Supabase project ID | bdfvubwnxuzlcngzhiwy |
| Test guest email | udy.bar.yosef@gmail.com |
| Apartment IDs (DB UUIDs) | Cozy Studio: 53747ce3-557c-46ca-b3b9-bf499146af6e |
| | Beautiful Private Space: 959da37c-ea29-4d34-b007-6fc299f5eed8 |
| | Charming Studio: 9d9330dd-ffd6-4f7e-a293-4423c0d3dde4 |

## Tools Required

- **Playwright MCP** — all browser interactions
- **Supabase MCP** — fetch real booking data, reference numbers, private details

## How the Chatbot Works — Critical Context

Read this before running any test. The chatbot has two distinct modes:

### Unverified Guest (Public Visitor)
- No booking verification has been performed
- The chatbot header shows a "Verify Stay" lock button
- Category bubbles shown: Kitchen and cooking, Policies, Internet, Check-in, Check-out, Location info, Amenities (public categories only)
- Data fetched from apartment_details table filtered to is_private = false only
- If asked for private info (address, WiFi password, door code, check-in instructions): chatbot must REFUSE and explain this is private, available only to verified guests
- If asked for public info (amenities, policies, location, pricing): chatbot answers freely

### Verified Guest (Verified Resident)
- Guest has entered email + reference number in the verify form inside the chat
- The chatbot header shows an "Unlocked" badge with green indicator
- Category bubbles shown: Checkin instructions, Wifi, House rules, Address, Directions (private categories)
- Data fetched from apartment_details with ALL rows including is_private = true
- Chatbot answers ALL questions including address, WiFi password, door codes, check-in instructions

### Apartment Selection
- On first open (no booking context), chatbot shows apartment name buttons: Beautiful Private Space, Cozy Studio, Charming Studio
- Once an apartment is selected, category bubbles appear
- On ManageBooking page, the chatbot is pre-loaded with the booking context — no apartment selection needed

---

## SETUP — Fetch Real Booking Data

Before running tests, use Supabase MCP to find a real confirmed booking and its private details.

```sql
SELECT b.id, b.reference_number, b.status, b.apartment_id,
       g.email, g.first_name
FROM bookings b
JOIN guests g ON b.guest_id = g.id
WHERE b.status IN ('confirmed', 'pending')
  AND g.email = 'udy.bar.yosef@gmail.com'
ORDER BY b.created_at DESC
LIMIT 3;
```

Record:
- BOOKING_UUID = id
- BOOKING_REF = reference_number
- BOOKING_EMAIL = udy.bar.yosef@gmail.com
- APARTMENT_ID = apartment_id (DB UUID)

Then fetch private details:

```sql
SELECT category, content, is_private
FROM apartment_details
WHERE apartment_id = '{APARTMENT_ID}'
  AND is_private = true
LIMIT 5;
```

Record 1-2 private facts (e.g. WiFi password, address).

Then fetch public details:

```sql
SELECT category, content, is_private
FROM apartment_details
WHERE apartment_id = '{APARTMENT_ID}'
  AND is_private = false
LIMIT 5;
```

Record 1-2 public facts (e.g. amenities, policies).

Announce:
"Setup complete. Booking: {BOOKING_REF} | Apartment UUID: {APARTMENT_ID}"
"Private fact to verify: {PRIVATE_FACT_CATEGORY} = {PRIVATE_FACT_VALUE}"
"Public fact to verify: {PUBLIC_FACT_CATEGORY} = {PUBLIC_FACT_VALUE}"

---

## CYCLE 1 — Unverified Guest Chatbot (Desktop)

Set viewport to 1280x800. Navigate to https://staging.anna-stays.fi

### 1.1 — Chatbot opens
Find the floating chat button bottom-right. Click it.
Take screenshot chat-01-opened.png
PASS if: chat panel opens, header shows "Anna's Assistant", header shows "Verify Stay" lock button (NOT unlocked badge), greeting message visible.
FAIL if unlocked badge shown or panel does not open.

### 1.2 — Apartment selection bubbles shown
Check suggestion area at bottom of chat.
Take screenshot chat-02-apt-select.png
PASS if apartment name buttons visible: Beautiful Private Space, Cozy Studio, Charming Studio.
FAIL if no buttons or category bubbles appear before apartment selected.

### 1.3 — Select apartment, verify public bubbles only
Click the apartment matching APARTMENT_ID. Wait up to 5 seconds.
Take screenshot chat-03-apt-selected.png
PASS if: chatbot responds mentioning apartment name, category bubbles appear, bubbles include public categories (Kitchen and cooking, Policies, Internet, Check-in, Check-out, Location info, Amenities), bubbles do NOT include Address, Wifi, or Checkin instructions.
FAIL if private category bubbles appear for unverified guest.

### 1.4 — Public question answered correctly
Type: "What amenities are available?" and send. Wait up to 15 seconds.
Take screenshot chat-04-public-answer.png
PASS if: response contains info matching PUBLIC_FACT from setup, no refusal, no markdown bold formatting (**text** is forbidden).
FAIL if response refuses a public question or shows an error.

### 1.5 — WiFi password REFUSED (CRITICAL)
Type: "What is the WiFi password?" and send. Wait up to 15 seconds.
Take screenshot chat-05-private-refused.png
PASS if: response does NOT reveal actual WiFi password, explains info is private, suggests verifying stay.
FAIL if actual WiFi password revealed to unverified guest. CRITICAL security failure.

### 1.6 — Address REFUSED (CRITICAL)
Type: "What is the address of the apartment?" and send. Wait up to 15 seconds.
Take screenshot chat-06-address-refused.png
PASS if: response does NOT reveal exact street address, explains private info for verified guests only.
FAIL if exact address revealed. CRITICAL security failure.

### 1.7 — Helsinki tip answered
Type: "Can you recommend a good coffee shop near the apartment?" and send. Wait up to 15 seconds.
Take screenshot chat-07-helsinki-tip.png
PASS if response gives a Helsinki recommendation with no error.
FAIL if empty or error shown.

---

## CYCLE 2 — Verified Guest Chatbot (Desktop)

Stay on same page and same chat instance from Cycle 1. Do not reload.

### 2.1 — Open verify form
Click the "Verify Stay" lock button in chat header.
Take screenshot chat-08-verify-form.png
PASS if form appears with email field, reference field, and Verify button.

### 2.2 — Wrong credentials rejected (CRITICAL)
Enter email "wrong@example.com" and reference "RES-WRONG123". Click Verify.
Take screenshot chat-09-wrong-creds.png
PASS if error message appears and form remains visible.
FAIL if verification succeeds with wrong credentials. CRITICAL security failure.

### 2.3 — Correct credentials accepted
Clear form. Enter BOOKING_EMAIL and BOOKING_REF. Click Verify. Wait up to 8 seconds.
Take screenshot chat-10-verified.png
PASS if: verify form disappears, header shows Unlocked/verified badge, confirmation message appears.
FAIL if lock button still shown after correct credentials.

### 2.4 — Private category bubbles now visible
Check category bubbles.
Take screenshot chat-11-private-bubbles.png
PASS if private categories visible: Checkin instructions, Wifi, House rules, Address, Directions.
FAIL if only public categories shown after verification.

### 2.5 — WiFi password revealed (CRITICAL)
Type: "What is the WiFi password?" and send. Wait up to 15 seconds.
Take screenshot chat-12-wifi-verified.png
PASS if: response contains actual WiFi password matching PRIVATE_FACT, no refusal.
FAIL if WiFi password refused for verified guest.

### 2.6 — Address revealed (CRITICAL)
Type: "What is the exact address?" and send. Wait up to 15 seconds.
Take screenshot chat-13-address-verified.png
PASS if response contains actual address matching private data from setup.
FAIL if address refused for verified guest.

### 2.7 — Conversation history maintained
Take screenshot chat-14-history.png
PASS if full conversation history from Cycles 1 and 2 is intact.
FAIL if conversation was reset after verification.

---

## CYCLE 3 — ManageBooking Page Pre-loaded Context

### 3.1 — Navigate to manage-booking
Navigate to: https://staging.anna-stays.fi/manage-booking/{BOOKING_UUID}?email={BOOKING_EMAIL}
Wait up to 8 seconds.
Take screenshot chat-15-manage-page.png
PASS if booking management page shown (not lock screen).

### 3.2 — Chat pre-loaded as verified
Click the floating chat button. Take screenshot chat-16-manage-chat-open.png
PASS if: header shows Unlocked badge immediately, no apartment selection bubbles, private category bubbles shown.
FAIL if unverified state shown or apartment selection required.

### 3.3 — Private info available immediately
Type: "What is the check-in procedure?" and send. Wait up to 15 seconds.
Take screenshot chat-17-manage-checkin.png
PASS if response contains check-in information from private data.
FAIL if check-in info refused.

---

## CYCLE 4 — This Week in Helsinki

Set viewport to 1280x800. Navigate to https://staging.anna-stays.fi

### 4.1 — Button visible
Scroll to Helsinki Guide section. Find "This week in Helsinki →" button.
Take screenshot helsinki-01-button.png
PASS if visible. FAIL if not found.

### 4.2 — Modal opens
Click the button. Wait up to 5 seconds.
Take screenshot helsinki-02-modal.png
PASS if modal appears with heading "This week in the city".

### 4.3 — Loading state
Check immediately after click for spinner and "Anna is curating your weekly guide..." text.
PASS if loading state visible OR events already showing.
FAIL if error state appears immediately with no loading first.

### 4.4 — Final state is valid
Wait up to 30 seconds. Take screenshot helsinki-03-final.png

OUTCOME A (success): Events list shown with titles, venues, dates.
PASS: "Events loaded — X events shown"

OUTCOME B (graceful fallback): Globe emoji, heading "Back soon".
PASS: "Graceful fallback shown — expected if Google Cloud project pending"

FAIL ONLY if: red error screen, blank modal, raw JS error visible, spinner after 30s.

### 4.5 — Event data quality (Outcome A only, skip if B)
PASS if each event has: title, venue, date, description.
FAIL if events missing required fields.

### 4.6 — Modal closes
Click X. Take screenshot helsinki-04-closed.png
PASS if modal disappears. FAIL if cannot be closed.

### 4.7 — Mobile Helsinki tab
Set viewport to 390x844. Navigate to https://staging.anna-stays.fi
Tap "Helsinki" tab in bottom tab bar.
Take screenshot helsinki-05-mobile-tab.png
PASS if Helsinki guide content visible with "This Week in Helsinki" button.

---

## CYCLE 5 — Mobile Chatbot

Viewport: 390x844

### 5.1 — Chat tab opens chatbot
Tap "Chat" tab. Wait up to 3 seconds.
Take screenshot chat-18-mobile-open.png
PASS if full-screen chat interface appears.

### 5.2 — Apartment selection works
Tap Cozy Studio. Wait up to 5 seconds.
Take screenshot chat-19-mobile-apt.png
PASS if chatbot responds mentioning Cozy Studio and category bubbles appear.

### 5.3 — Public question answered
Type: "What are the check-out rules?" and send. Wait up to 15 seconds.
Take screenshot chat-20-mobile-answer.png
PASS if relevant check-out response appears.

### 5.4 — Private question refused (CRITICAL)
Type: "What is the WiFi password?" and send. Wait up to 15 seconds.
Take screenshot chat-21-mobile-private-refused.png
PASS if response refuses WiFi password and suggests verifying.
FAIL if WiFi password revealed. CRITICAL security failure.

---

## Final Report Format
ANNA STAYS — CHATBOT & HELSINKI EVENTS QA REPORT
Test run: {date and time UTC}
Branch: staging
Booking used: {BOOKING_REF} | {APARTMENT_NAME}
Private fact tested: {PRIVATE_FACT_CATEGORY}
Public fact tested: {PUBLIC_FACT_CATEGORY}
CYCLE 1 — UNVERIFIED GUEST (Desktop 1280x800)
1.1 Chat panel opens                          PASS/FAIL
1.2 Apartment selection bubbles shown         PASS/FAIL
1.3 Public bubbles only after apt select      PASS/FAIL  "{bubble names}"
1.4 Public question answered                  PASS/FAIL  "{first 60 chars}"
1.5 WiFi REFUSED unverified                   PASS/FAIL  [CRITICAL]
1.6 Address REFUSED unverified                PASS/FAIL  [CRITICAL]
1.7 Helsinki tip answered                     PASS/FAIL
CYCLE 2 — VERIFIED GUEST (Desktop)
2.1 Verify form opens                         PASS/FAIL
2.2 Wrong credentials rejected                PASS/FAIL  [CRITICAL]
2.3 Correct credentials accepted              PASS/FAIL
2.4 Private bubbles after verify              PASS/FAIL  "{bubble names}"
2.5 WiFi revealed verified                    PASS/FAIL  [CRITICAL]
2.6 Address revealed verified                 PASS/FAIL  [CRITICAL]
2.7 History maintained                        PASS/FAIL
CYCLE 3 — MANAGE-BOOKING PRE-LOADED
3.1 Page loads past gate                      PASS/FAIL
3.2 Chat pre-loaded verified                  PASS/FAIL
3.3 Private check-in available                PASS/FAIL
CYCLE 4 — THIS WEEK IN HELSINKI
4.1 Button visible                            PASS/FAIL
4.2 Modal opens                               PASS/FAIL
4.3 Loading state shown                       PASS/FAIL
4.4 Final state valid                         PASS/FAIL  "Outcome A/B"
4.5 Event data quality                        PASS/FAIL/SKIP
4.6 Modal closes                              PASS/FAIL
4.7 Mobile Helsinki tab                       PASS/FAIL
CYCLE 5 — MOBILE (390x844)
5.1 Chat tab opens                            PASS/FAIL
5.2 Apartment selection works                 PASS/FAIL
5.3 Public question answered                  PASS/FAIL
5.4 WiFi REFUSED mobile unverified            PASS/FAIL  [CRITICAL]
TOTAL: X/24 passed
CRITICAL FAILURES: X (1.5, 1.6, 2.2, 2.5, 2.6, 5.4)
NOTES:

CRITICAL: private data must never leak to unverified guests
If 4.4 Outcome B: check GEMINI_API_KEY in Vercel env vars
List failures with exact response text and screenshot name
