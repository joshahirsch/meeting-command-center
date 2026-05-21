# Manual Test Plan

## Pre-flight

- [ ] Script properties set (`showConfigStatus` shows required keys present)
- [ ] `setupMeetingOpsSheets` run successfully
- [ ] At least one Gmail thread with label **Gemini Meeting Notes**, from `gemini-notes@google.com`, subject starting with `Notes:`, without **Meeting Ops Processed**

## Test 1 — Config

1. Run `showConfigStatus`.
2. Confirm `OPENAI_API_KEY`, `ACTION_SHEET_ID`, `OUTPUT_FOLDER_ID` are present.
3. Confirm API key is shown as `(set, hidden)`.

## Test 2 — Dry run

1. Run `dryRunLatestMeetingNote`.
2. In execution log, verify:
   - meeting title present
   - meeting date (if parseable)
   - char count > 0
   - action item count
   - up to 2 action titles only
3. Confirm **no** new rows in Action Items / Meetings.
4. Confirm processed label **not** applied.

## Test 3 — Single thread

1. Copy `threadId` from Gmail URL for a test email.
2. Run `processOneThreadById('THREAD_ID')`.
3. Verify:
   - One **Meetings** row
   - N **Action Items** rows (N may be 0)
   - **Processing Log** entries through `processed_label_applied`
   - Summary Doc in output folder
   - Thread has **Meeting Ops Processed**

## Test 4 — Dedup

1. Run `processOneThreadById` again on same thread (without `FORCE_PROCESS_TEST_MODE`).
2. Expect skip / label backfill only — no duplicate Meetings rows.

## Test 5 — Scheduled run

1. Run `installMeetingOpsTrigger`.
2. Confirm one trigger for `runMeetingOps` (15 min).
3. Run `runMeetingOps` manually once.
4. Run `removeMeetingOpsTriggers` when done testing.

## Test 6 — Error path (optional)

1. Temporarily set invalid `OPENAI_API_KEY`.
2. Run `processOneThreadById` on a new unprocessed thread.
3. Expect **Meeting Ops Error** label and ERROR log row.
4. Restore API key.

## Regulated data check

- [ ] Compliance approval documented before processing real clinical meetings
- [ ] Test with non-PHI sample meeting first
