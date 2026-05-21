import { buildGmailSearchQuery } from "./config";
import { findLatestGeminiMessageInThread } from "./extract";
import { threadHasLabel } from "./labels";
import { logInfo } from "./logger";
import type { GmailCandidate, MeetingOpsConfig } from "./types";

export function searchUnprocessedCandidates(
  config: MeetingOpsConfig,
  processedLabel: GoogleAppsScript.Gmail.GmailLabel,
  maxResults: number
): GmailCandidate[] {
  const query = buildGmailSearchQuery(
    config.targetLabelName,
    config.processedLabelName,
    config.lookbackDays
  );
  logInfo("Gmail search", { query, maxResults });

  const threads = GmailApp.search(query, 0, maxResults * 2);
  const candidates: GmailCandidate[] = [];

  const sorted = threads.sort((a, b) => {
    const aDate = a.getLastMessageDate().getTime();
    const bDate = b.getLastMessageDate().getTime();
    return bDate - aDate;
  });

  for (const thread of sorted) {
    if (threadHasLabel(thread, processedLabel)) continue;

    const message = findLatestGeminiMessageInThread(thread);
    if (!message) continue;

    candidates.push({
      threadId: thread.getId(),
      messageId: message.getId(),
      thread,
      message,
    });

    if (candidates.length >= maxResults) break;
  }

  return candidates;
}

export function getThreadById(threadId: string): GoogleAppsScript.Gmail.GmailThread {
  const thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error(`Gmail thread not found: ${threadId}`);
  return thread;
}

export function buildCandidateFromThread(
  thread: GoogleAppsScript.Gmail.GmailThread
): GmailCandidate {
  const message = findLatestGeminiMessageInThread(thread);
  if (!message) {
    throw new Error("No gemini-notes@google.com message found in thread");
  }
  return {
    threadId: thread.getId(),
    messageId: message.getId(),
    thread,
    message,
  };
}

export function findLatestCandidate(
  config: MeetingOpsConfig,
  processedLabel: GoogleAppsScript.Gmail.GmailLabel
): GmailCandidate | null {
  const list = searchUnprocessedCandidates(config, processedLabel, 1);
  return list.length > 0 ? list[0] : null;
}
