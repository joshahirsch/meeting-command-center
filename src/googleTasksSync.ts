import {
  buildGoogleTaskNotes,
  buildGoogleTaskTitle,
  formatGoogleTaskDueRfc3339,
  hasSyncedGoogleTask,
  isEligibleForGoogleTasksSync,
  isWeekday,
} from "./actionItemsLogic";
import { readActionItemSyncEntries, updateActionItemSyncFields } from "./actionItemsSheet";
import { loadConfig } from "./config";
import { formatError, logInfo, logWarn } from "./logger";
import { appendProcessingLog } from "./sheets";

function getTasksApi(): GoogleAppsScript.Tasks {
  if (typeof Tasks === "undefined") {
    throw new Error(
      "Google Tasks advanced service is not enabled. Enable Tasks API v1 in Apps Script project settings."
    );
  }
  const api = Tasks;
  if (!api.Tasklists?.list || !api.Tasklists.insert || !api.Tasks?.insert) {
    throw new Error("Google Tasks advanced service is incomplete. Re-enable Tasks API v1.");
  }
  return api;
}

export function findOrCreateTaskList(listName: string): string {
  const tasks = getTasksApi();
  const tasklists = tasks.Tasklists!;
  let pageToken: string | undefined;
  do {
    const response = tasklists.list({
      maxResults: 100,
      pageToken,
    });
    const lists = response.items ?? [];
    for (const list of lists) {
      if (list.title === listName && list.id) return list.id;
    }
    pageToken = response.nextPageToken ?? undefined;
  } while (pageToken);

  const created = tasklists.insert({ title: listName });
  if (!created.id) {
    throw new Error(`Failed to create Google Tasks list: ${listName}`);
  }
  return created.id;
}

export function insertGoogleTask(
  taskListId: string,
  title: string,
  notes: string,
  dueRfc3339?: string
): string {
  const tasksApi = getTasksApi();
  const tasksResource = tasksApi.Tasks!;
  const task: GoogleAppsScript.Tasks.Schema.Task = {
    title,
    notes,
    status: "needsAction",
  };
  if (dueRfc3339) task.due = dueRfc3339;

  const created = tasksResource.insert(task, taskListId);
  if (!created.id) {
    throw new Error("Google Tasks insert returned no task id");
  }
  return created.id;
}

export function syncJoshActionItemsToGoogleTasks(): void {
  const config = loadConfig();

  if (!config.taskSyncEnabled) {
    logInfo("Google Tasks sync disabled (TASK_SYNC_ENABLED)", {});
    return;
  }

  const today = new Date();
  if (!isWeekday(today)) {
    logInfo("Skipping Google Tasks sync on weekend", {});
    return;
  }

  const listName = config.googleTasksListName.trim();
  if (!listName) {
    throw new Error("GOOGLE_TASKS_LIST_NAME is not set");
  }

  appendProcessingLog(config, "INFO", "task_sync_started", "Google Tasks sync run started", {});

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const taskListId = findOrCreateTaskList(listName);
    const entries = readActionItemSyncEntries(config);

    for (const entry of entries) {
      if (hasSyncedGoogleTask(entry.googleTaskId)) {
        skipped++;
        continue;
      }
      if (!isEligibleForGoogleTasksSync(entry, today)) {
        skipped++;
        continue;
      }

      try {
        const title = buildGoogleTaskTitle(entry.actionItem);
        const notes = buildGoogleTaskNotes(entry);
        const due = formatGoogleTaskDueRfc3339(entry.dueDate);
        const taskId = insertGoogleTask(taskListId, title, notes, due);
        const syncedAt = new Date().toISOString();

        updateActionItemSyncFields(config, entry.rowNumber, {
          googleTaskId: taskId,
          googleTaskListId: taskListId,
          taskSyncedAt: syncedAt,
          taskSyncStatus: "synced",
          lastTaskSyncError: "",
        });
        synced++;
      } catch (err) {
        failed++;
        const detail = formatError(err);
        updateActionItemSyncFields(config, entry.rowNumber, {
          taskSyncStatus: "error",
          lastTaskSyncError: detail,
        });
        logWarn("Failed to sync action item to Google Tasks", {
          rowNumber: entry.rowNumber,
          error: detail,
        });
      }
    }

    appendProcessingLog(
      config,
      "INFO",
      "task_sync_completed",
      `synced=${synced} skipped=${skipped} failed=${failed}`,
      {}
    );
    logInfo("Google Tasks sync completed", { synced, skipped, failed, taskListId });
  } catch (err) {
    const detail = formatError(err);
    appendProcessingLog(config, "ERROR", "task_sync_failed", detail, {});
    throw err;
  }
}
