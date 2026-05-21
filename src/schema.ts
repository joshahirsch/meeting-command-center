import type {
  ActionItemOutput,
  Confidence,
  MeetingOutput,
  Priority,
  ProcessedMeetingResult,
} from "./types";

export const MEETING_OPS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meeting", "action_items"],
  properties: {
    meeting: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "date",
        "executive_summary",
        "decisions",
        "open_questions",
        "follow_up_draft",
        "cursor_prompt",
        "project_guess",
        "confidence",
      ],
      properties: {
        title: { type: "string" },
        date: { type: ["string", "null"] },
        executive_summary: { type: "string" },
        decisions: { type: "array", items: { type: "string" } },
        open_questions: { type: "array", items: { type: "string" } },
        follow_up_draft: { type: "string" },
        cursor_prompt: { type: "string" },
        project_guess: { type: ["string", "null"] },
        confidence: { type: "string", enum: ["High", "Medium", "Low"] },
      },
    },
    action_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "owner",
          "action",
          "due_date",
          "priority",
          "project",
          "status",
          "follow_up_needed",
          "follow_up_draft",
          "cursor_prompt",
          "confidence",
          "notes",
        ],
        properties: {
          owner: { type: ["string", "null"] },
          action: { type: "string" },
          due_date: { type: ["string", "null"] },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          project: { type: ["string", "null"] },
          status: { type: "string" },
          follow_up_needed: { type: "boolean" },
          follow_up_draft: { type: ["string", "null"] },
          cursor_prompt: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          notes: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const PRIORITIES: Priority[] = ["High", "Medium", "Low"];
const CONFIDENCE_LEVELS: Confidence[] = ["High", "Medium", "Low"];

export function normalizePriority(value: unknown): Priority {
  if (typeof value === "string") {
    const v = value.trim();
    const match = PRIORITIES.find((p) => p.toLowerCase() === v.toLowerCase());
    if (match) return match;
  }
  return "Medium";
}

export function normalizeConfidence(value: unknown): Confidence {
  if (typeof value === "string") {
    const v = value.trim();
    const match = CONFIDENCE_LEVELS.find((c) => c.toLowerCase() === v.toLowerCase());
    if (match) return match;
  }
  return "Medium";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => (v as string).trim());
}

function normalizeMeeting(raw: Record<string, unknown>): MeetingOutput {
  return {
    title: String(raw.title || "Unknown Meeting").trim(),
    date: raw.date === null || raw.date === undefined ? null : String(raw.date).trim() || null,
    executive_summary: String(raw.executive_summary || "").trim(),
    decisions: asStringArray(raw.decisions),
    open_questions: asStringArray(raw.open_questions),
    follow_up_draft: String(raw.follow_up_draft || "").trim(),
    cursor_prompt: String(raw.cursor_prompt || "").trim(),
    project_guess:
      raw.project_guess === null || raw.project_guess === undefined
        ? null
        : String(raw.project_guess).trim() || null,
    confidence: normalizeConfidence(raw.confidence),
  };
}

function normalizeActionItem(raw: Record<string, unknown>): ActionItemOutput | null {
  const action = String(raw.action || "").trim();
  if (!action) return null;

  return {
    owner:
      raw.owner === null || raw.owner === undefined
        ? null
        : String(raw.owner).trim() || null,
    action,
    due_date:
      raw.due_date === null || raw.due_date === undefined
        ? null
        : String(raw.due_date).trim() || null,
    priority: normalizePriority(raw.priority),
    project:
      raw.project === null || raw.project === undefined
        ? null
        : String(raw.project).trim() || null,
    status: "New",
    follow_up_needed: Boolean(raw.follow_up_needed),
    follow_up_draft:
      raw.follow_up_draft === null || raw.follow_up_draft === undefined
        ? null
        : String(raw.follow_up_draft).trim() || null,
    cursor_prompt:
      raw.cursor_prompt === null || raw.cursor_prompt === undefined
        ? null
        : String(raw.cursor_prompt).trim() || null,
    confidence: normalizeConfidence(raw.confidence),
    notes:
      raw.notes === null || raw.notes === undefined
        ? null
        : String(raw.notes).trim() || null,
  };
}

export function parseAndValidateMeetingOpsResponse(
  jsonText: string
): ProcessedMeetingResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("OpenAI response is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenAI response JSON must be an object");
  }

  const root = parsed as Record<string, unknown>;
  if (!root.meeting || typeof root.meeting !== "object") {
    throw new Error("OpenAI response missing meeting object");
  }

  const meeting = normalizeMeeting(root.meeting as Record<string, unknown>);
  const rawItems = Array.isArray(root.action_items) ? root.action_items : [];
  const action_items: ActionItemOutput[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeActionItem(item as Record<string, unknown>);
    if (normalized) action_items.push(normalized);
  }

  return { meeting, action_items };
}

/** Testable JSON extraction from Responses API payload shapes */
export function extractJsonTextFromResponsesBody(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text;
  }

  const output = body.output;
  if (!Array.isArray(output)) {
    throw new Error("Responses API body missing output");
  }

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type !== "message") continue;
    const content = entry.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.type === "output_text" && typeof p.text === "string") {
        return p.text;
      }
    }
  }

  throw new Error("Could not locate JSON text in Responses API output");
}
