import {
  findMatchingRecordingFromFiles,
  parseDriveMeetingFileName,
} from "./driveParse";
import { normalizeWhitespace } from "./extract";
import { logInfo, logWarn } from "./logger";
import { driveFileAlreadyProcessed } from "./sheets";
import type { DriveGeminiNoteFile, ExtractedContent, MeetingOpsConfig } from "./types";

export {
  findMatchingRecordingFromFiles,
  getGeminiNoteBaseName,
  GEMINI_NOTES_SUFFIX,
  parseDriveMeetingFileName,
  RECORDING_MARKER,
} from "./driveParse";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export interface FolderFileMeta {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  createdTime: number;
  modifiedTime: number;
}

function collectFolderFileMeta(
  folder: GoogleAppsScript.Drive.Folder
): FolderFileMeta[] {
  const metas: FolderFileMeta[] = [];
  const iter = folder.getFiles();
  while (iter.hasNext()) {
    const file = iter.next();
    metas.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      url: file.getUrl(),
      createdTime: file.getDateCreated().getTime(),
      modifiedTime: file.getLastUpdated().getTime(),
    });
  }
  return metas;
}

function isWithinLookback(timestampMs: number, lookbackDays: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  return timestampMs >= cutoff.getTime();
}

function isGeminiNotesDoc(file: FolderFileMeta): boolean {
  return (
    file.mimeType === GOOGLE_DOC_MIME &&
    file.name.includes("Notes by Gemini")
  );
}

export function listUnprocessedGeminiNoteFiles(
  config: MeetingOpsConfig
): DriveGeminiNoteFile[] {
  if (!config.sourceFolderId) {
    throw new Error("Missing required script property: SOURCE_FOLDER_ID");
  }

  const folder = DriveApp.getFolderById(config.sourceFolderId);
  const allFiles = collectFolderFileMeta(folder);
  const fileIndex = allFiles.map((f) => ({ name: f.name, id: f.id, url: f.url }));

  const noteCandidates = allFiles.filter((f) => {
    if (!isGeminiNotesDoc(f)) return false;
    if (
      !isWithinLookback(f.modifiedTime, config.driveLookbackDays) &&
      !isWithinLookback(f.createdTime, config.driveLookbackDays)
    ) {
      return false;
    }
    if (!config.forceProcessTestMode && driveFileAlreadyProcessed(config, f.id)) {
      return false;
    }
    return true;
  });

  noteCandidates.sort((a, b) => b.modifiedTime - a.modifiedTime);

  const limited = noteCandidates.slice(0, config.maxFilesPerRun);

  return limited.map((file) => {
    const parsed = parseDriveMeetingFileName(file.name);
    let recordingFileId: string | null = null;
    let recordingFileUrl: string | null = null;

    if (config.includeRecordingLink) {
      const match = findMatchingRecordingFromFiles(file.name, fileIndex);
      recordingFileId = match.recordingFileId;
      recordingFileUrl = match.recordingFileUrl;
    }

    return {
      sourceFileId: file.id,
      sourceFileName: file.name,
      sourceFileUrl: file.url,
      createdTime: new Date(file.createdTime).toISOString(),
      modifiedTime: new Date(file.modifiedTime).toISOString(),
      meetingTitle: parsed.meetingTitle,
      meetingDate: parsed.meetingDate,
      meetingDateTimeText: parsed.meetingDateTimeText,
      recordingFileId,
      recordingFileUrl,
    };
  });
}

export function readGeminiNoteDoc(fileId: string): string {
  const doc = DocumentApp.openById(fileId);
  const text = normalizeWhitespace(doc.getBody().getText());
  if (!text || text.length < 50) {
    throw new Error("Gemini note document is empty or too short");
  }
  logInfo("Read Gemini note doc", { fileId, charCount: text.length });
  return text;
}

export function findMatchingRecording(
  noteFileName: string,
  folderId: string
): { recordingFileId: string | null; recordingFileUrl: string | null } {
  const folder = DriveApp.getFolderById(folderId);
  const allFiles = collectFolderFileMeta(folder);
  return findMatchingRecordingFromFiles(
    noteFileName,
    allFiles.map((f) => ({ name: f.name, id: f.id, url: f.url }))
  );
}

export function buildExtractedFromDriveFile(
  file: DriveGeminiNoteFile,
  transcriptText: string
): ExtractedContent {
  const capped =
    transcriptText.length > 120_000
      ? transcriptText.slice(0, 120_000) + "\n\n[... truncated ...]"
      : transcriptText;

  return {
    sourceType: "drive_gemini_notes_doc",
    meetingTitle: file.meetingTitle,
    meetingDate: file.meetingDate,
    meetingDateTimeText: file.meetingDateTimeText ?? undefined,
    sourceFileId: file.sourceFileId,
    sourceFileName: file.sourceFileName,
    sourceFileUrl: file.sourceFileUrl,
    sourceNotesLink: file.sourceFileUrl,
    recordingFileUrl: file.recordingFileUrl,
    emailSubject: file.sourceFileName,
    transcriptText: capped,
    charCount: capped.length,
  };
}

export function getDriveFileById(
  config: MeetingOpsConfig,
  fileId: string
): DriveGeminiNoteFile {
  if (!config.sourceFolderId) {
    throw new Error("Missing required script property: SOURCE_FOLDER_ID");
  }

  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  let inSourceFolder = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === config.sourceFolderId) {
      inSourceFolder = true;
      break;
    }
  }
  if (!inSourceFolder) {
    throw new Error(`File ${fileId} is not in SOURCE_FOLDER_ID`);
  }

  const name = file.getName();
  if (!name.includes("Notes by Gemini")) {
    logWarn("File name does not include Notes by Gemini", { fileId, name });
  }

  const parsed = parseDriveMeetingFileName(name);
  let recordingFileId: string | null = null;
  let recordingFileUrl: string | null = null;
  if (config.includeRecordingLink) {
    const match = findMatchingRecording(name, config.sourceFolderId);
    recordingFileId = match.recordingFileId;
    recordingFileUrl = match.recordingFileUrl;
  }

  return {
    sourceFileId: file.getId(),
    sourceFileName: name,
    sourceFileUrl: file.getUrl(),
    createdTime: file.getDateCreated().toISOString(),
    modifiedTime: file.getLastUpdated().toISOString(),
    meetingTitle: parsed.meetingTitle,
    meetingDate: parsed.meetingDate,
    meetingDateTimeText: parsed.meetingDateTimeText,
    recordingFileId,
    recordingFileUrl,
  };
}
