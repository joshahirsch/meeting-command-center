# Security & Privacy Notes

## Data path

1. **Gmail** — Gemini Meeting Notes emails (labeled) are read by this Apps Script project.
2. **Google Docs** — If the email links to an accessible Doc, notes may be read via `DocumentApp`.
3. **OpenAI** — Meeting transcript/notes text is sent to the OpenAI Responses API for structured extraction.
4. **Google Sheets** — Action items, meeting metadata, and processing logs are appended to your master sheet.
5. **Google Docs** — A per-meeting summary document is created in your configured Drive folder.

## PHI / PII risk

Meeting notes may contain **protected health information (PHI)**, personally identifiable information (PII), or other sensitive operational content. This automation:

- Does **not** log full transcript text to Apps Script logs.
- Still **transmits** note content to OpenAI when processing runs.

**Only use this automation if your organization has approved:**

- Sending this class of data to OpenAI (or your configured model provider),
- The relevant legal/compliance agreements (e.g., BAA where applicable),
- Storage locations for outputs (Sheet + summary Docs + Gmail labels).

## Approval reminder

> **Do not process regulated patient data through external APIs unless your compliance team has explicitly approved the data path, retention, and subprocessors.**

## Secrets

- Store `OPENAI_API_KEY` in **Script properties** only.
- Never commit `.clasp.json`, `.env`, or API keys to git.
- Rotate keys if exposed.

## Disabling automation

1. Run `removeMeetingOpsTriggers()` in Apps Script.
2. Remove or invalidate `OPENAI_API_KEY` in script properties.
3. Optionally remove the **Gemini Meeting Notes** filter/trigger from Gmail (manual).

## Where outputs live

| Output | Location | Access control |
|--------|----------|----------------|
| Action items | Sheet tab **Action Items** | Sheet sharing settings |
| Meeting rows | Sheet tab **Meetings** | Sheet sharing settings |
| Logs | Sheet tab **Processing Log** | Sheet sharing settings |
| Summaries | Drive folder `OUTPUT_FOLDER_ID` | Folder sharing settings |
| Processed marker | Gmail label **Meeting Ops Processed** | Mailbox owner |

Who can read outputs depends entirely on **Google Workspace sharing** for the Sheet, folder, and mailbox—not on this script.

## Logging

Processing logs include event names, thread/message IDs, meeting titles, and short error details—not full transcripts.

## Error label

Failed threads receive **Meeting Ops Error** so they can be reviewed without being marked processed.
