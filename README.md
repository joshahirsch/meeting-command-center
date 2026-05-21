# Meeting Ops Automation

Google Apps Script automation that ingests **Gemini Meeting Notes** from a shared **Google Drive folder** (recommended) or **Gmail** (fallback), extracts meeting content, processes it with the **OpenAI Responses API** (structured JSON), and writes operational outputs to a **master Google Sheet** and **summary Google Docs**.

Built for local development in Cursor with **TypeScript**, **clasp**, and **esbuild**, then deployed to Apps Script (V8).

## What it does

**Drive mode (recommended)**

1. Lists unprocessed Google Docs in `SOURCE_FOLDER_ID` whose names include `Notes by Gemini`
2. Reads note text via `DocumentApp` (does not modify source files)
3. Optionally links matching `Recording` files in the same folder (URL only; no video processing in v1)
4. Calls OpenAI with structured JSON output
5. Appends rows to **Meeting Action Master** (Action Items, Meetings, Processing Log)
6. Creates a summary Google Doc in your output folder
7. Dedupes by **Source File ID** in the Meetings tab (no Gmail labels)

**Gmail mode (fallback)**

1. Finds unprocessed emails: `label:"Gemini Meeting Notes"` from `gemini-notes@google.com` with subject `Notes:…`
2. Extracts notes from linked Google Docs (fallback: email body)
3. Same OpenAI → Sheet → summary Doc pipeline
4. Labels the thread **Meeting Ops Processed** (or **Meeting Ops Error** on failure)

## Architecture

```text
Drive folder (Gemini notes + recordings) ──┐
                                         ├── Apps Script → OpenAI → Sheet + summary Docs
Gmail (Gemini notes, fallback) ──────────┘
```

- **Runtime:** Google Apps Script V8  
- **Local:** TypeScript → esbuild bundle → `dist/Code.js` → `clasp push`  
- **Config:** Apps Script Script Properties (no secrets in source)  
- **Tests:** Vitest for extract, schema, and Drive file-name parsing helpers  

## Regulated data (important)

Meeting notes may contain **PHI/PII**. This project does **not** log full transcripts, but it **does** send note content to OpenAI when processing runs.

**Only enable this if your organization has approved the data path**, including any required agreements (e.g., BAA) and subprocessor review. See [docs/security-notes.md](docs/security-notes.md).

**Source folder safety:** The automation never moves, renames, deletes, or edits files in `SOURCE_FOLDER_ID`.

## Prerequisites

- Node.js 18+
- [clasp](https://github.com/google/clasp) (included as dev dependency)
- Google Apps Script project
- clasp logged in with the correct Google Workspace account
- Master Google Sheet (**Meeting Action Master**)
- **Gemini Meet notes folder** in Drive (shared folder where Meet saves notes/recordings)
- **Output Drive folder** for generated summary docs
- OpenAI API key with Responses API access
- Gmail labels (Gmail mode only): **Gemini Meeting Notes**, **Meeting Ops Processed** (optional pre-create)

## Install

```bash
npm install
cp .clasp.example.json .clasp.json
# Edit .clasp.json — set scriptId to your Apps Script project ID
npm run build
npm run push
```

## Script properties

Set in Apps Script: **Project Settings → Script properties**

| Property | Required | Default |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | — |
| `ACTION_SHEET_ID` | Yes | — |
| `OUTPUT_FOLDER_ID` | Yes | — |
| `SOURCE_MODE` | No | `drive` if `SOURCE_FOLDER_ID` is set, else `gmail` |
| `SOURCE_FOLDER_ID` | Yes (Drive mode) | — |
| `DRIVE_LOOKBACK_DAYS` | No | `14` |
| `MAX_FILES_PER_RUN` | No | `3` |
| `PROCESS_RECORDINGS` | No | `false` (v1: no video processing) |
| `INCLUDE_RECORDING_LINK` | No | `true` |
| `OPENAI_MODEL` | No | `gpt-4.1-mini` |
| `TARGET_LABEL_NAME` | No | `Gemini Meeting Notes` |
| `PROCESSED_LABEL_NAME` | No | `Meeting Ops Processed` |
| `ERROR_LABEL_NAME` | No | `Meeting Ops Error` |
| `MAX_THREADS_PER_RUN` | No | `3` |
| `LOOKBACK_DAYS` | No | `14` |
| `NOTIFICATION_EMAIL` | No | `josh@nivahealth.com` |
| `FORCE_PROCESS_TEST_MODE` | No | `false` |
| `CREATE_TARGET_LABEL_IF_MISSING` | No | `false` |

Example Drive setup:

```text
SOURCE_MODE=drive
SOURCE_FOLDER_ID=1OU99p91VvHrSEuX9TTINmYHXlweojaNh
```

Detailed setup: [docs/setup.md](docs/setup.md)

## Apps Script functions (run manually first)

| Function | Purpose |
|----------|---------|
| `setupMeetingOpsSheets` | Create sheet tabs; append missing headers safely |
| `showConfigStatus` | Log which config keys exist (secrets hidden) |
| `dryRunLatestDriveMeetingNote` | Drive: extract + OpenAI preview; **no** sheet writes |
| `processOneDriveFileById(fileId)` | Drive: full process one Gemini notes doc |
| `runMeetingOps` | Production batch (Drive or Gmail per `SOURCE_MODE`) |
| `runDriveMeetingOps` | Drive-only batch |
| `dryRunLatestMeetingNote` | Dispatches to Drive or Gmail dry run |
| `processOneThreadById(threadId)` | Gmail: full process one thread |
| `installMeetingOpsTrigger` | Time-driven trigger every 15 minutes |
| `removeMeetingOpsTriggers` | Disable scheduled runs |

## Safe first test (Drive — recommended)

1. Complete [docs/setup.md](docs/setup.md) (properties, `npm run push`, authorize scopes).
2. Set `SOURCE_MODE=drive` and `SOURCE_FOLDER_ID` to your Gemini Meet folder.
3. Run `setupMeetingOpsSheets`.
4. Run `showConfigStatus` — confirm required keys.
5. Run `dryRunLatestDriveMeetingNote`.
6. In **Executions** logs, confirm title, date, source file URL, recording URL (if any), char count, action item count, and first two action titles only. **No** full transcript.
7. Run `processOneDriveFileById('notes-doc-file-id')` for one file.
8. Run `installMeetingOpsTrigger`.

Gmail fallback: see [docs/manual-test-plan.md](docs/manual-test-plan.md) (`dryRunLatestMeetingNote`, `processOneThreadById`).

## npm scripts

| Script | Command |
|--------|---------|
| Build | `npm run build` |
| Push to Apps Script | `npm run push` |
| Deploy (clasp) | `npm run deploy` |
| Tests | `npm run test` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` (alias of typecheck) |

## Project layout

```text
src/           TypeScript source (drive.ts, driveParse.ts, gmail, sheets, …)
dist/          Build output (clasp rootDir)
tests/         Vitest unit tests
docs/          Setup, security, schema, test plan
```

## Troubleshooting

| Issue | Check |
|-------|--------|
| No Drive candidates | `SOURCE_FOLDER_ID`, `DRIVE_LOOKBACK_DAYS`, file name includes `Notes by Gemini`, already in Meetings tab |
| No Gmail candidates | Label, lookback days, already processed, subject `Notes:` |
| OpenAI 401/403 | `OPENAI_API_KEY`, model name, API access |
| Doc empty | Doc type is Google Doc; script account can open the file |
| Duplicate rows | Drive: same Source File ID; Gmail: same Source Gmail Message ID |
| Trigger not firing | `installMeetingOpsTrigger`, quotas, authorization |

## Documentation

- [docs/setup.md](docs/setup.md)
- [docs/security-notes.md](docs/security-notes.md)
- [docs/sheet-schema.md](docs/sheet-schema.md)
- [docs/manual-test-plan.md](docs/manual-test-plan.md)

## License

Private / internal use — configure sharing and compliance for your organization.
