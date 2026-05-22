import type { ActionStatus } from "./types";

export const JOSH_OWNER_ALIASES = ["josh", "joshua"] as const;

export const OPEN_STATUSES: ActionStatus[] = ["New", "In Progress", "Waiting"];

export const ACTIONABLE_BLANK_OWNER_STATUSES: ActionStatus[] = ["New", "In Progress"];

export const DEFAULT_DIGEST_OWNER_ALIASES = [
  "Josh",
  "Josh Hirsch",
  "josh@nivahealth.com",
] as const;

export const DIGEST_EXCLUDED_OWNER_LABELS = ["the group"] as const;

export type DigestSectionKey =
  | "overdue"
  | "dueToday"
  | "upcoming7Days"
  | "highPriority"
  | "newSinceYesterday"
  | "backlogSample";

export type DigestGroups = Record<DigestSectionKey, ActionItemDigestEntry[]>;

export interface DigestCounts {
  totalJoshOwnedOpen: number;
  overdue: number;
  dueToday: number;
  upcoming7Days: number;
  shownInDigest: number;
  backlogNotShown: number;
}

export interface DigestBuildResult {
  groups: DigestGroups;
  counts: DigestCounts;
}

export const DIGEST_SECTION_CAPS: Partial<Record<DigestSectionKey, number>> = {
  highPriority: 5,
  newSinceYesterday: 5,
  backlogSample: 8,
};

export const DIGEST_ACTION_TEXT_MAX_LEN = 140;

export interface ActionItemDigestEntry {
  rowNumber: number;
  meetingTitle: string;
  actionItem: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
  meetingDate: string;
  summaryDocLink: string;
  sourceDocLink: string;
  sheetRowUrl: string;
  createdAtMs: number | null;
}

export interface ActionItemSyncEntry extends ActionItemDigestEntry {
  googleTaskId: string;
  googleTaskListId: string;
}

export interface DigestRenderContext {
  today: Date;
  timezone: string;
}

export function normalizeOwner(owner: string): string {
  return owner.trim();
}

export function parseDigestOwnerAliases(value: string): string[];
export function parseDigestOwnerAliases(value: readonly string[]): string[];
export function parseDigestOwnerAliases(
  value: string | readonly string[]
): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }
  return value.map((a) => a.trim()).filter((a) => a.length > 0);
}

export function parseOwnerTokens(owner: string): string[] {
  return owner
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function normalizeOwnerToken(token: string): string {
  return token.trim().toLowerCase();
}

export function isExcludedDigestOwnerLabel(owner: string): boolean {
  const normalized = normalizeOwner(owner).toLowerCase();
  return (DIGEST_EXCLUDED_OWNER_LABELS as readonly string[]).includes(normalized);
}

export function ownerTokenMatchesDigestAlias(
  token: string,
  aliases: readonly string[]
): boolean {
  const normToken = normalizeOwnerToken(token);
  return aliases.some((alias) => normalizeOwnerToken(alias) === normToken);
}

export function isDigestOwnedItem(
  owner: string,
  aliases: readonly string[] = DEFAULT_DIGEST_OWNER_ALIASES
): boolean {
  const trimmed = normalizeOwner(owner);
  if (!trimmed) return false;

  const tokens = parseOwnerTokens(trimmed);
  if (tokens.length === 0) return false;

  return tokens.some((token) => {
    if (isExcludedDigestOwnerLabel(token)) return false;
    return ownerTokenMatchesDigestAlias(token, aliases);
  });
}

export function filterDigestOwnedEntries(
  entries: ActionItemDigestEntry[],
  aliases: readonly string[] = DEFAULT_DIGEST_OWNER_ALIASES
): ActionItemDigestEntry[] {
  return entries.filter(
    (entry) => isOpenStatus(entry.status) && isDigestOwnedItem(entry.owner, aliases)
  );
}

export function isJoshOwner(owner: string): boolean {
  const normalized = normalizeOwner(owner).toLowerCase();
  if (!normalized) return false;
  return JOSH_OWNER_ALIASES.some(
    (alias) => normalized === alias || normalized.startsWith(`${alias} `)
  );
}

export function isBlankButActionable(owner: string, status: string): boolean {
  if (normalizeOwner(owner).length > 0) return false;
  return ACTIONABLE_BLANK_OWNER_STATUSES.includes(status.trim() as ActionStatus);
}

export function isOpenStatus(status: string): boolean {
  const s = status.trim();
  return s !== "Done" && s !== "Deferred" && s.length > 0;
}

export function isWaitingStatus(status: string): boolean {
  return status.trim() === "Waiting";
}

export function parseDueDateYmd(dueDate: string): Date | null {
  const trimmed = dueDate.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d;
}

/** Parses sheet due values: YYYY-MM-DD, ISO datetimes, or JS Date strings. */
export function parseDueDate(dueDate: string): Date | null {
  const trimmed = dueDate.trim();
  if (!trimmed) return null;

  const ymd = parseDueDateYmd(trimmed);
  if (ymd) return ymd;

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const iso = new Date(trimmed);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

export function dueDateHasMeaningfulTime(dueDate: string, timezone: string): boolean {
  const trimmed = dueDate.trim();
  if (!trimmed || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const due = parseDueDate(trimmed);
  if (!due) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(due);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour !== 0 || minute !== 0;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function isOverdue(dueDate: string, today: Date): boolean {
  const due = parseDueDate(dueDate);
  if (!due) return false;
  return startOfLocalDay(due).getTime() < startOfLocalDay(today).getTime();
}

export function isDueToday(dueDate: string, today: Date): boolean {
  const due = parseDueDate(dueDate);
  if (!due) return false;
  return startOfLocalDay(due).getTime() === startOfLocalDay(today).getTime();
}

export function isDueWithinNext7Days(dueDate: string, today: Date): boolean {
  const due = parseDueDate(dueDate);
  if (!due) return false;
  const start = startOfLocalDay(today).getTime();
  const dueStart = startOfLocalDay(due).getTime();
  if (dueStart <= start) return false;
  const end = addDays(startOfLocalDay(today), 7).getTime();
  return dueStart <= end;
}

export function isHighPriority(priority: string): boolean {
  return priority.trim().toLowerCase() === "high";
}

export function isNewSinceYesterday(createdAtMs: number | null, today: Date): boolean {
  if (createdAtMs === null) return false;
  const yesterdayStart = addDays(startOfLocalDay(today), -1).getTime();
  return createdAtMs >= yesterdayStart;
}

export function hasSyncedGoogleTask(googleTaskId: string): boolean {
  return googleTaskId.trim().length > 0;
}

export function isEligibleForGoogleTasksSync(entry: ActionItemSyncEntry, today: Date): boolean {
  if (!isOpenStatus(entry.status)) return false;
  if (!isJoshOwner(entry.owner) && !isBlankButActionable(entry.owner, entry.status)) {
    return false;
  }
  if (hasSyncedGoogleTask(entry.googleTaskId)) return false;
  if (isWaitingStatus(entry.status)) return false;

  if (isHighPriority(entry.priority)) return true;
  if (isOverdue(entry.dueDate, today)) return true;
  if (isDueToday(entry.dueDate, today)) return true;
  if (isDueWithinNext7Days(entry.dueDate, today)) return true;
  return false;
}

export function resolveDigestSection(
  entry: ActionItemDigestEntry,
  today: Date
): DigestSectionKey | null {
  if (!isOpenStatus(entry.status)) return null;

  if (isOverdue(entry.dueDate, today)) return "overdue";
  if (isDueToday(entry.dueDate, today)) return "dueToday";
  if (isDueWithinNext7Days(entry.dueDate, today)) return "upcoming7Days";
  if (isHighPriority(entry.priority)) return "highPriority";
  if (isNewSinceYesterday(entry.createdAtMs, today)) return "newSinceYesterday";
  return "backlogSample";
}

function emptyDigestGroups(): DigestGroups {
  return {
    overdue: [],
    dueToday: [],
    upcoming7Days: [],
    highPriority: [],
    newSinceYesterday: [],
    backlogSample: [],
  };
}

export function orderBacklogSampleForDigest(
  items: ActionItemDigestEntry[]
): ActionItemDigestEntry[] {
  const meetingKey = (item: ActionItemDigestEntry) =>
    item.meetingTitle.trim() || "(untitled)";
  return [...items].sort((a, b) => {
    const meetingCmp = meetingKey(a).localeCompare(meetingKey(b));
    if (meetingCmp !== 0) return meetingCmp;
    return a.rowNumber - b.rowNumber;
  });
}

function applyDigestSectionCap(
  items: ActionItemDigestEntry[],
  key: DigestSectionKey
): ActionItemDigestEntry[] {
  const cap = DIGEST_SECTION_CAPS[key];
  if (cap === undefined) return items;
  if (key === "backlogSample") {
    return orderBacklogSampleForDigest(items).slice(0, cap);
  }
  return items.slice(0, cap);
}

export function groupActionItemsForDigest(
  entries: ActionItemDigestEntry[],
  today: Date
): DigestBuildResult {
  const fullBuckets: DigestGroups = emptyDigestGroups();

  for (const entry of entries) {
    const section = resolveDigestSection(entry, today);
    if (section) fullBuckets[section].push(entry);
  }

  const groups: DigestGroups = emptyDigestGroups();
  for (const key of Object.keys(fullBuckets) as DigestSectionKey[]) {
    groups[key] = applyDigestSectionCap(fullBuckets[key], key);
  }

  const shownInDigest = collectDigestIncludedRows(groups).length;
  const counts: DigestCounts = {
    totalJoshOwnedOpen: entries.length,
    overdue: fullBuckets.overdue.length,
    dueToday: fullBuckets.dueToday.length,
    upcoming7Days: fullBuckets.upcoming7Days.length,
    shownInDigest,
    backlogNotShown: Math.max(0, entries.length - shownInDigest),
  };

  return { groups, counts };
}

export function collectDigestIncludedRows(groups: DigestGroups): ActionItemDigestEntry[] {
  const order: DigestSectionKey[] = [
    "overdue",
    "dueToday",
    "upcoming7Days",
    "highPriority",
    "newSinceYesterday",
    "backlogSample",
  ];
  const seen = new Set<number>();
  const unique: ActionItemDigestEntry[] = [];
  for (const key of order) {
    for (const entry of groups[key]) {
      if (seen.has(entry.rowNumber)) continue;
      seen.add(entry.rowNumber);
      unique.push(entry);
    }
  }
  return unique;
}

export function buildSheetRowUrl(sheetId: string, sheetGid: number, rowNumber: number): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${sheetGid}&range=A${rowNumber}`;
}

export function buildGoogleTaskNotes(entry: ActionItemDigestEntry): string {
  const lines: string[] = [
    `Meeting: ${entry.meetingTitle || "(untitled)"}`,
    `Meeting date: ${entry.meetingDate || "—"}`,
    `Sheet row: ${entry.sheetRowUrl}`,
  ];
  if (entry.summaryDocLink.trim()) {
    lines.push(`Summary doc: ${entry.summaryDocLink.trim()}`);
  }
  if (entry.sourceDocLink.trim()) {
    lines.push(`Source doc: ${entry.sourceDocLink.trim()}`);
  }
  return lines.join("\n");
}

export function buildGoogleTaskTitle(actionItem: string, maxLen = 1024): string {
  const trimmed = actionItem.trim() || "(no action text)";
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1)}…`;
}

export function formatGoogleTaskDueRfc3339(dueDate: string): string | undefined {
  const due = parseDueDateYmd(dueDate);
  if (!due) return undefined;
  const y = due.getFullYear();
  const m = String(due.getMonth() + 1).padStart(2, "0");
  const d = String(due.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

export function buildDigestEmailSubject(today: Date): string {
  const label = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Meeting Ops — Action Items Digest (${label})`;
}

const SECTION_TITLES: Record<DigestSectionKey, string> = {
  overdue: "Overdue",
  dueToday: "Due today",
  upcoming7Days: "Due this week",
  highPriority: "High priority",
  newSinceYesterday: "New since yesterday",
  backlogSample: "Project backlog sample",
};

export function truncateDigestActionText(
  actionItem: string,
  maxLen = DIGEST_ACTION_TEXT_MAX_LEN
): string {
  const trimmed = actionItem.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function shouldShowDigestStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "waiting" || normalized === "deferred" || normalized === "blocked";
}

function formatDigestTime(due: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(due);
}

function formatDigestWeekdayMonthDay(due: Date, timezone: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(due);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(due);
  return `${weekday}, ${monthDay}`;
}

function calendarDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export function formatDigestDueDate(
  dueDate: string,
  today: Date,
  timezone: string
): string {
  const due = parseDueDate(dueDate);
  if (!due) return "";

  const hasTime = dueDateHasMeaningfulTime(dueDate, timezone);
  const dueKey = calendarDayKey(due, timezone);
  const todayKey = calendarDayKey(today, timezone);
  const tomorrowKey = calendarDayKey(addDays(startOfLocalDay(today), 1), timezone);

  if (dueKey === todayKey) {
    return hasTime ? `Today, ${formatDigestTime(due, timezone)}` : "Today";
  }
  if (dueKey === tomorrowKey) {
    return "Tomorrow";
  }

  const label = formatDigestWeekdayMonthDay(due, timezone);
  return hasTime ? `${label}, ${formatDigestTime(due, timezone)}` : label;
}

/** Section order for Recommended focus recap (excludes backlog sample). */
export const RECOMMENDED_FOCUS_SECTION_ORDER: readonly DigestSectionKey[] = [
  "overdue",
  "dueToday",
  "upcoming7Days",
  "highPriority",
  "newSinceYesterday",
] as const;

export function pickRecommendedFocusItems(
  groups: DigestGroups,
  maxItems = 3
): ActionItemDigestEntry[] {
  const picked: ActionItemDigestEntry[] = [];
  const seen = new Set<number>();
  for (const key of RECOMMENDED_FOCUS_SECTION_ORDER) {
    for (const item of groups[key]) {
      if (seen.has(item.rowNumber)) continue;
      seen.add(item.rowNumber);
      picked.push(item);
      if (picked.length >= maxItems) return picked;
    }
  }
  return picked;
}

export function buildDigestItemMetadataLine(
  item: ActionItemDigestEntry,
  context: DigestRenderContext
): string {
  const parts: string[] = [];
  if (item.dueDate.trim()) {
    const dueLabel = formatDigestDueDate(item.dueDate, context.today, context.timezone);
    if (dueLabel) parts.push(dueLabel);
  }
  parts.push(item.meetingTitle.trim() || "(untitled)");
  if (shouldShowDigestStatus(item.status)) {
    parts.push(item.status.trim());
  }
  return parts.join(" · ");
}

const DIGEST_EMAIL_WRAPPER_STYLE =
  "font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:14px;line-height:1.4;max-width:640px;";
const DIGEST_SECTION_DIVIDER =
  '<div style="border-top:1px solid #e8e8e8;margin:20px 0 16px 0;"></div>';
const DIGEST_ITEM_CARD_STYLE =
  "padding:10px 12px;border:1px solid #e8e8e8;border-radius:4px;background:#fafafa;";

export function renderDigestItemHtml(
  item: ActionItemDigestEntry,
  context: DigestRenderContext
): string {
  const action = escapeHtml(truncateDigestActionText(item.actionItem));
  const metadata = escapeHtml(buildDigestItemMetadataLine(item, context));
  const metadataLine = metadata
    ? `<div style="font-size:12px;color:#666;margin-top:4px;line-height:1.35;">${metadata}</div>`
    : "";
  const openLink = `<a href="${escapeAttr(item.sheetRowUrl)}" style="font-size:12px;color:#1a73e8;text-decoration:none;">Open</a>`;

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="margin:0 0 8px 0;border-collapse:collapse;"><tr><td style="${DIGEST_ITEM_CARD_STYLE}">` +
    `<div style="font-size:15px;color:#1a1a1a;line-height:1.35;">${action}</div>` +
    `${metadataLine}` +
    `<div style="margin-top:6px;">${openLink}</div>` +
    `</td></tr></table>`
  );
}

export function renderDigestRecommendedFocusHtml(
  items: ActionItemDigestEntry[],
  context: DigestRenderContext
): string {
  if (items.length === 0) return "";
  const rows = items.map((item) => renderDigestItemHtml(item, context)).join("");
  return (
    `<p style="font-weight:bold;font-size:14px;margin:0 0 10px 0;">Recommended focus</p>${rows}`
  );
}

export function renderDigestSectionHtml(
  key: DigestSectionKey,
  items: ActionItemDigestEntry[],
  context: DigestRenderContext
): string {
  if (items.length === 0) return "";

  const header = `<p style="font-weight:bold;font-size:14px;margin:0 0 10px 0;">${escapeHtml(SECTION_TITLES[key])} (${items.length})</p>`;

  if (key === "backlogSample") {
    const grouped = new Map<string, ActionItemDigestEntry[]>();
    for (const item of items) {
      const meeting = item.meetingTitle.trim() || "(untitled)";
      const list = grouped.get(meeting) ?? [];
      list.push(item);
      grouped.set(meeting, list);
    }
    const meetingBlocks = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([meeting, meetingItems]) => {
        const rows = meetingItems
          .map((item) => renderDigestItemHtml(item, context))
          .join("");
        return (
          `<p style="font-size:13px;color:#444;margin:12px 0 8px 0;">${escapeHtml(meeting)}</p>${rows}`
        );
      })
      .join("");
    return `${header}${meetingBlocks}`;
  }

  const rows = items.map((item) => renderDigestItemHtml(item, context)).join("");
  return `${header}${rows}`;
}

export function formatDigestMorningBriefLabel(today: Date): string {
  const label = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Morning brief — ${label}`;
}

export function renderDigestEmailHeaderHtml(context: DigestRenderContext): string {
  return `<p style="margin:0 0 16px 0;font-size:13px;color:#555;">${escapeHtml(formatDigestMorningBriefLabel(context.today))}</p>`;
}

export function renderDigestEmailFooterHtml(
  counts: DigestCounts,
  actionItemsTabUrl: string
): string {
  const backlogLine =
    counts.backlogNotShown > 0
      ? `<p style="margin:8px 0 0 0;color:#666;">${counts.backlogNotShown} backlog items not shown</p>`
      : "";
  return (
    `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e8e8e8;font-size:13px;">` +
    `<p style="margin:0;"><a href="${escapeAttr(actionItemsTabUrl)}" style="color:#1a73e8;text-decoration:none;">View all Josh-owned open action items</a></p>` +
    `${backlogLine}</div>`
  );
}

const DIGEST_DETAIL_SECTION_ORDER: DigestSectionKey[] = [
  "overdue",
  "dueToday",
  "upcoming7Days",
  "highPriority",
  "newSinceYesterday",
  "backlogSample",
];

function joinDigestSectionsWithDividers(sectionHtml: string[]): string {
  const nonEmpty = sectionHtml.filter((s) => s.length > 0);
  return nonEmpty.join(DIGEST_SECTION_DIVIDER);
}

export function renderDigestItemPlainText(
  item: ActionItemDigestEntry,
  context: DigestRenderContext
): string {
  const action = truncateDigestActionText(item.actionItem);
  const metadata = buildDigestItemMetadataLine(item, context);
  const lines = [action];
  if (metadata) lines.push(`  ${metadata}`);
  lines.push(`  Open: ${item.sheetRowUrl}`);
  return lines.join("\n");
}

export function renderDigestEmailPlainText(
  groups: DigestGroups,
  counts: DigestCounts,
  actionItemsTabUrl: string,
  context: DigestRenderContext
): string {
  const includedCount = collectDigestIncludedRows(groups).length;
  const lines: string[] = [
    "Meeting Ops — Daily Action Digest",
    formatDigestMorningBriefLabel(context.today),
  ];

  if (includedCount === 0) {
    lines.push("", "No Josh-owned open action items in today's digest.");
    lines.push("", `View all: ${actionItemsTabUrl}`);
    if (counts.backlogNotShown > 0) {
      lines.push(`${counts.backlogNotShown} backlog items not shown`);
    }
    return lines.join("\n");
  }

  const focus = pickRecommendedFocusItems(groups);
  if (focus.length > 0) {
    lines.push("", "Recommended focus", "----------------");
    for (const item of focus) {
      lines.push(renderDigestItemPlainText(item, context));
      lines.push("");
    }
  }

  const noUrgent = groups.overdue.length === 0 && groups.dueToday.length === 0;
  if (noUrgent) {
    lines.push("No urgent items due today.", "");
  }

  for (const key of DIGEST_DETAIL_SECTION_ORDER) {
    const items = groups[key];
    if (items.length === 0) continue;
    lines.push(`${SECTION_TITLES[key]} (${items.length})`, "----------------");
    if (key === "backlogSample") {
      const grouped = new Map<string, ActionItemDigestEntry[]>();
      for (const item of items) {
        const meeting = item.meetingTitle.trim() || "(untitled)";
        const list = grouped.get(meeting) ?? [];
        list.push(item);
        grouped.set(meeting, list);
      }
      for (const [meeting, meetingItems] of [...grouped.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        lines.push(meeting);
        for (const item of meetingItems) {
          lines.push(renderDigestItemPlainText(item, context));
          lines.push("");
        }
      }
    } else {
      for (const item of items) {
        lines.push(renderDigestItemPlainText(item, context));
        lines.push("");
      }
    }
  }

  lines.push(`View all Josh-owned open action items: ${actionItemsTabUrl}`);
  if (counts.backlogNotShown > 0) {
    lines.push(`${counts.backlogNotShown} backlog items not shown`);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function renderDigestEmailHtml(
  groups: DigestGroups,
  counts: DigestCounts,
  actionItemsTabUrl: string,
  context: DigestRenderContext
): string {
  const includedCount = collectDigestIncludedRows(groups).length;
  const footer = renderDigestEmailFooterHtml(counts, actionItemsTabUrl);
  const open = `<div style="${DIGEST_EMAIL_WRAPPER_STYLE}">`;
  const close = "</div>";

  if (includedCount === 0) {
    return (
      `${open}${renderDigestEmailHeaderHtml(context)}` +
      `<p style="margin:0;">No Josh-owned open action items in today&rsquo;s digest.</p>` +
      `${footer}${close}`
    );
  }

  const recommended = pickRecommendedFocusItems(groups);
  const recommendedHtml = renderDigestRecommendedFocusHtml(recommended, context);
  const noUrgent = groups.overdue.length === 0 && groups.dueToday.length === 0;
  const positiveLine = noUrgent
    ? `<p style="margin:0 0 12px 0;font-size:13px;color:#555;font-style:italic;">No urgent items due today.</p>`
    : "";

  const sectionBlocks = DIGEST_DETAIL_SECTION_ORDER.map((key) =>
    renderDigestSectionHtml(key, groups[key], context)
  );
  const sections = joinDigestSectionsWithDividers(sectionBlocks);
  const beforeSections =
    recommendedHtml.length > 0
      ? `${recommendedHtml}${DIGEST_SECTION_DIVIDER}`
      : "";

  return (
    `${open}${renderDigestEmailHeaderHtml(context)}${beforeSections}${positiveLine}${sections}${footer}${close}`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(url: string): string {
  return escapeHtml(url);
}

export function parseCreatedAtMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
