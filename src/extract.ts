import { logInfo, logWarn } from "./logger";
import type { ExtractedContent, GmailCandidate, ParsedSubject } from "./types";

const GEMINI_SENDER = "gemini-notes@google.com";
const MAX_TRANSCRIPT_CHARS = 120_000;
const DOC_ID_REGEX =
  /https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/gi;

/** Parse subject: Notes: "Title" May 20, 2026 */
export function parseMeetingSubject(subject: string): ParsedSubject {
  const rawSubject = subject.trim();
  const patterns = [
    /^Notes:\s*[“"](.+?)[”"]\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*$/i,
    /^Notes:\s*[“"](.+?)[”"]\s+(\d{4}-\d{2}-\d{2})\s*$/i,
    /^Notes:\s*(.+?)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = rawSubject.match(pattern);
    if (match) {
      return {
        meetingTitle: match[1].trim(),
        meetingDate: normalizeMeetingDate(match[2].trim()),
        rawSubject,
      };
    }
  }

  const fallbackTitle = rawSubject.replace(/^Notes:\s*/i, "").trim() || "Unknown Meeting";
  return { meetingTitle: fallbackTitle, meetingDate: null, rawSubject };
}

function formatDateIsoLocal(parsed: Date): string {
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeMeetingDate(dateStr: string): string | null {
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return dateStr;

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    if (typeof Session !== "undefined" && typeof Utilities !== "undefined") {
      return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  } catch {
    // use local fallback below
  }

  return formatDateIsoLocal(parsed);
}

export function extractGoogleDocIds(text: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(DOC_ID_REGEX.source, DOC_ID_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

export function extractFirstDocLink(text: string): string | null {
  const regex = new RegExp(DOC_ID_REGEX.source, DOC_ID_REGEX.flags);
  const match = regex.exec(text);
  return match ? match[0] : null;
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  return normalizeWhitespace(text);
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function removeEmailBoilerplate(text: string): string {
  const markers = [
    /You received this email because/i,
    /View meeting notes in Google Docs/i,
    /Google LLC/i,
    /This email was sent to/i,
    /Unsubscribe/i,
    /Gemini in Meet/i,
  ];
  let cutIndex = text.length;
  for (const marker of markers) {
    const idx = text.search(marker);
    if (idx >= 0 && idx < cutIndex) cutIndex = idx;
  }
  return normalizeWhitespace(text.slice(0, cutIndex));
}

export function capTranscriptLength(text: string, maxChars = MAX_TRANSCRIPT_CHARS): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.85);
  const tail = maxChars - head - 80;
  return (
    text.slice(0, head) +
    "\n\n[... transcript truncated for processing ...]\n\n" +
    text.slice(-tail)
  );
}

export function fetchDocTextById(docId: string): string | null {
  try {
    const doc = DocumentApp.openById(docId);
    return normalizeWhitespace(doc.getBody().getText());
  } catch (err) {
    logWarn("Could not open linked Google Doc", {
      docId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function resolveTranscriptFromMessage(
  message: GoogleAppsScript.Gmail.GmailMessage
): { text: string; sourceNotesLink: string | null } {
  const html = message.getBody() || "";
  const plain = message.getPlainBody() || "";
  const combined = `${html}\n${plain}`;
  const sourceNotesLink = extractFirstDocLink(combined);
  const docIds = extractGoogleDocIds(combined);

  for (const docId of docIds) {
    const docText = fetchDocTextById(docId);
    if (docText && docText.length > 200) {
      logInfo("Using linked Google Doc for transcript", { docId, chars: docText.length });
      return { text: capTranscriptLength(docText), sourceNotesLink };
    }
  }

  const emailText = removeEmailBoilerplate(
    plain.length > 100 ? plain : htmlToPlainText(html)
  );
  return { text: capTranscriptLength(emailText), sourceNotesLink };
}

export function findLatestGeminiMessageInThread(
  thread: GoogleAppsScript.Gmail.GmailThread
): GoogleAppsScript.Gmail.GmailMessage | null {
  const messages = thread.getMessages();
  let latest: GoogleAppsScript.Gmail.GmailMessage | null = null;
  let latestTime = 0;

  for (const msg of messages) {
    const from = (msg.getFrom() || "").toLowerCase();
    if (!from.includes(GEMINI_SENDER)) continue;
    const t = msg.getDate().getTime();
    if (t >= latestTime) {
      latestTime = t;
      latest = msg;
    }
  }
  return latest;
}

export function extractFromCandidate(candidate: GmailCandidate): ExtractedContent {
  const { message, threadId, messageId } = candidate;
  const subject = message.getSubject() || "";
  const parsed = parseMeetingSubject(subject);
  const { text, sourceNotesLink } = resolveTranscriptFromMessage(message);

  if (!text || text.length < 50) {
    throw new Error("Extracted transcript is empty or too short");
  }

  return {
    sourceType: "gmail",
    meetingTitle: parsed.meetingTitle,
    meetingDate: parsed.meetingDate,
    emailSubject: subject,
    emailDate: message.getDate(),
    threadId,
    messageId,
    sourceNotesLink,
    recordingFileUrl: null,
    transcriptText: text,
    charCount: text.length,
  };
}
