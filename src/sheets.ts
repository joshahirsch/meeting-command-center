import { SYNC_COLUMN_HEADERS } from "./actionItemSyncColumns";
import { logInfo } from "./logger";

import type {

  ActionItemOutput,

  ExtractedContent,

  LogLevel,

  MeetingOpsConfig,

  MeetingOutput,

  ProcessedMeetingResult,

  SheetTab,

  SourceType,

} from "./types";



export const TAB_ACTION_ITEMS = "Action Items";

export const TAB_MEETINGS = "Meetings";

export const TAB_PROCESSING_LOG = "Processing Log";



export const HEADERS: Record<SheetTab, string[]> = {

  [TAB_ACTION_ITEMS]: [

    "Created At",

    "Meeting Date",

    "Meeting Title",

    "Source Email Subject",

    "Source Email Date",

    "Source Gmail Thread ID",

    "Source Gmail Message ID",

    "Source Notes Link",

    "Summary Doc Link",

    "Owner",

    "Action Item",

    "Due Date",

    "Priority",

    "Project",

    "Status",

    "Follow-Up Needed",

    "Follow-Up Draft",

    "Cursor Prompt",

    "Confidence",

    "Notes",

    "Source Type",

    "Source File ID",

    "Source File URL",

    "Recording File URL",

    ...SYNC_COLUMN_HEADERS,

  ],

  [TAB_MEETINGS]: [

    "Processed At",

    "Meeting Date",

    "Meeting Title",

    "Source Email Subject",

    "Source Gmail Thread ID",

    "Source Gmail Message ID",

    "Source Notes Link",

    "Summary Doc Link",

    "Executive Summary",

    "Decisions",

    "Open Questions",

    "Follow-Up Draft",

    "Cursor Prompt",

    "Action Item Count",

    "Processing Status",

    "Model",

    "Token Estimate",

    "Error",

    "Source Type",

    "Source File ID",

    "Source File Name",

    "Source File URL",

    "Recording File URL",

  ],

  [TAB_PROCESSING_LOG]: [

    "Timestamp",

    "Level",

    "Event",

    "Gmail Thread ID",

    "Gmail Message ID",

    "Meeting Title",

    "Detail",

  ],

};



type RowValue = string | number | boolean | Date | GoogleAppsScript.Base.Date | "";



function getSpreadsheet(config: MeetingOpsConfig): GoogleAppsScript.Spreadsheet.Spreadsheet {

  return SpreadsheetApp.openById(config.actionSheetId);

}



function getOrCreateSheet(

  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,

  name: SheetTab

): GoogleAppsScript.Spreadsheet.Sheet {

  let sheet = ss.getSheetByName(name);

  if (!sheet) {

    sheet = ss.insertSheet(name);

  }

  return sheet;

}



function getSheetHeaderRow(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {

  const lastCol = sheet.getLastColumn();

  if (lastCol < 1) return [];

  return sheet

    .getRange(1, 1, 1, lastCol)

    .getValues()[0]

    .map((cell) => String(cell ?? "").trim());

}



/** Append missing canonical headers to the right; never reorder existing columns. */

export function ensureHeadersAppend(

  sheet: GoogleAppsScript.Spreadsheet.Sheet,

  canonicalHeaders: string[]

): string[] {

  const existing = getSheetHeaderRow(sheet).filter((h) => h.length > 0);
  const merged =
    existing.length > 0 ? [...existing] : [...canonicalHeaders];

  if (existing.length > 0) {
    for (const header of canonicalHeaders) {
      if (!merged.includes(header)) merged.push(header);
    }
  }

  if (sheet.getLastRow() === 0 || existing.length === 0) {
    sheet.getRange(1, 1, 1, merged.length).setValues([merged]);
  } else if (merged.length > existing.length) {
    const newHeaders = merged.slice(existing.length);
    sheet
      .getRange(1, existing.length + 1, 1, newHeaders.length)
      .setValues([newHeaders]);
  }



  sheet.setFrozenRows(1);

  sheet.getRange(1, 1, 1, merged.length).setFontWeight("bold");

  return merged;

}



function findColumnIndex(sheet: GoogleAppsScript.Spreadsheet.Sheet, header: string): number {

  const headers = getSheetHeaderRow(sheet);

  const idx = headers.indexOf(header);

  if (idx < 0) throw new Error(`Column not found: ${header}`);

  return idx + 1;

}



function appendRowByHeaderMap(

  sheet: GoogleAppsScript.Spreadsheet.Sheet,

  values: Record<string, RowValue>

): void {

  const headers = getSheetHeaderRow(sheet);

  const row = headers.map((h) => {

    const v = values[h];

    return v === undefined || v === null ? "" : v;

  });

  sheet.appendRow(row);

}



function applyActionItemsValidation(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {

  const headers = getSheetHeaderRow(sheet);

  const statusCol = headers.indexOf("Status") + 1;

  const priorityCol = headers.indexOf("Priority") + 1;

  if (statusCol < 1 || priorityCol < 1) return;



  const lastRow = Math.max(sheet.getMaxRows(), 1000);



  const statusRule = SpreadsheetApp.newDataValidation()

    .requireValueInList(["New", "In Progress", "Waiting", "Done", "Deferred"], true)

    .setAllowInvalid(false)

    .build();

  sheet.getRange(2, statusCol, lastRow, 1).setDataValidation(statusRule);



  const priorityRule = SpreadsheetApp.newDataValidation()

    .requireValueInList(["High", "Medium", "Low"], true)

    .setAllowInvalid(false)

    .build();

  sheet.getRange(2, priorityCol, lastRow, 1).setDataValidation(priorityRule);

}



export function setupMeetingOpsSheets(config: MeetingOpsConfig): void {

  const ss = getSpreadsheet(config);

  logInfo("Setting up Meeting Action Master sheets", { sheetId: config.actionSheetId });



  for (const tab of [TAB_ACTION_ITEMS, TAB_MEETINGS, TAB_PROCESSING_LOG] as SheetTab[]) {

    const sheet = getOrCreateSheet(ss, tab);

    const headers = ensureHeadersAppend(sheet, HEADERS[tab]);

    if (tab === TAB_ACTION_ITEMS) {

      applyActionItemsValidation(sheet);

    }

    sheet.autoResizeColumns(1, headers.length);

  }

}



function columnHasValue(

  sheet: GoogleAppsScript.Spreadsheet.Sheet,

  columnHeader: string,

  value: string

): boolean {

  if (!value || sheet.getLastRow() < 2) return false;

  const col = findColumnIndex(sheet, columnHeader);

  const values = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();

  return values.some((row) => String(row[0]) === value);

}



export function messageAlreadyProcessed(

  config: MeetingOpsConfig,

  messageId: string

): boolean {

  const ss = getSpreadsheet(config);

  const sheet = ss.getSheetByName(TAB_MEETINGS);

  if (!sheet || sheet.getLastRow() < 2) return false;



  const headers = getSheetHeaderRow(sheet);

  if (!headers.includes("Source Gmail Message ID")) return false;



  return columnHasValue(sheet, "Source Gmail Message ID", messageId);

}



export function driveFileAlreadyProcessed(

  config: MeetingOpsConfig,

  sourceFileId: string

): boolean {

  const ss = getSpreadsheet(config);

  const sheet = ss.getSheetByName(TAB_MEETINGS);

  if (!sheet || sheet.getLastRow() < 2) return false;



  const headers = getSheetHeaderRow(sheet);

  if (!headers.includes("Source File ID")) return false;



  return columnHasValue(sheet, "Source File ID", sourceFileId);

}



export function sourceAlreadyProcessed(

  config: MeetingOpsConfig,

  sourceType: SourceType,

  ids: { messageId?: string; sourceFileId?: string }

): boolean {

  if (sourceType === "drive_gemini_notes_doc" && ids.sourceFileId) {

    return driveFileAlreadyProcessed(config, ids.sourceFileId);

  }

  if (sourceType === "gmail" && ids.messageId) {

    return messageAlreadyProcessed(config, ids.messageId);

  }

  return false;

}



function sourceTypeLabel(sourceType: SourceType): string {

  return sourceType === "drive_gemini_notes_doc"

    ? "Drive Gemini Notes"

    : "Gmail Gemini Notes";

}



export function buildMeetingRowMap(

  extracted: ExtractedContent,

  ai: ProcessedMeetingResult,

  summaryDocUrl: string,

  model: string,

  tokenEstimate: number | null,

  status: string,

  error: string | null

): Record<string, RowValue> {

  const m = ai.meeting;

  return {

    "Processed At": new Date(),

    "Meeting Date": m.date ?? extracted.meetingDate ?? "",

    "Meeting Title": m.title || extracted.meetingTitle,

    "Source Email Subject": extracted.emailSubject,

    "Source Gmail Thread ID": extracted.threadId ?? "",

    "Source Gmail Message ID": extracted.messageId ?? "",

    "Source Notes Link": extracted.sourceNotesLink ?? extracted.sourceFileUrl ?? "",

    "Summary Doc Link": summaryDocUrl,

    "Executive Summary": m.executive_summary,

    Decisions: m.decisions.join("\n"),

    "Open Questions": m.open_questions.join("\n"),

    "Follow-Up Draft": m.follow_up_draft,

    "Cursor Prompt": m.cursor_prompt,

    "Action Item Count": ai.action_items.length,

    "Processing Status": status,

    Model: model,

    "Token Estimate": tokenEstimate ?? "",

    Error: error ?? "",

    "Source Type": sourceTypeLabel(extracted.sourceType),

    "Source File ID": extracted.sourceFileId ?? "",

    "Source File Name": extracted.sourceFileName ?? "",

    "Source File URL": extracted.sourceFileUrl ?? "",

    "Recording File URL": extracted.recordingFileUrl ?? "",

  };

}



export function buildActionItemRowMap(

  createdAt: Date,

  extracted: ExtractedContent,

  meeting: MeetingOutput,

  item: ActionItemOutput,

  summaryDocUrl: string

): Record<string, RowValue> {

  return {

    "Created At": createdAt,

    "Meeting Date": meeting.date ?? extracted.meetingDate ?? "",

    "Meeting Title": meeting.title || extracted.meetingTitle,

    "Source Email Subject": extracted.emailSubject,

    "Source Email Date": (extracted.emailDate as Date) ?? "",

    "Source Gmail Thread ID": extracted.threadId ?? "",

    "Source Gmail Message ID": extracted.messageId ?? "",

    "Source Notes Link": extracted.sourceNotesLink ?? extracted.sourceFileUrl ?? "",

    "Summary Doc Link": summaryDocUrl,

    Owner: item.owner ?? "",

    "Action Item": item.action,

    "Due Date": item.due_date ?? "",

    Priority: item.priority,

    Project: item.project ?? meeting.project_guess ?? "",

    Status: item.status,

    "Follow-Up Needed": item.follow_up_needed,

    "Follow-Up Draft": item.follow_up_draft ?? "",

    "Cursor Prompt": item.cursor_prompt ?? meeting.cursor_prompt ?? "",

    Confidence: item.confidence,

    Notes: item.notes ?? "",

    "Source Type": sourceTypeLabel(extracted.sourceType),

    "Source File ID": extracted.sourceFileId ?? "",

    "Source File URL": extracted.sourceFileUrl ?? "",

    "Recording File URL": extracted.recordingFileUrl ?? "",

  };

}



export function appendProcessingLog(

  config: MeetingOpsConfig,

  level: LogLevel,

  event: string,

  detail: string,

  meta?: {

    threadId?: string;

    messageId?: string;

    sourceFileId?: string;

    meetingTitle?: string;

  }

): void {

  const ss = getSpreadsheet(config);

  const sheet = getOrCreateSheet(ss, TAB_PROCESSING_LOG);

  ensureHeadersAppend(sheet, HEADERS[TAB_PROCESSING_LOG]);



  sheet.appendRow([

    new Date(),

    level,

    event,

    meta?.threadId ?? "",

    meta?.messageId ?? meta?.sourceFileId ?? "",

    meta?.meetingTitle ?? "",

    detail,

  ]);

}



export function appendMeetingRow(

  config: MeetingOpsConfig,

  extracted: ExtractedContent,

  ai: ProcessedMeetingResult,

  summaryDocUrl: string,

  model: string,

  tokenEstimate: number | null,

  status: string,

  error: string | null

): void {

  const ss = getSpreadsheet(config);

  const sheet = getOrCreateSheet(ss, TAB_MEETINGS);

  ensureHeadersAppend(sheet, HEADERS[TAB_MEETINGS]);

  appendRowByHeaderMap(

    sheet,

    buildMeetingRowMap(extracted, ai, summaryDocUrl, model, tokenEstimate, status, error)

  );

}



export function appendActionItemRows(

  config: MeetingOpsConfig,

  extracted: ExtractedContent,

  ai: ProcessedMeetingResult,

  summaryDocUrl: string

): void {

  if (ai.action_items.length === 0) return;



  const ss = getSpreadsheet(config);

  const sheet = getOrCreateSheet(ss, TAB_ACTION_ITEMS);

  ensureHeadersAppend(sheet, HEADERS[TAB_ACTION_ITEMS]);



  const meeting = ai.meeting;

  const now = new Date();



  for (const item of ai.action_items) {

    appendRowByHeaderMap(

      sheet,

      buildActionItemRowMap(now, extracted, meeting, item, summaryDocUrl)

    );

  }

}



/** @deprecated Use buildActionItemRowMap for header-aware writes. */

export function buildActionItemRow(

  createdAt: Date,

  extracted: ExtractedContent,

  meeting: MeetingOutput,

  item: ActionItemOutput,

  summaryDocUrl: string

): RowValue[] {

  const map = buildActionItemRowMap(createdAt, extracted, meeting, item, summaryDocUrl);

  return HEADERS[TAB_ACTION_ITEMS].map((h) => map[h] ?? "");

}


