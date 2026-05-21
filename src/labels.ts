import { logInfo, logWarn } from "./logger";
import type { MeetingOpsConfig } from "./types";

function findLabelByName(name: string): GoogleAppsScript.Gmail.GmailLabel | null {
  const labels = GmailApp.getUserLabels();
  for (const label of labels) {
    if (label.getName() === name) return label;
  }
  return null;
}

export function getOrCreateLabel(
  name: string,
  createIfMissing: boolean
): GoogleAppsScript.Gmail.GmailLabel | null {
  const existing = findLabelByName(name);
  if (existing) return existing;
  if (!createIfMissing) return null;
  logInfo("Creating Gmail label", { name });
  return GmailApp.createLabel(name);
}

export function ensureProcessingLabels(config: MeetingOpsConfig): {
  target: GoogleAppsScript.Gmail.GmailLabel | null;
  processed: GoogleAppsScript.Gmail.GmailLabel;
  error: GoogleAppsScript.Gmail.GmailLabel;
} {
  const target = getOrCreateLabel(
    config.targetLabelName,
    config.createTargetLabelIfMissing
  );
  if (!target) {
    throw new Error(
      `Target label not found: "${config.targetLabelName}". Apply it in Gmail or set CREATE_TARGET_LABEL_IF_MISSING=true.`
    );
  }

  const processed = getOrCreateLabel(config.processedLabelName, true);
  if (!processed) {
    throw new Error(`Could not resolve processed label: ${config.processedLabelName}`);
  }
  if (!findLabelByName(config.processedLabelName)) {
    logWarn("Processed label was created by automation", {
      label: config.processedLabelName,
    });
  }

  const error = getOrCreateLabel(config.errorLabelName, true);
  if (!error) {
    throw new Error(`Could not resolve error label: ${config.errorLabelName}`);
  }

  return { target, processed, error };
}

export function threadHasLabel(
  thread: GoogleAppsScript.Gmail.GmailThread,
  label: GoogleAppsScript.Gmail.GmailLabel
): boolean {
  const names = thread.getLabels().map((l) => l.getName());
  return names.includes(label.getName());
}

export function applyLabelToThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  label: GoogleAppsScript.Gmail.GmailLabel
): void {
  thread.addLabel(label);
}

export function removeLabelFromThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  label: GoogleAppsScript.Gmail.GmailLabel
): void {
  thread.removeLabel(label);
}

export function markThreadProcessed(
  thread: GoogleAppsScript.Gmail.GmailThread,
  processed: GoogleAppsScript.Gmail.GmailLabel,
  error: GoogleAppsScript.Gmail.GmailLabel
): void {
  applyLabelToThread(thread, processed);
  if (threadHasLabel(thread, error)) {
    removeLabelFromThread(thread, error);
  }
}

export function markThreadError(
  thread: GoogleAppsScript.Gmail.GmailThread,
  error: GoogleAppsScript.Gmail.GmailLabel
): void {
  applyLabelToThread(thread, error);
}
