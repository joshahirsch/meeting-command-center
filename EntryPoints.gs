function runMeetingOpsEntrypoint() {
  return globalThis.runMeetingOps();
}

function runDriveMeetingOpsEntrypoint() {
  return globalThis.runDriveMeetingOps();
}

function dryRunLatestMeetingNoteEntrypoint() {
  return globalThis.dryRunLatestMeetingNote();
}

function dryRunLatestDriveMeetingNoteEntrypoint() {
  return globalThis.dryRunLatestDriveMeetingNote();
}

function setupMeetingOpsSheetsEntrypoint() {
  return globalThis.setupMeetingOpsSheets();
}

function showConfigStatusEntrypoint() {
  return globalThis.showConfigStatus();
}

function installMeetingOpsTriggerEntrypoint() {
  ScriptApp.newTrigger("runMeetingOpsEntrypoint")
    .timeBased()
    .everyHours(1)
    .create();
}

function removeMeetingOpsTriggersEntrypoint() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    const handler = trigger.getHandlerFunction();
    if (
      handler === "runMeetingOpsEntrypoint" ||
      handler === "runDriveMeetingOpsEntrypoint"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

function sendDailyActionDigestEntrypoint() {
  return globalThis.sendDailyActionDigest();
}

function syncJoshActionItemsToGoogleTasksEntrypoint() {
  return globalThis.syncJoshActionItemsToGoogleTasks();
}

function installDailyDigestTriggerEntrypoint() {
  return globalThis.installDailyDigestTrigger();
}

function installGoogleTasksSyncTriggerEntrypoint() {
  return globalThis.installGoogleTasksSyncTrigger();
}
