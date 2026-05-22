/** Action Items tab columns for digest + Google Tasks sync (appended by setup). */
export const SYNC_COLUMN_HEADERS = [
  "googleTaskId",
  "googleTaskListId",
  "taskSyncedAt",
  "taskSyncStatus",
  "lastTaskSyncError",
  "dailyDigestIncludedAt",
] as const;

export type SyncColumnHeader = (typeof SYNC_COLUMN_HEADERS)[number];
