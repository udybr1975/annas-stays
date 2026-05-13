---
name: anna-stays-master-qa
description: Run the complete Anna's Stays QA suite — all three skill files in sequence. Covers the full booking regression (28 steps), cancellation flows, chatbot verified/unverified scenarios, and Helsinki events. Run this for a full regression before any production merge.
---

# Anna Stays — Master QA Suite

Run all three QA skills in this exact order. Do not skip any. Do not merge to main until all pass.

---

## Order of Execution

### PART 1 — Chatbot & Helsinki Events
Read and execute: .claude/skills/anna-stays-chatbot-helsinki-qa.md
Complete all 5 cycles (24 steps). Produce the Chatbot & Helsinki Events report.
Do not proceed to Part 2 until Part 1 is finished.

### PART 2 — Cancellation Flows
Read and execute: .claude/skills/anna-stays-cancellation-qa.md
Complete all cycles. Produce the Cancellation report.
Do not proceed to Part 3 until Part 2 is finished.

### PART 3 — Full Booking Regression
Read and execute: .claude/skills/anna-stays-full-qa.md
Complete all 5 cycles (28 steps). Produce the Full Regression report.

---

## Master Summary Report

After all three parts complete, produce this combined report:
ANNA STAYS — MASTER QA SUITE REPORT
Test run: {date and time UTC}
Branch: staging
Total duration: {time}
PART 1 — CHATBOT & HELSINKI EVENTS
Result: X/24 passed
Critical failures: {list or "none"}
Helsinki events: Outcome A (events loaded) / Outcome B (fallback)
PART 2 — CANCELLATION FLOWS
Result: X/Y passed
Critical failures: {list or "none"}
PART 3 — FULL BOOKING REGRESSION
Result: X/28 passed
Critical failures: {list or "none"}
OVERALL: X/total passed
PRODUCTION MERGE RECOMMENDATION:
APPROVED — all tests passed, safe to merge staging → main
OR
BLOCKED — list of failures that must be fixed before merging

---

## Notes
- Always run on staging, never on production
- CRITICAL failures in the chatbot (data leaking to unverified guests) must block the merge regardless of other results
- If Helsinki events shows Outcome B (graceful fallback), this is NOT a blocker — it means the Gemini API key needs attention but booking flows are unaffected
- Resend API key and Supabase access must be available before starting
