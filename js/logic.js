/**
 * CDF Watch calculations.
 *
 * This file does not touch the page. The browser and the Node tests both
 * import it, so the numbers on the dashboard are the numbers the tests check.
 *
 * Interview version:
 * - filterProjects() keeps the rows that match the dropdowns and search box.
 * - summarize() adds up budget, spent, delayed count, and percent complete.
 * - isPaidButNotDone() is the flag: spent is at least 90% of budget, and
 *   the status is anything other than complete.
 * - projectsToCsv() turns the filtered rows back into a spreadsheet.
 */

export const PAID_NOT_DONE_RATIO = 0.9;

export const STATUS_ORDER = ["planned", "ongoing", "delayed", "complete", "abandoned"];

export const CSV_COLUMNS = [
  "id",
  "constituency",
  "ward",
  "category",
  "title",
  "description",
  "budget_zmw",
  "spent_zmw",
  "status",
  "start_date",
  "expected_date",
  "lat",
  "lng",
  "paid_but_not_done",
  "fictional",
];

function asList(projects) {
  return Array.isArray(projects) ? projects : [];
}

/** Share of the budget that has been spent, or null when budget is missing or zero. */
export function spentShare(project) {
  const budget = Number(project?.budget_zmw);
  const spent = Number(project?.spent_zmw);
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(spent)) return null;
  return spent / budget;
}

/**
 * True when the sample project is at least 90% paid and not marked complete.
 * Abandoned projects still count: the money went out and the work is not done.
 */
export function isPaidButNotDone(project) {
  const share = spentShare(project);
  if (share === null) return false;
  return share >= PAID_NOT_DONE_RATIO && project.status !== "complete";
}

export function summarize(projects) {
  const list = asList(projects);
  let totalBudget = 0;
  let totalSpent = 0;
  let completeCount = 0;
  let delayedCount = 0;
  let flaggedCount = 0;

  for (const project of list) {
    totalBudget += Number(project.budget_zmw) || 0;
    totalSpent += Number(project.spent_zmw) || 0;
    if (project.status === "complete") completeCount += 1;
    if (project.status === "delayed") delayedCount += 1;
    if (isPaidButNotDone(project)) flaggedCount += 1;
  }

  return {
    projectCount: list.length,
    totalBudget,
    totalSpent,
    completeCount,
    delayedCount,
    flaggedCount,
    // 0 when the filter matches nothing, so the card does not show NaN.
    percentComplete: list.length === 0 ? 0 : (completeCount / list.length) * 100,
  };
}

export function filterProjects(projects, filters = {}) {
  const constituency = filters.constituency || "all";
  const status = filters.status || "all";
  const category = filters.category || "all";
  const query = String(filters.query || "").trim().toLowerCase();

  return asList(projects).filter((project) => {
    if (constituency !== "all" && project.constituency !== constituency) return false;
    if (status !== "all" && project.status !== status) return false;
    if (category !== "all" && project.category !== category) return false;
    if (!query) return true;
    const haystack = [
      project.id,
      project.title,
      project.description,
      project.ward,
      project.constituency,
      project.category,
      project.status,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** Budget and spent totals for the bar chart, one row per constituency. */
export function budgetByConstituency(projects) {
  const totals = new Map();
  for (const project of asList(projects)) {
    const name = project.constituency || "Unknown";
    if (!totals.has(name)) totals.set(name, { constituency: name, budget: 0, spent: 0 });
    const row = totals.get(name);
    row.budget += Number(project.budget_zmw) || 0;
    row.spent += Number(project.spent_zmw) || 0;
  }
  return [...totals.values()].sort((a, b) => a.constituency.localeCompare(b.constituency));
}

/** Project counts in a stable status order, including zeros. */
export function countByStatus(projects) {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  for (const project of asList(projects)) {
    const status = project.status || "unknown";
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

export function formatKwacha(amount) {
  const rounded = Math.round(Number(amount) || 0);
  return `K${rounded.toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD as "1 Mar 2024" without shifting the day across time zones. */
export function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvEscape(value) {
  let text = value === undefined || value === null ? "" : String(value);
  // A leading apostrophe stops Excel treating "=..." as a formula.
  if (/^[=+@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV of the rows currently on screen, including the paid-but-not-done flag. */
export function projectsToCsv(projects) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const project of asList(projects)) {
    const row = {
      ...project,
      paid_but_not_done: isPaidButNotDone(project) ? "yes" : "no",
      fictional: "yes",
    };
    lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}
