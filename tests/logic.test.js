import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CSV_COLUMNS,
  PAID_NOT_DONE_RATIO,
  budgetByConstituency,
  countByStatus,
  escapeHtml,
  filterProjects,
  formatDate,
  formatKwacha,
  isPaidButNotDone,
  projectsToCsv,
  summarize,
} from "../js/logic.js";

function project(overrides = {}) {
  return {
    id: "T-1",
    constituency: "Kabwata",
    ward: "Kamwala",
    category: "community",
    title: "Test project",
    description: "Fictional sample desks",
    budget_zmw: 1000,
    spent_zmw: 1000,
    status: "delayed",
    start_date: "2024-01-01",
    expected_date: "2024-06-01",
    lat: -15.44,
    lng: 28.29,
    fictional: true,
    ...overrides,
  };
}

describe("isPaidButNotDone", () => {
  it("uses a 90% threshold", () => {
    assert.equal(PAID_NOT_DONE_RATIO, 0.9);
  });

  it("flags a project at exactly 90% spent when it is not complete", () => {
    assert.equal(isPaidButNotDone(project({ spent_zmw: 900, status: "delayed" })), true);
    assert.equal(isPaidButNotDone(project({ spent_zmw: 900, status: "abandoned" })), true);
    assert.equal(isPaidButNotDone(project({ spent_zmw: 900, status: "ongoing" })), true);
  });

  it("does not flag 89.9% spent", () => {
    assert.equal(isPaidButNotDone(project({ spent_zmw: 899, status: "delayed" })), false);
  });

  it("does not flag a completed project even when it is fully paid", () => {
    assert.equal(isPaidButNotDone(project({ spent_zmw: 1000, status: "complete" })), false);
  });

  it("does not flag a zero or missing budget", () => {
    assert.equal(isPaidButNotDone(project({ budget_zmw: 0, spent_zmw: 0 })), false);
    assert.equal(isPaidButNotDone(project({ budget_zmw: null, spent_zmw: 100 })), false);
    assert.equal(isPaidButNotDone({}), false);
  });
});

describe("summarize", () => {
  it("adds budget, spent, completion, delay, and flags", () => {
    const summary = summarize([
      project({ budget_zmw: 1000, spent_zmw: 1000, status: "delayed" }),
      project({ id: "T-2", budget_zmw: 500, spent_zmw: 250, status: "ongoing" }),
      project({ id: "T-3", budget_zmw: 800, spent_zmw: 800, status: "complete" }),
      project({ id: "T-4", budget_zmw: 400, spent_zmw: 0, status: "planned" }),
    ]);

    assert.equal(summary.projectCount, 4);
    assert.equal(summary.totalBudget, 2700);
    assert.equal(summary.totalSpent, 2050);
    assert.equal(summary.completeCount, 1);
    assert.equal(summary.delayedCount, 1);
    assert.equal(summary.flaggedCount, 1);
    assert.equal(summary.percentComplete, 25);
  });

  it("returns zeros for an empty list", () => {
    assert.deepEqual(summarize([]), {
      projectCount: 0,
      totalBudget: 0,
      totalSpent: 0,
      completeCount: 0,
      delayedCount: 0,
      flaggedCount: 0,
      percentComplete: 0,
    });
    assert.equal(summarize(undefined).projectCount, 0);
  });
});

describe("filterProjects", () => {
  const rows = [
    project({ id: "KAB-001", title: "Desk order", ward: "Kamwala", status: "delayed" }),
    project({
      id: "MAT-001",
      constituency: "Matero",
      ward: "Lima",
      category: "bursary",
      title: "Fee support",
      description: "Secondary learners",
      status: "complete",
    }),
    project({
      id: "MUN-001",
      constituency: "Munali",
      ward: "Chainda",
      category: "empowerment",
      title: "Trading grants",
      status: "ongoing",
    }),
  ];

  it("returns every project when filters are all and the search is blank", () => {
    const filtered = filterProjects(rows, {
      constituency: "all",
      status: "all",
      category: "all",
      query: "  ",
    });
    assert.equal(filtered.length, 3);
    assert.notEqual(filtered, rows);
  });

  it("combines constituency, status, and category", () => {
    const filtered = filterProjects(rows, {
      constituency: "Matero",
      status: "complete",
      category: "bursary",
    });
    assert.deepEqual(filtered.map((row) => row.id), ["MAT-001"]);
  });

  it("matches a search without caring about letter case", () => {
    assert.deepEqual(
      filterProjects(rows, { query: "KAMWALA" }).map((row) => row.id),
      ["KAB-001"],
    );
    assert.deepEqual(
      filterProjects(rows, { query: "secondary" }).map((row) => row.id),
      ["MAT-001"],
    );
    assert.equal(filterProjects(rows, { query: "no-such-project" }).length, 0);
  });
});

describe("charts helpers", () => {
  it("sums budget and spent by constituency in alphabetical order", () => {
    const rows = budgetByConstituency([
      project({ constituency: "Munali", budget_zmw: 10, spent_zmw: 4 }),
      project({ constituency: "Kabwata", budget_zmw: 5, spent_zmw: 1 }),
      project({ constituency: "Kabwata", budget_zmw: 7, spent_zmw: 2 }),
    ]);
    assert.deepEqual(rows, [
      { constituency: "Kabwata", budget: 12, spent: 3 },
      { constituency: "Munali", budget: 10, spent: 4 },
    ]);
  });

  it("counts every status, including zeros, and keeps extras", () => {
    const counts = countByStatus([
      project({ status: "delayed" }),
      project({ status: "delayed" }),
      project({ status: "mystery" }),
    ]);
    assert.deepEqual(
      counts.map((row) => row.status),
      ["planned", "ongoing", "delayed", "complete", "abandoned", "mystery"],
    );
    assert.equal(counts.find((row) => row.status === "delayed").count, 2);
    assert.equal(counts.find((row) => row.status === "planned").count, 0);
    assert.equal(counts.find((row) => row.status === "mystery").count, 1);
  });
});

describe("formatting and CSV export", () => {
  it("formats kwacha and dates for the page", () => {
    assert.equal(formatKwacha(130000), "K130,000");
    assert.equal(formatKwacha(0), "K0");
    assert.equal(formatDate("2024-03-01"), "1 Mar 2024");
    assert.equal(formatDate(""), "");
  });

  it("escapes HTML", () => {
    assert.equal(escapeHtml(`a<b>&"c`), "a&lt;b&gt;&amp;&quot;c");
  });

  it("exports the filtered rows with the flag and quoted text", () => {
    const csv = projectsToCsv([
      project({
        title: 'Say "hi"',
        description: "desks, paid",
        spent_zmw: 950,
        status: "delayed",
      }),
    ]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const body = csv.slice(1);
    assert.ok(body.startsWith(CSV_COLUMNS.join(",")));
    assert.match(body, /"Say ""hi"""/);
    assert.match(body, /"desks, paid"/);
    assert.match(body, /,yes,yes\n$/);
  });

  it("guards a cell that starts like a spreadsheet formula", () => {
    const csv = projectsToCsv([project({ title: "=1+1", description: "plain" })]);
    assert.match(csv, /'=1\+1/);
  });

  it("marks a completed project as not paid-but-not-done in the CSV", () => {
    const csv = projectsToCsv([project({ spent_zmw: 1000, status: "complete" })]);
    assert.match(csv, /,no,yes\n$/);
  });
});
