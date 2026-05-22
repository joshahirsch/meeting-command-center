export type LogLevel = "INFO" | "WARN" | "ERROR";

export type Priority = "High" | "Medium" | "Low";
export type Confidence = "High" | "Medium" | "Low";
export type ActionStatus = "New" | "In Progress" | "Waiting" | "Done" | "Deferred";

export type SourceMode = "drive" | "gmail";
export type SourceType = "gmail" | "drive_gemini_notes_doc";

export interface MeetingOpsConfig {
  openaiApiKey: string;
  openaiModel: string;
  actionSheetId: string;
  outputFolderId: string;
  sourceMode: SourceMode;
  sourceFolderId: string | null;
  driveLookbackDays: number;
  maxFilesPerRun: number;
  processRecordings: boolean;
  includeRecordingLink: boolean;
  targetLabelName: string;
  processedLabelName: string;
  errorLabelName: string;
  maxThreadsPerRun: number;
  lookbackDays: number;
  notificationEmail: string;
  forceProcessTestMode: boolean;
  createTargetLabelIfMissing: boolean;
  dailyDigestEmail: string;
  dailyDigestHour: number;
  dailyDigestTimezone: string;
  dailyDigestOwnerAliases: string[];
  googleTasksListName: string;
  taskSyncEnabled: boolean;
}

export interface ConfigKeyStatus {
  key: string;
  present: boolean;
  valuePreview?: string;
}

export interface ParsedSubject {
  meetingTitle: string;
  meetingDate: string | null;
  rawSubject: string;
}

export interface DriveGeminiNoteFile {
  sourceFileId: string;
  sourceFileName: string;
  sourceFileUrl: string;
  createdTime: string;
  modifiedTime: string;
  meetingTitle: string;
  meetingDate: string | null;
  meetingDateTimeText: string | null;
  recordingFileId: string | null;
  recordingFileUrl: string | null;
}

export interface ExtractedContent {
  sourceType: SourceType;
  meetingTitle: string;
  meetingDate: string | null;
  transcriptText: string;
  charCount: number;
  sourceNotesLink: string | null;
  recordingFileUrl: string | null;
  emailSubject: string;
  emailDate?: Date | GoogleAppsScript.Base.Date;
  threadId?: string;
  messageId?: string;
  sourceFileId?: string;
  sourceFileName?: string;
  sourceFileUrl?: string;
  meetingDateTimeText?: string;
}

export interface GmailCandidate {
  threadId: string;
  messageId: string;
  thread: GoogleAppsScript.Gmail.GmailThread;
  message: GoogleAppsScript.Gmail.GmailMessage;
}

export interface MeetingOutput {
  title: string;
  date: string | null;
  executive_summary: string;
  decisions: string[];
  open_questions: string[];
  follow_up_draft: string;
  cursor_prompt: string;
  project_guess: string | null;
  confidence: Confidence;
}

export interface ActionItemOutput {
  owner: string | null;
  action: string;
  due_date: string | null;
  priority: Priority;
  project: string | null;
  status: ActionStatus;
  follow_up_needed: boolean;
  follow_up_draft: string | null;
  cursor_prompt: string | null;
  confidence: Confidence;
  notes: string | null;
}

export interface ProcessedMeetingResult {
  meeting: MeetingOutput;
  action_items: ActionItemOutput[];
}

export interface ProcessingContext {
  config: MeetingOpsConfig;
  candidate: GmailCandidate;
  extracted: ExtractedContent;
  aiResult: ProcessedMeetingResult;
  summaryDocUrl: string;
  model: string;
  tokenEstimate: number | null;
}

export interface DryRunPreview {
  meetingTitle: string;
  meetingDate: string | null;
  charCount: number;
  actionItemCount: number;
  firstActionTitles: string[];
  sourceFileUrl?: string;
  recordingFileUrl?: string | null;
}

export type SheetTab = "Action Items" | "Meetings" | "Processing Log";

