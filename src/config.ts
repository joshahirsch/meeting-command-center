import { parseDigestOwnerAliases } from "./actionItemsLogic";
import type { ConfigKeyStatus, MeetingOpsConfig, SourceMode } from "./types";

export const CONFIG_KEYS = {
  OPENAI_API_KEY: "OPENAI_API_KEY",
  OPENAI_MODEL: "OPENAI_MODEL",
  ACTION_SHEET_ID: "ACTION_SHEET_ID",
  OUTPUT_FOLDER_ID: "OUTPUT_FOLDER_ID",
  SOURCE_MODE: "SOURCE_MODE",
  SOURCE_FOLDER_ID: "SOURCE_FOLDER_ID",
  DRIVE_LOOKBACK_DAYS: "DRIVE_LOOKBACK_DAYS",
  MAX_FILES_PER_RUN: "MAX_FILES_PER_RUN",
  PROCESS_RECORDINGS: "PROCESS_RECORDINGS",
  INCLUDE_RECORDING_LINK: "INCLUDE_RECORDING_LINK",
  TARGET_LABEL_NAME: "TARGET_LABEL_NAME",
  PROCESSED_LABEL_NAME: "PROCESSED_LABEL_NAME",
  ERROR_LABEL_NAME: "ERROR_LABEL_NAME",
  MAX_THREADS_PER_RUN: "MAX_THREADS_PER_RUN",
  LOOKBACK_DAYS: "LOOKBACK_DAYS",
  NOTIFICATION_EMAIL: "NOTIFICATION_EMAIL",
  FORCE_PROCESS_TEST_MODE: "FORCE_PROCESS_TEST_MODE",
  CREATE_TARGET_LABEL_IF_MISSING: "CREATE_TARGET_LABEL_IF_MISSING",
  DAILY_DIGEST_EMAIL: "DAILY_DIGEST_EMAIL",
  DAILY_DIGEST_HOUR: "DAILY_DIGEST_HOUR",
  DAILY_DIGEST_TIMEZONE: "DAILY_DIGEST_TIMEZONE",
  DAILY_DIGEST_OWNER_ALIASES: "DAILY_DIGEST_OWNER_ALIASES",
  GOOGLE_TASKS_LIST_NAME: "GOOGLE_TASKS_LIST_NAME",
  TASK_SYNC_ENABLED: "TASK_SYNC_ENABLED",
  TASK_SYNC_ALLOW_WEEKEND_TEST: "TASK_SYNC_ALLOW_WEEKEND_TEST",
} as const;

export const DEFAULTS = {
  OPENAI_MODEL: "gpt-4.1-mini",
  TARGET_LABEL_NAME: "Gemini Meeting Notes",
  PROCESSED_LABEL_NAME: "Meeting Ops Processed",
  ERROR_LABEL_NAME: "Meeting Ops Error",
  MAX_THREADS_PER_RUN: 3,
  MAX_FILES_PER_RUN: 3,
  LOOKBACK_DAYS: 14,
  DRIVE_LOOKBACK_DAYS: 14,
  NOTIFICATION_EMAIL: "josh@nivahealth.com",
  DAILY_DIGEST_EMAIL: "josh@nivahealth.com",
  DAILY_DIGEST_HOUR: 8,
  DAILY_DIGEST_TIMEZONE: "America/New_York",
  DAILY_DIGEST_OWNER_ALIASES: "Josh,Josh Hirsch,josh@nivahealth.com",
  GOOGLE_TASKS_LIST_NAME: "Meeting Ops Actions",
  TASK_SYNC_ENABLED: false,
  TASK_SYNC_ALLOW_WEEKEND_TEST: false,
} as const;

const REQUIRED_KEYS = [
  CONFIG_KEYS.OPENAI_API_KEY,
  CONFIG_KEYS.ACTION_SHEET_ID,
  CONFIG_KEYS.OUTPUT_FOLDER_ID,
] as const;

function getProp(key: string): string | null {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value && value.trim() !== "" ? value.trim() : null;
}

function getBoolProp(key: string, defaultValue = false): boolean {
  const raw = getProp(key);
  if (!raw) return defaultValue;
  return raw.toLowerCase() === "true" || raw === "1";
}

function getIntProp(key: string, defaultValue: number): number {
  const raw = getProp(key);
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getHourProp(key: string, defaultValue: number): number {
  const raw = getProp(key);
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) return defaultValue;
  return parsed;
}

function resolveSourceMode(): SourceMode {
  const explicit = getProp(CONFIG_KEYS.SOURCE_MODE)?.toLowerCase();
  if (explicit === "drive" || explicit === "gmail") return explicit;
  return getProp(CONFIG_KEYS.SOURCE_FOLDER_ID) ? "drive" : "gmail";
}

export function loadConfig(): MeetingOpsConfig {
  const openaiApiKey = getProp(CONFIG_KEYS.OPENAI_API_KEY);
  const actionSheetId = getProp(CONFIG_KEYS.ACTION_SHEET_ID);
  const outputFolderId = getProp(CONFIG_KEYS.OUTPUT_FOLDER_ID);

  if (!openaiApiKey) {
    throw new Error(`Missing required script property: ${CONFIG_KEYS.OPENAI_API_KEY}`);
  }
  if (!actionSheetId) {
    throw new Error(`Missing required script property: ${CONFIG_KEYS.ACTION_SHEET_ID}`);
  }
  if (!outputFolderId) {
    throw new Error(`Missing required script property: ${CONFIG_KEYS.OUTPUT_FOLDER_ID}`);
  }

  const sourceMode = resolveSourceMode();
  const sourceFolderId = getProp(CONFIG_KEYS.SOURCE_FOLDER_ID);

  if (sourceMode === "drive" && !sourceFolderId) {
    throw new Error(
      `SOURCE_MODE is drive but ${CONFIG_KEYS.SOURCE_FOLDER_ID} is not set`
    );
  }

  return {
    openaiApiKey,
    openaiModel: getProp(CONFIG_KEYS.OPENAI_MODEL) ?? DEFAULTS.OPENAI_MODEL,
    actionSheetId,
    outputFolderId,
    sourceMode,
    sourceFolderId,
    driveLookbackDays: getIntProp(
      CONFIG_KEYS.DRIVE_LOOKBACK_DAYS,
      DEFAULTS.DRIVE_LOOKBACK_DAYS
    ),
    maxFilesPerRun: getIntProp(CONFIG_KEYS.MAX_FILES_PER_RUN, DEFAULTS.MAX_FILES_PER_RUN),
    processRecordings: getBoolProp(CONFIG_KEYS.PROCESS_RECORDINGS, false),
    includeRecordingLink: getBoolProp(CONFIG_KEYS.INCLUDE_RECORDING_LINK, true),
    targetLabelName: getProp(CONFIG_KEYS.TARGET_LABEL_NAME) ?? DEFAULTS.TARGET_LABEL_NAME,
    processedLabelName:
      getProp(CONFIG_KEYS.PROCESSED_LABEL_NAME) ?? DEFAULTS.PROCESSED_LABEL_NAME,
    errorLabelName: getProp(CONFIG_KEYS.ERROR_LABEL_NAME) ?? DEFAULTS.ERROR_LABEL_NAME,
    maxThreadsPerRun: getIntProp(
      CONFIG_KEYS.MAX_THREADS_PER_RUN,
      DEFAULTS.MAX_THREADS_PER_RUN
    ),
    lookbackDays: getIntProp(CONFIG_KEYS.LOOKBACK_DAYS, DEFAULTS.LOOKBACK_DAYS),
    notificationEmail:
      getProp(CONFIG_KEYS.NOTIFICATION_EMAIL) ?? DEFAULTS.NOTIFICATION_EMAIL,
    forceProcessTestMode: getBoolProp(CONFIG_KEYS.FORCE_PROCESS_TEST_MODE, false),
    createTargetLabelIfMissing: getBoolProp(
      CONFIG_KEYS.CREATE_TARGET_LABEL_IF_MISSING,
      false
    ),
    dailyDigestEmail:
      getProp(CONFIG_KEYS.DAILY_DIGEST_EMAIL) ?? DEFAULTS.DAILY_DIGEST_EMAIL,
    dailyDigestHour: getHourProp(CONFIG_KEYS.DAILY_DIGEST_HOUR, DEFAULTS.DAILY_DIGEST_HOUR),
    dailyDigestTimezone:
      getProp(CONFIG_KEYS.DAILY_DIGEST_TIMEZONE) ?? DEFAULTS.DAILY_DIGEST_TIMEZONE,
    dailyDigestOwnerAliases: parseDigestOwnerAliases(
      getProp(CONFIG_KEYS.DAILY_DIGEST_OWNER_ALIASES) ??
        DEFAULTS.DAILY_DIGEST_OWNER_ALIASES
    ),
    googleTasksListName:
      getProp(CONFIG_KEYS.GOOGLE_TASKS_LIST_NAME) ?? DEFAULTS.GOOGLE_TASKS_LIST_NAME,
    taskSyncEnabled: getBoolProp(CONFIG_KEYS.TASK_SYNC_ENABLED, DEFAULTS.TASK_SYNC_ENABLED),
    taskSyncAllowWeekendTest: getBoolProp(
      CONFIG_KEYS.TASK_SYNC_ALLOW_WEEKEND_TEST,
      DEFAULTS.TASK_SYNC_ALLOW_WEEKEND_TEST
    ),
  };
}

export function tryLoadConfig(): MeetingOpsConfig | null {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

export function getConfigStatus(): ConfigKeyStatus[] {
  const allKeys = Object.values(CONFIG_KEYS);
  return allKeys.map((key) => {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    const present = Boolean(value && value.trim() !== "");
    const isSecret = key === CONFIG_KEYS.OPENAI_API_KEY;
    return {
      key,
      present,
      valuePreview: present
        ? isSecret
          ? "(set, hidden)"
          : value!.length > 80
            ? `${value!.slice(0, 77)}...`
            : value!
        : undefined,
    };
  });
}

export function validateRequiredConfig(): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!getProp(key)) missing.push(key);
  }
  const mode = resolveSourceMode();
  if (mode === "drive" && !getProp(CONFIG_KEYS.SOURCE_FOLDER_ID)) {
    missing.push(CONFIG_KEYS.SOURCE_FOLDER_ID);
  }
  return missing;
}

export function buildGmailSearchQuery(
  targetLabel: string,
  processedLabel: string,
  lookbackDays: number
): string {
  return [
    `label:"${targetLabel}"`,
    "from:gemini-notes@google.com",
    'subject:"Notes:"',
    `-label:"${processedLabel}"`,
    `newer_than:${lookbackDays}d`,
  ].join(" ");
}

