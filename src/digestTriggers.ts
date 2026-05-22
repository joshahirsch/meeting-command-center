import { loadConfig } from "./config";
import { logInfo } from "./logger";

/** Must match function names in EntryPoints.gs for time-driven triggers. */
const DIGEST_HANDLER = "sendDailyActionDigestEntrypoint";
const TASK_SYNC_HANDLER = "syncJoshActionItemsToGoogleTasksEntrypoint";

export function installDailyDigestTrigger(): void {
  const config = loadConfig();
  removeTriggersForHandler(DIGEST_HANDLER);

  ScriptApp.newTrigger(DIGEST_HANDLER)
    .timeBased()
    .atHour(config.dailyDigestHour)
    .everyDays(1)
    .inTimezone(config.dailyDigestTimezone)
    .create();

  logInfo("Installed daily digest trigger", {
    handler: DIGEST_HANDLER,
    hour: config.dailyDigestHour,
    timezone: config.dailyDigestTimezone,
  });
}

export function installGoogleTasksSyncTrigger(): void {
  const config = loadConfig();
  removeTriggersForHandler(TASK_SYNC_HANDLER);

  const syncHour = (config.dailyDigestHour + 1) % 24;

  ScriptApp.newTrigger(TASK_SYNC_HANDLER)
    .timeBased()
    .atHour(syncHour)
    .everyDays(1)
    .inTimezone(config.dailyDigestTimezone)
    .create();

  logInfo("Installed Google Tasks sync trigger", {
    handler: TASK_SYNC_HANDLER,
    hour: syncHour,
    timezone: config.dailyDigestTimezone,
  });
}

function removeTriggersForHandler(handler: string): void {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  }
  logInfo("Removed triggers for handler", { handler, removed });
}
