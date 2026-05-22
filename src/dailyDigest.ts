import {
  buildDigestEmailSubject,
  collectDigestIncludedRows,
  filterDigestOwnedEntries,
  groupActionItemsForDigest,
  isWeekday,
  renderDigestEmailHtml,
  renderDigestEmailPlainText,
} from "./actionItemsLogic";
import {
  getActionItemsTabUrl,
  markDigestIncluded,
  readOpenActionItemsForDigest,
} from "./actionItemsSheet";
import { loadConfig } from "./config";
import { formatError, logInfo, logWarn } from "./logger";
import { appendProcessingLog } from "./sheets";
import type { MeetingOpsConfig } from "./types";

function resolveDigestToday(config: MeetingOpsConfig): Date {
  const tz = config.dailyDigestTimezone;
  const now = new Date();
  const formatted = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const parts = formatted.split("-").map((p) => parseInt(p, 10));
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function sendDailyActionDigest(): void {
  const config = loadConfig();
  const today = resolveDigestToday(config);

  if (!isWeekday(today)) {
    logInfo("Skipping daily digest on weekend", { date: today.toISOString() });
    return;
  }

  const email = config.dailyDigestEmail.trim();
  if (!email) {
    throw new Error("DAILY_DIGEST_EMAIL is not set");
  }

  appendProcessingLog(config, "INFO", "digest_started", "Daily action digest run started", {});

  try {
    const allEntries = readOpenActionItemsForDigest(config);
    const joshEntries = filterDigestOwnedEntries(
      allEntries,
      config.dailyDigestOwnerAliases
    );
    const { groups, counts } = groupActionItemsForDigest(joshEntries, today);
    const actionItemsTabUrl = getActionItemsTabUrl(config);
    const html = renderDigestEmailHtml(groups, counts, actionItemsTabUrl, {
      today,
      timezone: config.dailyDigestTimezone,
    });
    const subject = buildDigestEmailSubject(today);

    const plainBody = renderDigestEmailPlainText(groups, counts, actionItemsTabUrl, {
      today,
      timezone: config.dailyDigestTimezone,
    });

    MailApp.sendEmail({
      to: email,
      subject,
      body: plainBody,
      htmlBody: html,
    });

    const includedAt = Utilities.formatDate(
      new Date(),
      config.dailyDigestTimezone,
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    );
    markDigestIncluded(config, collectDigestIncludedRows(groups), includedAt);

    appendProcessingLog(
      config,
      "INFO",
      "digest_sent",
      `Daily digest emailed to ${email}`,
      {}
    );
    logInfo("Daily action digest sent", { recipient: email, subject });
  } catch (err) {
    const detail = formatError(err);
    appendProcessingLog(config, "ERROR", "digest_failed", detail, {});
    logWarn("Daily action digest failed", { error: detail });
    throw err;
  }
}
