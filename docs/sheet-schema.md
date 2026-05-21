# Meeting Action Master — Sheet Schema

Spreadsheet name (recommended): **Meeting Action Master**

Script property: `ACTION_SHEET_ID` = spreadsheet ID from the URL.

## Tab: Action Items

One row per action item.

| Column | Description |
|--------|-------------|
| Created At | When the row was written |
| Meeting Date | Parsed or model-inferred date |
| Meeting Title | Meeting title |
| Source Email Subject | Original Gmail subject |
| Source Email Date | Email received date |
| Source Gmail Thread ID | Dedup key (with message) |
| Source Gmail Message ID | Primary dedup key |
| Source Notes Link | Linked Google Doc URL if found |
| Summary Doc Link | Generated summary Doc URL |
| Owner | Action owner if known |
| Action Item | Action text |
| Due Date | YYYY-MM-DD or empty |
| Priority | High / Medium / Low (validated) |
| Project | Project tag |
| Status | New / In Progress / Waiting / Done / Deferred (validated) |
| Follow-Up Needed | TRUE/FALSE |
| Follow-Up Draft | Draft follow-up text |
| Cursor Prompt | Suggested Cursor prompt |
| Confidence | High / Medium / Low |
| Notes | Extra notes |
| Source Type | e.g. Drive Gemini Notes / Gmail Gemini Notes |
| Source File ID | Drive notes doc ID (Drive dedup key) |
| Source File URL | Link to source Gemini notes doc |
| Recording File URL | Matched recording in source folder (if any) |

## Tab: Meetings

One row per processed meeting email.

| Column | Description |
|--------|-------------|
| Processed At | Timestamp |
| Meeting Date | |
| Meeting Title | |
| Source Email Subject | |
| Source Gmail Thread ID | |
| Source Gmail Message ID | Dedup: skip if already present |
| Source Notes Link | |
| Summary Doc Link | |
| Executive Summary | |
| Decisions | Newline-separated |
| Open Questions | Newline-separated |
| Follow-Up Draft | |
| Cursor Prompt | |
| Action Item Count | |
| Processing Status | e.g. Success |
| Model | OpenAI model used |
| Token Estimate | Rough char/4 estimate |
| Error | Empty on success |
| Source Type | Drive or Gmail |
| Source File ID | Drive notes doc ID; **dedup key for Drive** |
| Source File Name | Original Drive file name |
| Source File URL | Link to source notes doc |
| Recording File URL | Matched recording URL (if any) |

## Tab: Processing Log

Audit trail for runs and errors.

| Column | Description |
|--------|-------------|
| Timestamp | |
| Level | INFO / WARN / ERROR |
| Event | e.g. run_started, extraction_succeeded |
| Gmail Thread ID | |
| Gmail Message ID | |
| Meeting Title | |
| Detail | Short message (no full transcript) |

## Setup

Run `setupMeetingOpsSheets()` to create missing tabs, headers, frozen row, validation rules, and column sizing.
