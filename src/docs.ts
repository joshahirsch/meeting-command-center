import type { ExtractedContent, MeetingOpsConfig, ProcessedMeetingResult } from "./types";

function formatDateForTitle(date: string | null): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  try {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

function sourceTypeDisplay(extracted: ExtractedContent): string {
  return extracted.sourceType === "drive_gemini_notes_doc"
    ? "Drive Gemini Notes"
    : "Gmail Gemini Notes";
}

function addHeading(body: GoogleAppsScript.Document.Body, text: string): void {
  const p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
}

function addBulletList(body: GoogleAppsScript.Document.Body, items: string[]): void {
  if (items.length === 0) {
    body.appendParagraph("(none)");
    return;
  }
  for (const item of items) {
    body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.BULLET);
  }
}

export function createMeetingSummaryDoc(
  config: MeetingOpsConfig,
  extracted: ExtractedContent,
  ai: ProcessedMeetingResult,
  model: string,
  tokenEstimate: number | null
): string {
  const meeting = ai.meeting;
  const titleDate = formatDateForTitle(meeting.date ?? extracted.meetingDate);
  const docTitle = `Meeting Ops - ${meeting.title || extracted.meetingTitle} - ${titleDate}`;

  const folder = DriveApp.getFolderById(config.outputFolderId);
  const doc = DocumentApp.create(docTitle);
  const file = DriveApp.getFileById(doc.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const body = doc.getBody();
  body.clear();

  body.appendParagraph(docTitle).setHeading(DocumentApp.ParagraphHeading.HEADING1);

  addHeading(body, "Meeting metadata");
  body.appendParagraph(`Title: ${meeting.title || extracted.meetingTitle}`);
  body.appendParagraph(`Date: ${meeting.date ?? extracted.meetingDate ?? "unknown"}`);
  body.appendParagraph(`Source type: ${sourceTypeDisplay(extracted)}`);
  if (extracted.sourceType === "gmail") {
    body.appendParagraph(`Email subject: ${extracted.emailSubject}`);
  } else {
    body.appendParagraph(`Source file: ${extracted.sourceFileName ?? extracted.emailSubject}`);
    if (extracted.meetingDateTimeText) {
      body.appendParagraph(`Meeting time: ${extracted.meetingDateTimeText}`);
    }
  }
  body.appendParagraph(`Processed at: ${new Date().toISOString()}`);
  body.appendParagraph(`Confidence: ${meeting.confidence}`);

  addHeading(body, "Executive summary");
  body.appendParagraph(meeting.executive_summary || "(none)");

  addHeading(body, "Action items");
  if (ai.action_items.length === 0) {
    body.appendParagraph("(no action items identified)");
  } else {
    const tableData = [
      ["Owner", "Action", "Due", "Priority", "Status", "Confidence"],
      ...ai.action_items.map((a) => [
        a.owner ?? "",
        a.action,
        a.due_date ?? "",
        a.priority,
        a.status,
        a.confidence,
      ]),
    ];
    body.appendTable(tableData);
  }

  addHeading(body, "Decisions made");
  addBulletList(body, meeting.decisions);

  addHeading(body, "Open questions");
  addBulletList(body, meeting.open_questions);

  addHeading(body, "Follow-up draft");
  body.appendParagraph(meeting.follow_up_draft || "(none)");

  addHeading(body, "Cursor prompt");
  body.appendParagraph(meeting.cursor_prompt || "(none)");

  addHeading(body, "Source links");
  if (extracted.sourceType === "gmail") {
    body.appendParagraph(`Gmail thread: ${extracted.threadId ?? "n/a"}`);
    body.appendParagraph(`Gmail message: ${extracted.messageId ?? "n/a"}`);
  }
  const notesLink = extracted.sourceFileUrl ?? extracted.sourceNotesLink;
  if (notesLink) {
    body.appendParagraph(`Source notes link: ${notesLink}`);
  }
  if (extracted.recordingFileUrl) {
    body.appendParagraph(`Recording link: ${extracted.recordingFileUrl}`);
  }

  addHeading(body, "Processing metadata");
  body.appendParagraph(`Model: ${model}`);
  body.appendParagraph(`Token estimate: ${tokenEstimate ?? "n/a"}`);
  body.appendParagraph(`Action items: ${ai.action_items.length}`);
  if (extracted.sourceFileId) {
    body.appendParagraph(`Source file ID: ${extracted.sourceFileId}`);
  }

  doc.saveAndClose();
  return doc.getUrl();
}
