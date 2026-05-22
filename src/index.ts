/**
 * Meeting Ops Automation — Google Apps Script entry point.
 * Global functions are registered at the bottom for Apps Script runtime.
 */

import { getConfigStatus, loadConfig, validateRequiredConfig } from "./config";
import {
  buildExtractedFromDriveFile,
  getDriveFileById,
  listUnprocessedGeminiNoteFiles,
  readGeminiNoteDoc,
} from "./drive";
import { createMeetingSummaryDoc } from "./docs";
import { extractFromCandidate } from "./extract";
import {
  buildCandidateFromThread,
  findLatestCandidate,
  getThreadById,
  searchUnprocessedCandidates,
} from "./gmail";
import {
  ensureProcessingLabels,
  markThreadError,
  markThreadProcessed,
  threadHasLabel,
} from "./labels";
import { formatError, logError, logInfo, logWarn, safeDetail } from "./logger";
import { processMeetingWithOpenAI } from "./openai";
import {
  appendActionItemRows,
  appendMeetingRow,
  appendProcessingLog,
  messageAlreadyProcessed,
  setupMeetingOpsSheets as initializeSheets,
  sourceAlreadyProcessed,
} from "./sheets";
import { sendDailyActionDigest } from "./dailyDigest";
import {
  installDailyDigestTrigger,
  installGoogleTasksSyncTrigger,
} from "./digestTriggers";
import { syncJoshActionItemsToGoogleTasks } from "./googleTasksSync";
import { installMeetingOpsTrigger, removeMeetingOpsTriggers } from "./triggers";
import type {
  DryRunPreview,
  ExtractedContent,
  GmailCandidate,
  MeetingOpsConfig,
} from "./types";

interface ProcessLogMeta {
  threadId?: string;
  messageId?: string;
  sourceFileId?: string;
  meetingTitle?: string;
}

function logEvent(
  config: MeetingOpsConfig,
  level: "INFO" | "WARN" | "ERROR",
  event: string,
  detail: string,
  meta: ProcessLogMeta,
  dryRun: boolean
): void {
  if (dryRun) return;
  appendProcessingLog(config, level, event, detail, meta);
}

function buildDryRunPreview(
  extracted: ExtractedContent,
  result: ReturnType<typeof processMeetingWithOpenAI>["result"]
): DryRunPreview {
  return {
    meetingTitle: result.meeting.title || extracted.meetingTitle,
    meetingDate: result.meeting.date ?? extracted.meetingDate,
    charCount: extracted.charCount,
    actionItemCount: result.action_items.length,
    firstActionTitles: result.action_items.slice(0, 2).map((a) => a.action),
    sourceFileUrl: extracted.sourceFileUrl,
    recordingFileUrl: extracted.recordingFileUrl,
  };
}

function logDryRunPreview(preview: DryRunPreview): void {
  logInfo("Dry run preview", {
    meetingTitle: preview.meetingTitle,
    meetingDate: preview.meetingDate ?? "",
    sourceFileUrl: preview.sourceFileUrl ?? "",
    recordingFileUrl: preview.recordingFileUrl ?? "",
    charCount: preview.charCount,
    actionItemCount: preview.actionItemCount,
    firstActions: preview.firstActionTitles.join(" | "),
  });
}

function processExtractedContent(
  config: MeetingOpsConfig,
  extracted: ExtractedContent,
  meta: ProcessLogMeta,
  options: {
    dryRun: boolean;
    onOpenAiError?: (err: unknown) => void;
    onDocError?: (err: unknown) => void;
    onSheetsError?: (err: unknown) => void;
  }
): DryRunPreview | void {
  if (options.dryRun) {
    const { result } = processMeetingWithOpenAI(config, extracted);
    const preview = buildDryRunPreview(extracted, result);
    logDryRunPreview(preview);
    return preview;
  }

  let aiResult;
  let tokenEstimate: number | null = null;
  try {
    const ai = processMeetingWithOpenAI(config, extracted);
    aiResult = ai.result;
    tokenEstimate = ai.tokenEstimate;
    logEvent(config, "INFO", "openai_succeeded", "Structured output received", meta, false);
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "openai_failed", detail, meta, false);
    options.onOpenAiError?.(err);
    throw err;
  }

  let summaryDocUrl = "";
  try {
    summaryDocUrl = createMeetingSummaryDoc(
      config,
      extracted,
      aiResult,
      config.openaiModel,
      tokenEstimate
    );
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "doc_creation_failed", detail, meta, false);
    options.onDocError?.(err);
    throw err;
  }

  try {
    appendMeetingRow(
      config,
      extracted,
      aiResult,
      summaryDocUrl,
      config.openaiModel,
      tokenEstimate,
      "Success",
      null
    );
    appendActionItemRows(config, extracted, aiResult, summaryDocUrl);
    logEvent(config, "INFO", "rows_written", "Meetings and Action Items updated", meta, false);
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "sheets_write_failed", detail, meta, false);
    options.onSheetsError?.(err);
    throw err;
  }
}

function processCandidate(
  config: MeetingOpsConfig,
  candidate: GmailCandidate,
  labels: ReturnType<typeof ensureProcessingLabels>,
  options: { dryRun: boolean; skipWrites: boolean }
): DryRunPreview | void {
  const { processed, error } = labels;
  const meta: ProcessLogMeta = {
    threadId: candidate.threadId,
    messageId: candidate.messageId,
    meetingTitle: "",
  };
  const { dryRun } = options;

  if (
    !config.forceProcessTestMode &&
    messageAlreadyProcessed(config, candidate.messageId)
  ) {
    logInfo("Skipping already processed message", { messageId: candidate.messageId });
    logEvent(
      config,
      "INFO",
      "skip_duplicate",
      "Message already in Meetings tab",
      { ...meta, meetingTitle: "(duplicate)" },
      dryRun
    );
    if (!dryRun && !threadHasLabel(candidate.thread, processed)) {
      markThreadProcessed(candidate.thread, processed, error);
      logEvent(config, "INFO", "label_backfill", "Applied processed label for existing row", meta, dryRun);
    }
    return;
  }

  logEvent(config, "INFO", "candidate_found", "Processing candidate thread", meta, dryRun);

  let extracted: ExtractedContent;
  try {
    extracted = extractFromCandidate(candidate);
    meta.meetingTitle = extracted.meetingTitle;
    logEvent(
      config,
      "INFO",
      "extraction_succeeded",
      `Extracted ${extracted.charCount} chars`,
      meta,
      dryRun
    );
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "extraction_failed", detail, meta, dryRun);
    if (!dryRun) markThreadError(candidate.thread, error);
    throw err;
  }

  if (options.dryRun || options.skipWrites) {
    return processExtractedContent(config, extracted, meta, { dryRun: true });
  }

  processExtractedContent(config, extracted, meta, {
    dryRun: false,
    onOpenAiError: () => markThreadError(candidate.thread, error),
    onDocError: () => markThreadError(candidate.thread, error),
    onSheetsError: () => markThreadError(candidate.thread, error),
  });

  try {
    markThreadProcessed(candidate.thread, processed, error);
    logEvent(config, "INFO", "processed_label_applied", "Thread marked processed", meta, false);
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "label_apply_failed", detail, meta, false);
    throw err;
  }
}

function processDriveFile(
  config: MeetingOpsConfig,
  fileId: string,
  options: { dryRun: boolean }
): DryRunPreview | void {
  const meta: ProcessLogMeta = { sourceFileId: fileId, meetingTitle: "" };

  const driveFile = getDriveFileById(config, fileId);

  if (
    !config.forceProcessTestMode &&
    sourceAlreadyProcessed(config, "drive_gemini_notes_doc", {
      sourceFileId: driveFile.sourceFileId,
    })
  ) {
    logInfo("Skipping already processed Drive file", { fileId });
    logEvent(
      config,
      "INFO",
      "skip_duplicate",
      "Source File ID already in Meetings tab",
      { ...meta, meetingTitle: "(duplicate)" },
      options.dryRun
    );
    return;
  }

  logEvent(config, "INFO", "drive_candidate_found", "Processing Drive Gemini note", meta, options.dryRun);

  let extracted: ExtractedContent;
  try {
    const text = readGeminiNoteDoc(fileId);
    extracted = buildExtractedFromDriveFile(driveFile, text);
    meta.meetingTitle = extracted.meetingTitle;
    logEvent(
      config,
      "INFO",
      "extraction_succeeded",
      `Extracted ${extracted.charCount} chars from Drive doc`,
      meta,
      options.dryRun
    );
  } catch (err) {
    const detail = formatError(err);
    logEvent(config, "ERROR", "extraction_failed", detail, meta, options.dryRun);
    throw err;
  }

  return processExtractedContent(config, extracted, meta, { dryRun: options.dryRun });
}

export function runMeetingOps(): void {
  const config = loadConfig();
  if (config.sourceMode === "drive") {
    runDriveMeetingOps();
    return;
  }
  runGmailMeetingOps(config);
}

function runGmailMeetingOps(config: MeetingOpsConfig): void {
  const labels = ensureProcessingLabels(config);

  appendProcessingLog(config, "INFO", "run_started", "Meeting ops Gmail run started", {});

  const candidates = searchUnprocessedCandidates(
    config,
    labels.processed,
    config.maxThreadsPerRun
  );

  logInfo("Gmail candidates found", { count: candidates.length });

  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      processCandidate(config, candidate, labels, { dryRun: false, skipWrites: false });
      processed++;
    } catch (err) {
      failed++;
      logError("Failed to process thread", {
        threadId: candidate.threadId,
        error: safeDetail(formatError(err)),
      });
    }
  }

  appendProcessingLog(
    config,
    "INFO",
    "run_completed",
    `Gmail processed=${processed} failed=${failed}`,
    {}
  );
  logInfo("Gmail run completed", { processed, failed });
}

export function runDriveMeetingOps(): void {
  const config = loadConfig();

  appendProcessingLog(config, "INFO", "run_started", "Meeting ops Drive run started", {});

  const files = listUnprocessedGeminiNoteFiles(config);
  logInfo("Drive candidates found", { count: files.length });

  let processed = 0;
  let failed = 0;

  for (const file of files) {
    try {
      processDriveFile(config, file.sourceFileId, { dryRun: false });
      processed++;
    } catch (err) {
      failed++;
      logError("Failed to process Drive file", {
        sourceFileId: file.sourceFileId,
        error: safeDetail(formatError(err)),
      });
    }
  }

  appendProcessingLog(
    config,
    "INFO",
    "run_completed",
    `Drive processed=${processed} failed=${failed}`,
    {}
  );
  logInfo("Drive run completed", { processed, failed });
}

export function dryRunLatestMeetingNote(): void {
  const config = loadConfig();
  if (config.sourceMode === "drive") {
    dryRunLatestDriveMeetingNote();
    return;
  }
  const labels = ensureProcessingLabels(config);
  const candidate = findLatestCandidate(config, labels.processed);

  if (!candidate) {
    logWarn("No unprocessed Gemini Meeting Notes candidate found");
    return;
  }

  processCandidate(config, candidate, labels, { dryRun: true, skipWrites: true });
}

export function dryRunLatestDriveMeetingNote(): void {
  const config = loadConfig();
  const files = listUnprocessedGeminiNoteFiles(config);

  if (files.length === 0) {
    logWarn("No unprocessed Drive Gemini notes found in source folder");
    return;
  }

  processDriveFile(config, files[0].sourceFileId, { dryRun: true });
}

export function processOneThreadById(threadId: string): void {
  const config = loadConfig();
  const labels = ensureProcessingLabels(config);
  const thread = getThreadById(threadId);
  const candidate = buildCandidateFromThread(thread);
  processCandidate(config, candidate, labels, { dryRun: false, skipWrites: false });
}

export function processOneDriveFileById(fileId: string): void {
  const config = loadConfig();
  processDriveFile(config, fileId, { dryRun: false });
}

export function setupMeetingOpsSheets(): void {
  const config = loadConfig();
  initializeSheets(config);
  logInfo("Sheet setup complete");
}

export function showConfigStatus(): void {
  const missing = validateRequiredConfig();
  const status = getConfigStatus();
  logInfo("Config status", { missingRequired: missing.join(", ") || "none" });
  for (const row of status) {
    logInfo(`Config ${row.key}`, {
      present: row.present,
      preview: row.valuePreview ?? "",
    });
  }
}

// --- Apps Script global registration ---
const g = globalThis as Record<string, unknown>;

g.runMeetingOps = runMeetingOps;
g.runDriveMeetingOps = runDriveMeetingOps;
g.dryRunLatestMeetingNote = dryRunLatestMeetingNote;
g.dryRunLatestDriveMeetingNote = dryRunLatestDriveMeetingNote;
g.processOneThreadById = processOneThreadById;
g.processOneDriveFileById = processOneDriveFileById;
g.setupMeetingOpsSheets = setupMeetingOpsSheets;
g.installMeetingOpsTrigger = installMeetingOpsTrigger;
g.removeMeetingOpsTriggers = removeMeetingOpsTriggers;
g.showConfigStatus = showConfigStatus;
g.sendDailyActionDigest = sendDailyActionDigest;
g.syncJoshActionItemsToGoogleTasks = syncJoshActionItemsToGoogleTasks;
g.installDailyDigestTrigger = installDailyDigestTrigger;
g.installGoogleTasksSyncTrigger = installGoogleTasksSyncTrigger;

