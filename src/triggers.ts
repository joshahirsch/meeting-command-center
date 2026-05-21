import { logInfo } from "./logger";

const TRIGGER_HANDLER = "runMeetingOps";

export function installMeetingOpsTrigger(): void {
  removeMeetingOpsTriggers();

  // Apps Script allows 1-minute triggers only for certain cases; 15 min is standard.
  ScriptApp.newTrigger(TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(15)
    .create();

  logInfo("Installed time-driven trigger", { handler: TRIGGER_HANDLER, interval: "15 minutes" });
}

export function removeMeetingOpsTriggers(): void {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  }
  logInfo("Removed meeting ops triggers", { removed });
}
