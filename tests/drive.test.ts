import { describe, expect, it } from "vitest";
import {
  findMatchingRecordingFromFiles,
  getGeminiNoteBaseName,
  parseDriveMeetingFileName,
} from "../src/driveParse";

describe("parseDriveMeetingFileName", () => {
  it("parses BII Weekly Team Meeting file name", () => {
    const result = parseDriveMeetingFileName(
      "BII Weekly Team Meeting - 2026/05/20 14:59 EDT - Notes by Gemini"
    );
    expect(result.meetingTitle).toBe("BII Weekly Team Meeting");
    expect(result.meetingDate).toBe("2026-05-20");
    expect(result.meetingDateTimeText).toBe("2026/05/20 14:59 EDT");
    expect(result.sourceKind).toBe("gemini_drive_doc");
  });

  it("parses Monique / Josh file name with brackets", () => {
    const result = parseDriveMeetingFileName(
      "Monique / Josh [MIST automation] - 2026/05/21 09:57 EDT - Notes by Gemini"
    );
    expect(result.meetingTitle).toBe("Monique / Josh [MIST automation]");
    expect(result.meetingDate).toBe("2026-05-21");
    expect(result.meetingDateTimeText).toBe("2026/05/21 09:57 EDT");
  });

  it('parses "Meeting started" file name', () => {
    const result = parseDriveMeetingFileName(
      "Meeting started 2026/05/20 09:46 EDT - Notes by Gemini"
    );
    expect(result.meetingTitle).toBe("Meeting");
    expect(result.meetingDate).toBe("2026-05-20");
    expect(result.meetingDateTimeText).toBe("2026/05/20 09:46 EDT");
  });
});

describe("recording base-name matching", () => {
  const folderFiles = [
    {
      name: "BII Weekly Team Meeting - 2026/05/20 14:59 EDT - Notes by Gemini",
      id: "note1",
      url: "https://drive.google.com/file/d/note1/view",
    },
    {
      name: "BII Weekly Team Meeting - 2026/05/20 14:59 EDT - Recording",
      id: "rec1",
      url: "https://drive.google.com/file/d/rec1/view",
    },
    {
      name: "Monique / Josh [MIST automation] - 2026/05/21 09:57 EDT - Notes by Gemini",
      id: "note2",
      url: "https://drive.google.com/file/d/note2/view",
    },
    {
      name: "Monique / Josh [MIST automation] - 2026/05/21 09:57 EDT - Recording",
      id: "rec2",
      url: "https://drive.google.com/file/d/rec2/view",
    },
  ];

  it("extracts shared base name from note file", () => {
    expect(
      getGeminiNoteBaseName(
        "BII Weekly Team Meeting - 2026/05/20 14:59 EDT - Notes by Gemini"
      )
    ).toBe("BII Weekly Team Meeting - 2026/05/20 14:59 EDT");
  });

  it("matches recording by shared base name", () => {
    const match = findMatchingRecordingFromFiles(
      "BII Weekly Team Meeting - 2026/05/20 14:59 EDT - Notes by Gemini",
      folderFiles
    );
    expect(match.recordingFileId).toBe("rec1");
    expect(match.recordingFileUrl).toContain("rec1");
  });

  it("matches recording for bracketed meeting title", () => {
    const match = findMatchingRecordingFromFiles(
      "Monique / Josh [MIST automation] - 2026/05/21 09:57 EDT - Notes by Gemini",
      folderFiles
    );
    expect(match.recordingFileId).toBe("rec2");
  });

  it("returns null when no recording matches", () => {
    const match = findMatchingRecordingFromFiles(
      "Solo Meeting - 2026/05/22 10:00 EDT - Notes by Gemini",
      folderFiles
    );
    expect(match.recordingFileId).toBeNull();
    expect(match.recordingFileUrl).toBeNull();
  });
});
