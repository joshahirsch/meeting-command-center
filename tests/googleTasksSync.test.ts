import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingOpsConfig } from "../src/types";

const { loadConfig, logInfo, appendProcessingLog } = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  logInfo: vi.fn(),
  appendProcessingLog: vi.fn(),
}));

vi.mock("../src/config", () => ({
  loadConfig,
}));

vi.mock("../src/logger", () => ({
  logInfo,
  logWarn: vi.fn(),
  formatError: (err: unknown) => String(err),
}));

vi.mock("../src/sheets", () => ({
  appendProcessingLog,
}));

vi.mock("../src/actionItemsSheet", () => ({
  readActionItemSyncEntries: vi.fn(() => []),
  updateActionItemSyncFields: vi.fn(),
}));

vi.stubGlobal("Tasks", {
  Tasklists: {
    list: vi.fn(() => ({ items: [{ title: "Meeting Ops Actions", id: "list1" }] })),
    insert: vi.fn(),
  },
  Tasks: {
    insert: vi.fn(() => ({ id: "task-1" })),
  },
});

import { syncJoshActionItemsToGoogleTasks } from "../src/googleTasksSync";

function baseConfig(overrides: Partial<MeetingOpsConfig> = {}): MeetingOpsConfig {
  return {
    openaiApiKey: "key",
    openaiModel: "gpt-4.1-mini",
    actionSheetId: "sheet",
    outputFolderId: "folder",
    sourceMode: "gmail",
    sourceFolderId: null,
    driveLookbackDays: 14,
    maxFilesPerRun: 3,
    processRecordings: false,
    includeRecordingLink: true,
    targetLabelName: "Gemini Meeting Notes",
    processedLabelName: "Meeting Ops Processed",
    errorLabelName: "Meeting Ops Error",
    maxThreadsPerRun: 3,
    lookbackDays: 14,
    notificationEmail: "josh@nivahealth.com",
    forceProcessTestMode: false,
    createTargetLabelIfMissing: false,
    dailyDigestEmail: "josh@nivahealth.com",
    dailyDigestHour: 8,
    dailyDigestTimezone: "America/New_York",
    dailyDigestOwnerAliases: ["Josh"],
    googleTasksListName: "Meeting Ops Actions",
    taskSyncEnabled: true,
    taskSyncAllowWeekendTest: false,
    ...overrides,
  };
}

function expectTaskSyncStarted(): void {
  expect(appendProcessingLog).toHaveBeenCalledWith(
    expect.anything(),
    "INFO",
    "task_sync_started",
    "Google Tasks sync run started",
    {}
  );
}

describe("syncJoshActionItemsToGoogleTasks weekend behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReturnValue(baseConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips on weekend when TASK_SYNC_ALLOW_WEEKEND_TEST is false", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 24)); // Sunday
    loadConfig.mockReturnValue(baseConfig({ taskSyncAllowWeekendTest: false }));

    syncJoshActionItemsToGoogleTasks();

    expect(logInfo).toHaveBeenCalledWith("Skipping Google Tasks sync on weekend", {});
    expect(appendProcessingLog).not.toHaveBeenCalled();
  });

  it("runs on weekend when TASK_SYNC_ALLOW_WEEKEND_TEST is true", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 24)); // Sunday
    loadConfig.mockReturnValue(baseConfig({ taskSyncAllowWeekendTest: true }));

    syncJoshActionItemsToGoogleTasks();

    expect(logInfo).toHaveBeenCalledWith(
      "Running Google Tasks sync on weekend because TASK_SYNC_ALLOW_WEEKEND_TEST=true",
      {}
    );
    expectTaskSyncStarted();
  });

  it("runs normally on a weekday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 21)); // Thursday
    loadConfig.mockReturnValue(baseConfig({ taskSyncAllowWeekendTest: false }));

    syncJoshActionItemsToGoogleTasks();

    expect(logInfo).not.toHaveBeenCalledWith("Skipping Google Tasks sync on weekend", {});
    expect(logInfo).not.toHaveBeenCalledWith(
      "Running Google Tasks sync on weekend because TASK_SYNC_ALLOW_WEEKEND_TEST=true",
      {}
    );
    expectTaskSyncStarted();
  });
});
