import { SYNC_COLUMN_HEADERS } from "./actionItemSyncColumns";
import {
  buildSheetRowUrl,
  parseCreatedAtMs,
  type ActionItemDigestEntry,
  type ActionItemSyncEntry,
} from "./actionItemsLogic";
import type { MeetingOpsConfig } from "./types";
import { ensureHeadersAppend, HEADERS, TAB_ACTION_ITEMS } from "./sheets";

function getSpreadsheet(
  config: MeetingOpsConfig
): GoogleAppsScript.Spreadsheet.Spreadsheet {
  return SpreadsheetApp.openById(config.actionSheetId);
}

function headerIndex(headers: string[], name: string): number {
  return headers.indexOf(name);
}

function cellString(row: unknown[], index: number): string {
  if (index < 0) return "";
  const v = row[index];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function readActionItemRowsInternal(
  config: MeetingOpsConfig
): ActionItemSyncEntry[] {
  const ss = getSpreadsheet(config);
  const sheet = ss.getSheetByName(TAB_ACTION_ITEMS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const canonical = [...HEADERS[TAB_ACTION_ITEMS], ...SYNC_COLUMN_HEADERS];
  const headers = ensureHeadersAppend(sheet, canonical);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const gid = sheet.getSheetId();

  const idx = (name: string) => headerIndex(headers, name);

  const entries: ActionItemSyncEntry[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[];
    const rowNumber = i + 2;
    const sourceNotes = cellString(row, idx("Source Notes Link"));
    const sourceFile = cellString(row, idx("Source File URL"));
    entries.push({
      rowNumber,
      meetingTitle: cellString(row, idx("Meeting Title")),
      actionItem: cellString(row, idx("Action Item")),
      owner: cellString(row, idx("Owner")),
      dueDate: cellString(row, idx("Due Date")),
      priority: cellString(row, idx("Priority")),
      status: cellString(row, idx("Status")),
      meetingDate: cellString(row, idx("Meeting Date")),
      summaryDocLink: cellString(row, idx("Summary Doc Link")),
      sourceDocLink: sourceNotes || sourceFile,
      sheetRowUrl: buildSheetRowUrl(config.actionSheetId, gid, rowNumber),
      createdAtMs: parseCreatedAtMs(row[idx("Created At")]),
      googleTaskId: cellString(row, idx("googleTaskId")),
      googleTaskListId: cellString(row, idx("googleTaskListId")),
    });
  }
  return entries;
}

export function readActionItemSyncEntries(
  config: MeetingOpsConfig
): ActionItemSyncEntry[] {
  return readActionItemRowsInternal(config);
}

export function readOpenActionItemsForDigest(
  config: MeetingOpsConfig
): ActionItemDigestEntry[] {
  return readActionItemRowsInternal(config);
}

export function getActionItemsTabUrl(config: MeetingOpsConfig): string {
  const ss = getSpreadsheet(config);
  const sheet = ss.getSheetByName(TAB_ACTION_ITEMS);
  if (!sheet) throw new Error("Action Items sheet not found");
  return `https://docs.google.com/spreadsheets/d/${config.actionSheetId}/edit#gid=${sheet.getSheetId()}`;
}

export function updateActionItemSyncFields(
  config: MeetingOpsConfig,
  rowNumber: number,
  fields: Partial<{
    googleTaskId: string;
    googleTaskListId: string;
    taskSyncedAt: string;
    taskSyncStatus: string;
    lastTaskSyncError: string;
    dailyDigestIncludedAt: string;
  }>
): void {
  const ss = getSpreadsheet(config);
  const sheet = ss.getSheetByName(TAB_ACTION_ITEMS);
  if (!sheet) throw new Error("Action Items sheet not found");

  const headers = ensureHeadersAppend(sheet, [
    ...HEADERS[TAB_ACTION_ITEMS],
    ...SYNC_COLUMN_HEADERS,
  ]);

  const write = (column: string, value: string) => {
    const col = headerIndex(headers, column) + 1;
    if (col < 1) return;
    sheet.getRange(rowNumber, col).setValue(value);
  };

  if (fields.googleTaskId !== undefined) write("googleTaskId", fields.googleTaskId);
  if (fields.googleTaskListId !== undefined) {
    write("googleTaskListId", fields.googleTaskListId);
  }
  if (fields.taskSyncedAt !== undefined) write("taskSyncedAt", fields.taskSyncedAt);
  if (fields.taskSyncStatus !== undefined) write("taskSyncStatus", fields.taskSyncStatus);
  if (fields.lastTaskSyncError !== undefined) {
    write("lastTaskSyncError", fields.lastTaskSyncError);
  }
  if (fields.dailyDigestIncludedAt !== undefined) {
    write("dailyDigestIncludedAt", fields.dailyDigestIncludedAt);
  }
}

export function markDigestIncluded(
  config: MeetingOpsConfig,
  entries: ActionItemDigestEntry[],
  timestampIso: string
): void {
  for (const entry of entries) {
    updateActionItemSyncFields(config, entry.rowNumber, {
      dailyDigestIncludedAt: timestampIso,
    });
  }
}
