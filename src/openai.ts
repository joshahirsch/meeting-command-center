import { logInfo } from "./logger";
import {
  extractJsonTextFromResponsesBody,
  MEETING_OPS_JSON_SCHEMA,
  parseAndValidateMeetingOpsResponse,
} from "./schema";
import type { ExtractedContent, MeetingOpsConfig, ProcessedMeetingResult } from "./types";

const SYSTEM_INSTRUCTION = `You process internal meeting notes into operational outputs. Be precise. Do not invent owners, due dates, or decisions. If an owner or due date is not explicit, use null. Separate discussion from decisions. Flag uncertainty with confidence. Create useful but bounded action items. Do not include sensitive patient details in the action item text if avoidable. Preserve source accountability.`;

function buildUserInput(extracted: ExtractedContent): string {
  if (extracted.sourceType === "drive_gemini_notes_doc") {
    return [
      "Meeting metadata:",
      "source_type: drive_gemini_notes_doc",
      `Title: ${extracted.meetingTitle}`,
      `Date: ${extracted.meetingDate ?? "unknown"}`,
      `source_file_name: ${extracted.sourceFileName ?? extracted.emailSubject}`,
      `source_file_url: ${extracted.sourceFileUrl ?? extracted.sourceNotesLink ?? "none"}`,
      `recording_file_url: ${extracted.recordingFileUrl ?? "none"}`,
      `meeting_datetime: ${extracted.meetingDateTimeText ?? "unknown"}`,
      "",
      "Meeting notes / transcript:",
      extracted.transcriptText,
    ].join("\n");
  }

  return [
    "Meeting metadata:",
    "source_type: gmail_gemini_notes",
    `Title: ${extracted.meetingTitle}`,
    `Date: ${extracted.meetingDate ?? "unknown"}`,
    `Email subject: ${extracted.emailSubject}`,
    `Source notes link: ${extracted.sourceNotesLink ?? "none"}`,
    "",
    "Meeting notes / transcript:",
    extracted.transcriptText,
  ].join("\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function processMeetingWithOpenAI(
  config: MeetingOpsConfig,
  extracted: ExtractedContent
): { result: ProcessedMeetingResult; tokenEstimate: number } {
  const tokenEstimate = estimateTokens(extracted.transcriptText) + 2000;

  const payload = {
    model: config.openaiModel,
    temperature: 0.2,
    store: false,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_INSTRUCTION }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserInput(extracted) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "meeting_ops_output",
        strict: true,
        schema: MEETING_OPS_JSON_SCHEMA,
      },
    },
  };

  logInfo("Calling OpenAI Responses API", {
    model: config.openaiModel,
    charCount: extracted.charCount,
    tokenEstimate,
  });

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const bodyText = response.getContentText();

  if (status < 200 || status >= 300) {
    let detail = bodyText.slice(0, 300);
    try {
      const errJson = JSON.parse(bodyText) as { error?: { message?: string } };
      if (errJson.error?.message) detail = errJson.error.message;
    } catch {
      // keep truncated body
    }
    throw new Error(`OpenAI API error (${status}): ${detail}`);
  }

  const body = JSON.parse(bodyText) as Record<string, unknown>;
  const jsonText = extractJsonTextFromResponsesBody(body);
  const result = parseAndValidateMeetingOpsResponse(jsonText);

  if (!result.meeting.title) {
    result.meeting.title = extracted.meetingTitle;
  }
  if (!result.meeting.date && extracted.meetingDate) {
    result.meeting.date = extracted.meetingDate;
  }

  return { result, tokenEstimate };
}
