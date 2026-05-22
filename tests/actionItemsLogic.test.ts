import { describe, expect, it } from "vitest";

import {
  buildGoogleTaskNotes,
  buildGoogleTaskTitle,
  collectDigestIncludedRows,
  DEFAULT_DIGEST_OWNER_ALIASES,
  DIGEST_ACTION_TEXT_MAX_LEN,
  filterDigestOwnedEntries,
  formatDigestDueDate,
  formatGoogleTaskDueRfc3339,
  groupActionItemsForDigest,
  hasSyncedGoogleTask,
  isDigestOwnedItem,
  isDueWithinNext7Days,
  isEligibleForGoogleTasksSync,
  orderBacklogSampleForDigest,
  ownerTokenMatchesDigestAlias,
  parseDigestOwnerAliases,
  parseDueDate,
  pickRecommendedFocusItems,
  renderDigestEmailHtml,
  renderDigestEmailPlainText,
  renderDigestItemHtml,
  resolveDigestSection,
  truncateDigestActionText,
  type ActionItemDigestEntry,
  type ActionItemSyncEntry,
} from "../src/actionItemsLogic";

const today = new Date(2026, 4, 21); // 2026-05-21 Thursday
const digestToday = new Date(2026, 4, 22); // 2026-05-22 Friday
const digestTz = "America/New_York";
const digestContext = { today: digestToday, timezone: digestTz };

const aliases = [...DEFAULT_DIGEST_OWNER_ALIASES];



function baseEntry(overrides: Partial<ActionItemSyncEntry> = {}): ActionItemSyncEntry {

  return {

    rowNumber: 2,

    meetingTitle: "Weekly Sync",

    actionItem: "Ship digest v1",

    owner: "Josh",

    dueDate: "2026-05-21",

    priority: "Medium",

    status: "New",

    meetingDate: "2026-05-20",

    summaryDocLink: "https://docs.google.com/document/d/summary",

    sourceDocLink: "https://docs.google.com/document/d/source",

    sheetRowUrl: "https://docs.google.com/spreadsheets/d/abc/edit#gid=0&range=A2",

    createdAtMs: new Date(2026, 4, 20, 10, 0, 0).getTime(),

    googleTaskId: "",

    googleTaskListId: "",

    ...overrides,

  };

}



describe("digest owner aliases", () => {

  it("parses comma-separated aliases from config string", () => {

    expect(parseDigestOwnerAliases("Josh, Josh Hirsch , josh@nivahealth.com")).toEqual([

      "Josh",

      "Josh Hirsch",

      "josh@nivahealth.com",

    ]);

  });



  it("matches Josh owner aliases case-insensitively", () => {

    expect(isDigestOwnedItem("Josh", aliases)).toBe(true);

    expect(isDigestOwnedItem("josh hirsch", aliases)).toBe(true);

    expect(isDigestOwnedItem("JOSH@NIVAHEALTH.COM", aliases)).toBe(true);

    expect(ownerTokenMatchesDigestAlias("Josh Hirsch", aliases)).toBe(true);

  });



  it("includes multi-owner rows when one token matches Josh", () => {

    expect(

      isDigestOwnedItem("Josh Hirsch, Lynn Thuliswa Chabvonga", aliases)

    ).toBe(true);

  });



  it("excludes blank owner and The group", () => {

    expect(isDigestOwnedItem("", aliases)).toBe(false);

    expect(isDigestOwnedItem("   ", aliases)).toBe(false);

    expect(isDigestOwnedItem("The group", aliases)).toBe(false);

    expect(isDigestOwnedItem("the group", aliases)).toBe(false);

  });



  it("excludes non-Josh owners", () => {

    expect(isDigestOwnedItem("Alex", aliases)).toBe(false);

    expect(isDigestOwnedItem("Lynn Thuliswa Chabvonga", aliases)).toBe(false);

  });



  it("filterDigestOwnedEntries keeps only Josh-owned open rows", () => {

    const entries = [

      baseEntry({ rowNumber: 2, owner: "Josh" }),

      baseEntry({ rowNumber: 3, owner: "Alex", status: "In Progress" }),

      baseEntry({ rowNumber: 4, owner: "" }),

      baseEntry({ rowNumber: 5, owner: "The group" }),

      baseEntry({ rowNumber: 6, owner: "Josh Hirsch, Lynn Thuliswa Chabvonga" }),

      baseEntry({ rowNumber: 7, status: "Done" }),

    ];

    expect(filterDigestOwnedEntries(entries, aliases).map((e) => e.rowNumber)).toEqual([

      2, 6,

    ]);

  });

});



describe("hasSyncedGoogleTask / duplicate prevention", () => {

  it("treats empty task id as not synced", () => {

    expect(hasSyncedGoogleTask("")).toBe(false);

    expect(hasSyncedGoogleTask("   ")).toBe(false);

  });



  it("treats existing task id as already synced", () => {

    expect(hasSyncedGoogleTask("task-123")).toBe(true);

  });



  it("skips sync when googleTaskId is already set", () => {

    const entry = baseEntry({ googleTaskId: "existing-task-id" });

    expect(isEligibleForGoogleTasksSync(entry, today)).toBe(false);

  });

});



describe("groupActionItemsForDigest", () => {

  it("groups Josh-owned open items into digest sections once each", () => {

    const entries = filterDigestOwnedEntries(

      [

        baseEntry({ rowNumber: 2, dueDate: "2026-05-19", status: "In Progress" }),

        baseEntry({ rowNumber: 3, dueDate: "2026-05-21", actionItem: "Due today item" }),

        baseEntry({

          rowNumber: 4,

          dueDate: "2026-05-25",

          actionItem: "Upcoming",

          owner: "Josh Hirsch",

        }),

        baseEntry({

          rowNumber: 5,

          dueDate: "",

          priority: "High",

          actionItem: "No due high",

        }),

        baseEntry({
          rowNumber: 6,
          status: "Waiting",
          actionItem: "Blocked",
          dueDate: "",
          priority: "Medium",
        }),

        baseEntry({

          rowNumber: 7,

          createdAtMs: new Date(2026, 4, 21, 8, 0, 0).getTime(),

          actionItem: "Brand new",

          dueDate: "2026-06-01",

        }),

      ],

      aliases

    );



    const { groups, counts } = groupActionItemsForDigest(entries, today);

    expect(groups.overdue.map((e) => e.rowNumber)).toEqual([2]);

    expect(groups.dueToday.map((e) => e.rowNumber)).toEqual([3]);

    expect(groups.upcoming7Days.map((e) => e.rowNumber)).toEqual([4]);

    expect(groups.highPriority.map((e) => e.rowNumber)).toEqual([5]);
    expect(groups.backlogSample).toHaveLength(0);
    expect(groups.newSinceYesterday.map((e) => e.rowNumber).sort((a, b) => a - b)).toEqual([
      6, 7,
    ]);

    const included = collectDigestIncludedRows(groups);
    expect(included.map((e) => e.rowNumber).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);

    expect(counts.totalJoshOwnedOpen).toBe(6);
    expect(counts.overdue).toBe(1);
    expect(counts.dueToday).toBe(1);
    expect(counts.upcoming7Days).toBe(1);
    expect(counts.shownInDigest).toBe(6);
    expect(counts.backlogNotShown).toBe(0);

  });



  it("assigns each item to exactly one section by priority", () => {

    const entry = baseEntry({

      rowNumber: 10,

      dueDate: "",

      priority: "High",

      createdAtMs: new Date(2026, 4, 21, 9, 0, 0).getTime(),

    });

    expect(resolveDigestSection(entry, today)).toBe("highPriority");



    const overdueNew = baseEntry({

      rowNumber: 11,

      dueDate: "2026-05-19",

      createdAtMs: new Date(2026, 4, 21, 9, 0, 0).getTime(),

    });

    expect(resolveDigestSection(overdueNew, today)).toBe("overdue");



    const { groups } = groupActionItemsForDigest([entry, overdueNew], today);

    expect(groups.newSinceYesterday).toHaveLength(0);

    expect(collectDigestIncludedRows(groups)).toHaveLength(2);

  });



  it("does not place high-priority/no-due items in newly added when they match earlier buckets", () => {

    const entry = baseEntry({

      rowNumber: 12,

      dueDate: "",

      priority: "High",

      createdAtMs: new Date(2026, 4, 21, 12, 0, 0).getTime(),

    });

    const { groups } = groupActionItemsForDigest([entry], today);

    expect(groups.highPriority.map((e) => e.rowNumber)).toEqual([12]);

    expect(groups.newSinceYesterday).toHaveLength(0);

  });



  it("excludes done items from all digest groups", () => {

    const { groups } = groupActionItemsForDigest(

      filterDigestOwnedEntries([baseEntry({ status: "Done" })], aliases),

      today

    );

    expect(Object.values(groups).every((g) => g.length === 0)).toBe(true);

  });



  it("caps high priority, new since yesterday, and backlog sections", () => {

    const noDueHigh = Array.from({ length: 12 }, (_, i) =>

      baseEntry({

        rowNumber: 100 + i,

        dueDate: "",

        priority: "High",

        actionItem: `High ${i}`,

      })

    );

    const newlyAdded = Array.from({ length: 7 }, (_, i) =>

      baseEntry({

        rowNumber: 200 + i,

        dueDate: "2026-06-15",

        priority: "Low",

        createdAtMs: new Date(2026, 4, 21, 10 + i, 0, 0).getTime(),

        actionItem: `New ${i}`,

      })

    );

    const backlog = Array.from({ length: 15 }, (_, i) =>

      baseEntry({

        rowNumber: 300 + i,

        dueDate: "2026-08-01",

        priority: "Low",

        createdAtMs: new Date(2026, 4, 1, 0, 0, 0).getTime(),

        actionItem: `Backlog ${i}`,

      })

    );



    const { groups, counts } = groupActionItemsForDigest(

      [...noDueHigh, ...newlyAdded, ...backlog],

      today

    );

    expect(groups.highPriority).toHaveLength(5);
    expect(groups.newSinceYesterday).toHaveLength(5);
    expect(groups.backlogSample).toHaveLength(8);
    expect(counts.shownInDigest).toBe(18);
    expect(counts.backlogNotShown).toBe(16);
  });
});

describe("digest v3 due dates and rendering", () => {
  it("parses ISO due datetime strings", () => {
    const due = parseDueDate("2026-05-26T12:00:00-04:00");
    expect(due).not.toBeNull();
    expect(due!.getFullYear()).toBe(2026);
    expect(due!.getMonth()).toBe(4);
    expect(due!.getDate()).toBe(26);
  });

  it("parses JavaScript date strings", () => {
    const due = parseDueDate("Tue Jun 30 2026 00:00:00 GMT-0400 (Eastern Daylight Time)");
    expect(due).not.toBeNull();
    expect(due!.getFullYear()).toBe(2026);
    expect(due!.getMonth()).toBe(5);
    expect(due!.getDate()).toBe(30);
  });

  it("places May 26 in Due this week when today is May 22", () => {
    expect(isDueWithinNext7Days("2026-05-26", digestToday)).toBe(true);
    const entry = baseEntry({ dueDate: "2026-05-26", rowNumber: 50 });
    expect(resolveDigestSection(entry, digestToday)).toBe("upcoming7Days");
    const { groups } = groupActionItemsForDigest([entry], digestToday);
    expect(groups.upcoming7Days.map((e) => e.rowNumber)).toEqual([50]);
  });

  it("does not render owner in digest item metadata", () => {
    const html = renderDigestItemHtml(baseEntry({ owner: "Josh Hirsch" }), digestContext);
    expect(html).not.toContain("Owner:");
    expect(html).not.toContain("Josh Hirsch");
  });

  it("does not render New status in digest item metadata", () => {
    const html = renderDigestItemHtml(baseEntry({ status: "New" }), digestContext);
    expect(html).not.toContain(">New<");
    expect(html).not.toContain("· New");
  });

  it("renders Waiting status in digest item metadata", () => {
    const html = renderDigestItemHtml(baseEntry({ status: "Waiting" }), digestContext);
    expect(html).toContain("Waiting");
  });

  it("truncates displayed action text without changing source length", () => {
    const longText = "A".repeat(200);
    const entry = baseEntry({ actionItem: longText });
    expect(truncateDigestActionText(entry.actionItem).length).toBe(
      DIGEST_ACTION_TEXT_MAX_LEN
    );
    expect(entry.actionItem.length).toBe(200);
  });

  it("computes backlog not shown as open items minus rendered rows", () => {
    const backlog = Array.from({ length: 12 }, (_, i) =>
      baseEntry({
        rowNumber: 400 + i,
        dueDate: "2026-08-01",
        priority: "Low",
        createdAtMs: new Date(2026, 4, 1, 0, 0, 0).getTime(),
        actionItem: `Backlog ${i}`,
        meetingTitle: i < 6 ? "Alpha" : "Beta",
      })
    );
    const { groups, counts } = groupActionItemsForDigest(backlog, digestToday);
    expect(groups.backlogSample).toHaveLength(8);
    expect(counts.totalJoshOwnedOpen).toBe(12);
    expect(counts.shownInDigest).toBe(8);
    expect(counts.backlogNotShown).toBe(4);
  });

  it("groups backlog sample by meeting/project in email HTML", () => {
    const items = orderBacklogSampleForDigest([
      baseEntry({ rowNumber: 1, meetingTitle: "Zeta", actionItem: "Z1" }),
      baseEntry({ rowNumber: 2, meetingTitle: "Alpha", actionItem: "A1" }),
      baseEntry({ rowNumber: 3, meetingTitle: "Alpha", actionItem: "A2" }),
    ]).slice(0, 3);
    const groups = {
      overdue: [],
      dueToday: [],
      upcoming7Days: [],
      highPriority: [],
      newSinceYesterday: [],
      backlogSample: items,
    };
    const html = renderDigestEmailHtml(
      groups,
      {
        totalJoshOwnedOpen: 3,
        overdue: 0,
        dueToday: 0,
        upcoming7Days: 0,
        shownInDigest: 3,
        backlogNotShown: 0,
      },
      "https://example.com/sheet",
      digestContext
    );
    expect(html.indexOf(">Alpha</p>")).toBeLessThan(html.indexOf(">Zeta</p>"));
    expect(html).toContain("Project backlog sample");
  });

  it("shows a positive line when there is no overdue or due-today section", () => {
    const entry = baseEntry({
      dueDate: "2026-05-28",
      rowNumber: 60,
      createdAtMs: new Date(2026, 4, 1).getTime(),
    });
    const { groups, counts } = groupActionItemsForDigest([entry], digestToday);
    const html = renderDigestEmailHtml(
      groups,
      counts,
      "https://example.com/sheet",
      digestContext
    );
    expect(html).toContain("No urgent items due today.");
  });

  it("formats digest due labels for today and dated items", () => {
    expect(formatDigestDueDate("2026-05-22", digestToday, digestTz)).toBe("Today");
    expect(formatDigestDueDate("2026-05-26", digestToday, digestTz)).toBe("Tue, May 26");
    expect(
      formatDigestDueDate("2026-05-26T12:00:00-04:00", digestToday, digestTz)
    ).toMatch(/May 26/);
  });
});

describe("digest v4 recommended focus and email UI", () => {
  it("picks up to 3 recommended focus items in section priority order", () => {
    const groups = {
      overdue: [
        baseEntry({ rowNumber: 1, actionItem: "Overdue 1", dueDate: "2026-05-20" }),
        baseEntry({ rowNumber: 2, actionItem: "Overdue 2", dueDate: "2026-05-19" }),
      ],
      dueToday: [baseEntry({ rowNumber: 3, actionItem: "Today 1", dueDate: "2026-05-22" })],
      upcoming7Days: [
        baseEntry({ rowNumber: 4, actionItem: "Week 1", dueDate: "2026-05-26" }),
      ],
      highPriority: [
        baseEntry({ rowNumber: 5, actionItem: "High 1", dueDate: "", priority: "High" }),
      ],
      newSinceYesterday: [
        baseEntry({
          rowNumber: 6,
          actionItem: "New 1",
          dueDate: "",
          createdAtMs: new Date(2026, 4, 21, 12, 0, 0).getTime(),
        }),
      ],
      backlogSample: [
        baseEntry({ rowNumber: 99, actionItem: "Backlog", dueDate: "2026-08-01" }),
      ],
    };

    expect(pickRecommendedFocusItems(groups).map((e) => e.rowNumber)).toEqual([1, 2, 3]);
    expect(pickRecommendedFocusItems(groups, 5).map((e) => e.rowNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("does not change digest row inclusion counts when rendering recommended focus", () => {
    const entries = [
      baseEntry({ rowNumber: 10, dueDate: "2026-05-20", actionItem: "O1" }),
      baseEntry({ rowNumber: 11, dueDate: "2026-05-22", actionItem: "T1" }),
      baseEntry({ rowNumber: 12, dueDate: "2026-05-26", actionItem: "W1" }),
    ];
    const { groups, counts } = groupActionItemsForDigest(entries, digestToday);
    const includedBefore = collectDigestIncludedRows(groups).length;

    renderDigestEmailHtml(groups, counts, "https://example.com/sheet", digestContext);

    expect(collectDigestIncludedRows(groups).length).toBe(includedBefore);
    expect(counts.shownInDigest).toBe(includedBefore);
    expect(pickRecommendedFocusItems(groups).length).toBeLessThanOrEqual(3);
  });

  it('uses "Open" link text instead of "Open row" in item HTML', () => {
    const html = renderDigestItemHtml(baseEntry(), digestContext);
    expect(html).toContain(">Open</a>");
    expect(html).not.toContain("Open row");
  });

  it("shows backlog not shown count in email footer", () => {
    const { groups, counts } = groupActionItemsForDigest(
      Array.from({ length: 12 }, (_, i) =>
        baseEntry({
          rowNumber: 500 + i,
          dueDate: "2026-08-01",
          priority: "Low",
          createdAtMs: new Date(2026, 4, 1).getTime(),
          actionItem: `Backlog ${i}`,
        })
      ),
      digestToday
    );
    const html = renderDigestEmailHtml(
      groups,
      counts,
      "https://example.com/sheet",
      digestContext
    );
    expect(html).toContain("4 backlog items not shown");
    expect(html).toContain("View all Josh-owned open action items");
  });

  it("includes recommended focus in HTML and plain text without duplicating section counts", () => {
    const { groups, counts } = groupActionItemsForDigest(
      [
        baseEntry({ rowNumber: 20, dueDate: "2026-05-20", actionItem: "Fix overdue" }),
        baseEntry({ rowNumber: 21, dueDate: "2026-05-22", actionItem: "Ship today" }),
      ],
      digestToday
    );
    const html = renderDigestEmailHtml(
      groups,
      counts,
      "https://example.com/sheet",
      digestContext
    );
    const plain = renderDigestEmailPlainText(
      groups,
      counts,
      "https://example.com/sheet",
      digestContext
    );

    expect(html).toContain("Recommended focus");
    expect(groups.overdue).toHaveLength(1);
    expect(html.match(/Fix overdue/g)?.length).toBeGreaterThanOrEqual(1);
    expect(plain).toContain("Recommended focus");
    expect(plain).toContain("Open:");
    expect(plain).not.toContain("Open row");
  });
});



describe("Google Tasks payload formatting", () => {

  it("builds task title from action text", () => {

    expect(buildGoogleTaskTitle("  Confirm QA owner  ")).toBe("Confirm QA owner");

  });



  it("builds task notes with meeting and links", () => {

    const entry = baseEntry();

    const notes = buildGoogleTaskNotes(entry);

    expect(notes).toContain("Meeting: Weekly Sync");

    expect(notes).toContain("Meeting date: 2026-05-20");

    expect(notes).toContain("Sheet row: https://docs.google.com/spreadsheets/d/abc");

    expect(notes).toContain("Summary doc: https://docs.google.com/document/d/summary");

    expect(notes).toContain("Source doc: https://docs.google.com/document/d/source");

  });



  it("formats due date as RFC3339 midnight UTC", () => {

    expect(formatGoogleTaskDueRfc3339("2026-05-21")).toBe("2026-05-21T00:00:00.000Z");

    expect(formatGoogleTaskDueRfc3339("")).toBeUndefined();

  });

});



describe("isEligibleForGoogleTasksSync", () => {

  it("allows Josh-owned open items due today", () => {

    expect(isEligibleForGoogleTasksSync(baseEntry(), today)).toBe(true);

  });



  it("allows blank owner when status is actionable", () => {

    const entry = baseEntry({ owner: "", status: "In Progress", dueDate: "" });

    expect(isEligibleForGoogleTasksSync(entry, today)).toBe(false);



    const high = baseEntry({ owner: "", status: "New", priority: "High", dueDate: "" });

    expect(isEligibleForGoogleTasksSync(high, today)).toBe(true);

  });



  it("rejects waiting and non-Josh owners", () => {

    expect(isEligibleForGoogleTasksSync(baseEntry({ status: "Waiting" }), today)).toBe(

      false

    );

    expect(

      isEligibleForGoogleTasksSync(baseEntry({ owner: "Alex", dueDate: "2026-05-19" }), today)

    ).toBe(false);

  });

});

