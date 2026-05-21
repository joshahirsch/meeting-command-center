export const GEMINI_NOTES_SUFFIX = " - Notes by Gemini";
export const RECORDING_MARKER = " - Recording";

export interface ParsedDriveFileName {
  meetingTitle: string;
  meetingDate: string | null;
  meetingDateTimeText: string | null;
  sourceKind: "gemini_drive_doc";
}

/** Strip " - Notes by Gemini" for recording pairing. */
export function getGeminiNoteBaseName(fileName: string): string | null {
  const idx = fileName.indexOf(GEMINI_NOTES_SUFFIX);
  if (idx < 0) return null;
  const base = fileName.slice(0, idx).trim();
  return base.length > 0 ? base : null;
}

export function parseDriveDateFromDateTimeText(dateTimeText: string): string | null {
  const m = dateTimeText.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parse Gemini Drive note file names.
 */
export function parseDriveMeetingFileName(fileName: string): ParsedDriveFileName {
  const trimmed = fileName.trim();
  const meetingStarted = trimmed.match(
    /^Meeting started\s+(.+?)\s*-\s*Notes by Gemini\s*$/i
  );
  if (meetingStarted) {
    const meetingDateTimeText = meetingStarted[1].trim();
    return {
      meetingTitle: "Meeting",
      meetingDate: parseDriveDateFromDateTimeText(meetingDateTimeText),
      meetingDateTimeText,
      sourceKind: "gemini_drive_doc",
    };
  }

  const standard = trimmed.match(/^(.+?)\s+-\s+(.+?)\s+-\s*Notes by Gemini\s*$/i);
  if (standard) {
    const meetingTitle = standard[1].trim();
    const meetingDateTimeText = standard[2].trim();
    return {
      meetingTitle: meetingTitle || "Unknown Meeting",
      meetingDate: parseDriveDateFromDateTimeText(meetingDateTimeText),
      meetingDateTimeText,
      sourceKind: "gemini_drive_doc",
    };
  }

  const base = getGeminiNoteBaseName(trimmed);
  return {
    meetingTitle: base ?? trimmed,
    meetingDate: null,
    meetingDateTimeText: null,
    sourceKind: "gemini_drive_doc",
  };
}

export function findMatchingRecordingFromFiles(
  noteFileName: string,
  folderFiles: Array<{ name: string; id: string; url: string }>
): { recordingFileId: string | null; recordingFileUrl: string | null } {
  const base = getGeminiNoteBaseName(noteFileName);
  if (!base) {
    return { recordingFileId: null, recordingFileUrl: null };
  }

  for (const file of folderFiles) {
    if (file.name === noteFileName) continue;
    if (!file.name.includes(base)) continue;
    if (!file.name.includes(RECORDING_MARKER) && !/\bRecording\b/i.test(file.name)) {
      continue;
    }
    return { recordingFileId: file.id, recordingFileUrl: file.url };
  }

  return { recordingFileId: null, recordingFileUrl: null };
}
