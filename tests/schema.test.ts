import { describe, expect, it } from "vitest";
import {
  extractJsonTextFromResponsesBody,
  normalizePriority,
  parseAndValidateMeetingOpsResponse,
} from "../src/schema";

const validPayload = {
  meeting: {
    title: "Weekly Sync",
    date: "2026-05-20",
    executive_summary: "Team reviewed blockers.",
    decisions: ["Ship v1 Friday"],
    open_questions: ["Who owns QA sign-off?"],
    follow_up_draft: "Thanks all — following up on QA owner.",
    cursor_prompt: "Create tasks for QA sign-off owner.",
    project_guess: "Meeting Ops",
    confidence: "High",
  },
  action_items: [
    {
      owner: "Josh",
      action: "Confirm QA sign-off owner",
      due_date: null,
      priority: "high",
      project: null,
      status: "Open",
      follow_up_needed: true,
      follow_up_draft: "Can you confirm QA owner?",
      cursor_prompt: null,
      confidence: "Medium",
      notes: null,
    },
    {
      owner: null,
      action: "",
      due_date: null,
      priority: "Low",
      project: null,
      status: "New",
      follow_up_needed: false,
      follow_up_draft: null,
      cursor_prompt: null,
      confidence: "Low",
      notes: null,
    },
  ],
};

describe("parseAndValidateMeetingOpsResponse", () => {
  it("parses valid JSON and normalizes fields", () => {
    const result = parseAndValidateMeetingOpsResponse(JSON.stringify(validPayload));
    expect(result.meeting.title).toBe("Weekly Sync");
    expect(result.meeting.decisions).toHaveLength(1);
    expect(result.action_items).toHaveLength(1);
    expect(result.action_items[0].priority).toBe("High");
    expect(result.action_items[0].status).toBe("New");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseAndValidateMeetingOpsResponse("not json")).toThrow(/valid JSON/i);
  });
});

describe("normalizePriority", () => {
  it("normalizes case-insensitive values", () => {
    expect(normalizePriority("HIGH")).toBe("High");
    expect(normalizePriority("unknown")).toBe("Medium");
  });
});

describe("extractJsonTextFromResponsesBody", () => {
  it("reads output_text when present", () => {
    const text = extractJsonTextFromResponsesBody({
      output_text: JSON.stringify(validPayload),
    });
    expect(JSON.parse(text).meeting.title).toBe("Weekly Sync");
  });

  it("reads nested message content", () => {
    const text = extractJsonTextFromResponsesBody({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(validPayload) }],
        },
      ],
    });
    expect(JSON.parse(text).meeting.title).toBe("Weekly Sync");
  });
});
