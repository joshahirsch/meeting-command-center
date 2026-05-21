import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  capTranscriptLength,
  extractGoogleDocIds,
  extractFirstDocLink,
  htmlToPlainText,
  normalizeWhitespace,
  parseMeetingSubject,
  removeEmailBoilerplate,
} from "../src/extract";

describe("parseMeetingSubject", () => {
  it("parses curly-quote subject with date", () => {
    const result = parseMeetingSubject('Notes: “BII Weekly Team Meeting” May 20, 2026');
    expect(result.meetingTitle).toBe("BII Weekly Team Meeting");
    expect(result.meetingDate).toBe("2026-05-20");
  });

  it("parses straight-quote subject with date", () => {
    const result = parseMeetingSubject('Notes: "Standup" May 5, 2026');
    expect(result.meetingTitle).toBe("Standup");
    expect(result.meetingDate).toBe("2026-05-05");
  });

  it("falls back when pattern does not match", () => {
    const result = parseMeetingSubject("Notes: Something odd");
    expect(result.meetingTitle).toContain("Something odd");
    expect(result.meetingDate).toBeNull();
  });
});

describe("html and doc extraction", () => {
  const sampleHtml = readFileSync(join(__dirname, "sample-email-body.html"), "utf8");

  it("converts HTML to readable text", () => {
    const text = htmlToPlainText(sampleHtml);
    expect(text).toContain("Notes from your meeting");
    expect(text).not.toContain("<p>");
  });

  it("extracts Google Doc IDs and links", () => {
    const ids = extractGoogleDocIds(sampleHtml);
    expect(ids).toContain("abc123XYZ_example");
    expect(extractFirstDocLink(sampleHtml)).toContain("abc123XYZ_example");
  });

  it("removes footer boilerplate", () => {
    const text = htmlToPlainText(sampleHtml);
    const cleaned = removeEmailBoilerplate(text);
    expect(cleaned).not.toMatch(/You received this email/i);
    expect(cleaned).toContain("Q2 planning");
  });

  it("caps very long transcripts", () => {
    const long = "a".repeat(150_000);
    const capped = capTranscriptLength(long, 10_000);
    expect(capped.length).toBeLessThan(11_000);
    expect(capped).toContain("truncated");
  });

  it("normalizes whitespace", () => {
    expect(normalizeWhitespace("  hello   \n\n\n  world  ")).toBe("hello\n\nworld");
  });
});
