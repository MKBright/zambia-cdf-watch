/**
 * CDF Watch page.
 *
 * Interview walkthrough:
 * 1. loadProjects() fetches data/projects.json next to this site.
 *    The URL is built from this file, so it still works on GitHub Pages
 *    under /zambia-cdf-watch/.
 * 2. The form records constituency, status, category, and search text.
 * 3. render() asks logic.js to filter and summarize that list, then draws
 *    the cards, charts, map, and table from the same rows.
 * 4. isPaidButNotDone() decides the flag. The page does not repeat the rule.
 * 5. "I visited this site" writes to localStorage. Nothing is uploaded.
 */

import {
  PAID_NOT_DONE_RATIO,
  STATUS_ORDER,
  budgetByConstituency,
  countByStatus,
  escapeHtml,
  filterProjects,
  formatDate,
  formatKwacha,
  isPaidButNotDone,
  projectsToCsv,
  spentShare,
  summarize,
} from "./logic.js";

const VISIT_KEY = "cdf-watch-visit-notes";

const CATEGORY_LABELS = {
  community: "Community project",
  bursary: "Bursary",
  empowerment: "Empowerment grant",
};

const STATUS_LABELS = {
  planned: "Planned",
  ongoing: "Ongoing",
  delayed: "Delayed",
  complete: "Complete",
  abandoned: "Abandoned",
};

const state = {
  projects: [],
  budgetChart: null,
  statusChart: null,
  map: null,
  markerLayer: null,
  markerKey: "",
};

const flagPercent = Math.round(PAID_NOT_DONE_RATIO * 100);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init() {
  const form = document.querySelector("#filters");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  form.addEventListener("change", render);
  document.querySelector("#filter-query").addEventListener("input", render);
  document.querySelector("#reset-filters").addEventListener("click", () => {
    form.reset();
    render();
  });
  document.querySelector("#export-csv").addEventListener("click", exportCsv);
  document.querySelector("#detail-dialog").addEventListener("click", (event) => {
    if (event.target.id === "detail-dialog") event.target.close();
  });

  if (!window.L || !window.Chart) {
    showMessage("The map or chart library did not load. Check the vendor folder.");
    return;
  }

  loadProjects()
    .then((projects) => {
      state.projects = projects;
      fillConstituencies(projects);
      showDashboard();
      setupMap();
      buildLegend();
      document.querySelector("#export-csv").disabled = false;
      hideMessage();
      render();
    })
    .catch((error) => {
      console.error(error);
      showMessage(
        "Could not load data/projects.json. Start a local web server from the project folder, then open the site in the browser. Opening the HTML file directly blocks the data file.",
      );
    });
}

async function loadProjects() {
  const url = new URL("../data/projects.json", import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch projects (${response.status})`);
  const data = await response.json();
  if (!data || !Array.isArray(data.projects)) throw new Error("Project file has no projects list");
  return data.projects;
}

function readFilters() {
  return {
    constituency: document.querySelector("#filter-constituency").value,
    status: document.querySelector("#filter-status").value,
    category: document.querySelector("#filter-category").value,
    query: document.querySelector("#filter-query").value,
  };
}

function currentProjects() {
  return filterProjects(state.projects, readFilters());
}

function render() {
  if (!state.map) return;
  const projects = currentProjects();
  renderSummary(projects);
  renderCharts(projects);
  renderMap(projects);
  renderTable(projects);
}

function renderSummary(projects) {
  const summary = summarize(projects);
  const cards = [
    { label: "Total budget", value: formatKwacha(summary.totalBudget), tone: "" },
    { label: "Amount spent", value: formatKwacha(summary.totalSpent), tone: "" },
    {
      label: "Complete",
      value: `${Math.round(summary.percentComplete)}%`,
      detail: `${summary.completeCount} of ${summary.projectCount}`,
      tone: "complete",
    },
    { label: "Delayed", value: String(summary.delayedCount), tone: "delayed" },
  ];

  const grid = document.querySelector("#summary-cards");
  grid.replaceChildren();
  for (const card of cards) {
    const article = document.createElement("article");
    article.className = `summary-card${card.tone ? ` summary-${card.tone}` : ""}`;
    const label = document.createElement("span");
    label.textContent = card.label;
    const value = document.createElement("strong");
    value.textContent = card.value;
    article.append(label, value);
    if (card.detail) {
      const detail = document.createElement("small");
      detail.textContent = card.detail;
      article.append(detail);
    }
    grid.append(article);
  }

  const callout = document.querySelector("#flag-callout");
  callout.hidden = false;
  const count = summary.flaggedCount;
  const noun = count === 1 ? "project is" : "projects are";
  callout.textContent = count === 0
    ? "No project in this view is paid but not done."
    : `${count} ${noun} paid but not done: at least ${flagPercent}% of the budget is spent, and the status is not complete.`;
}

function renderCharts(projects) {
  const budgetRows = budgetByConstituency(projects);
  const statusRows = countByStatus(projects);

  document.querySelector("#budget-summary").textContent = budgetRows.length
    ? budgetRows
      .map((row) => `${row.constituency}: budget ${formatKwacha(row.budget)}, spent ${formatKwacha(row.spent)}`)
      .join(". ") + "."
    : "No projects in this view.";

  document.querySelector("#status-summary").textContent = statusRows
    .map((row) => `${STATUS_LABELS[row.status] || row.status}: ${row.count}`)
    .join(", ");

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#1c1915";
  window.Chart.defaults.color = ink;
  window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  window.Chart.defaults.animation = false;

  if (state.budgetChart) state.budgetChart.destroy();
  if (state.statusChart) state.statusChart.destroy();

  state.budgetChart = new window.Chart(document.querySelector("#budget-chart"), {
    type: "bar",
    data: {
      labels: budgetRows.map((row) => row.constituency),
      datasets: [
        {
          label: "Budget",
          data: budgetRows.map((row) => row.budget),
          backgroundColor: "#0a4f49",
        },
        {
          label: "Spent",
          data: budgetRows.map((row) => row.spent),
          backgroundColor: "#c26a3a",
        },
      ],
    },
    options: chartOptions(false),
  });

  state.statusChart = new window.Chart(document.querySelector("#status-chart"), {
    type: "bar",
    data: {
      labels: statusRows.map((row) => STATUS_LABELS[row.status] || row.status),
      datasets: [
        {
          label: "Projects",
          data: statusRows.map((row) => row.count),
          backgroundColor: statusRows.map((row) => statusColor(row.status)),
          borderRadius: 4,
        },
      ],
    },
    options: chartOptions(true),
  });
}

function chartOptions(horizontal) {
  const valueAxis = {
    beginAtZero: true,
    ticks: horizontal
      ? { precision: 0 }
      : {
        callback(value) {
          return `K${(Number(value) / 1000000).toFixed(1)}m`;
        },
      },
    grid: { color: "rgba(28, 25, 21, 0.08)" },
  };
  return {
    animation: false,
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !horizontal, position: "bottom" },
      tooltip: {
        callbacks: {
          label(context) {
            const raw = horizontal ? context.parsed.x : context.parsed.y;
            if (horizontal) return `${context.dataset.label}: ${raw}`;
            return `${context.dataset.label}: ${formatKwacha(raw)}`;
          },
        },
      },
    },
    scales: horizontal
      ? { x: valueAxis, y: { grid: { display: false } } }
      : { y: valueAxis, x: { grid: { display: false } } },
  };
}

function setupMap() {
  state.map = window.L.map("map", { scrollWheelZoom: false });
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);
  state.map.setView([-15.42, 28.32], 11);
  state.markerLayer = window.L.layerGroup().addTo(state.map);
  state.map.on("popupopen", (event) => {
    const button = event.popup.getElement()?.querySelector("[data-open-id]");
    if (!button || button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => openDetail(button.dataset.openId));
  });
}

function renderMap(projects) {
  const key = projects.map((project) => project.id).join("|");
  if (key === state.markerKey) return;
  state.markerKey = key;
  state.markerLayer.clearLayers();

  const bounds = [];
  for (const project of projects) {
    const flagged = isPaidButNotDone(project);
    const marker = window.L.circleMarker([project.lat, project.lng], {
      radius: flagged ? 10 : 8,
      color: flagged ? "#7a3412" : "#1c1915",
      weight: flagged ? 3 : 1,
      fillColor: statusColor(project.status),
      fillOpacity: 0.95,
    });
    marker.bindPopup(popupHtml(project));
    marker.addTo(state.markerLayer);
    bounds.push([project.lat, project.lng]);
  }

  state.map.invalidateSize();
  if (bounds.length === 1) {
    state.map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
}

function popupHtml(project) {
  const flag = isPaidButNotDone(project) ? '<p class="popup-flag">Paid but not done</p>' : "";
  return `
    <strong>${escapeHtml(project.title)}</strong>
    <p>${escapeHtml(project.ward)} ward, ${escapeHtml(project.constituency)}</p>
    <p>${escapeHtml(statusLabel(project.status))} · ${escapeHtml(formatKwacha(project.spent_zmw))} of ${escapeHtml(formatKwacha(project.budget_zmw))}</p>
    ${flag}
    <p><button type="button" class="button" data-open-id="${escapeHtml(project.id)}">View details</button></p>
  `;
}

function buildLegend() {
  const list = document.querySelector("#legend");
  list.replaceChildren();
  for (const status of STATUS_ORDER) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.color = statusColor(status);
    item.append(swatch, document.createTextNode(statusLabel(status)));
    list.append(item);
  }
  const flagged = document.createElement("li");
  const ring = document.createElement("span");
  ring.className = "swatch swatch-ring";
  flagged.append(ring, document.createTextNode("Paid but not done"));
  list.append(flagged);
}

function renderTable(projects) {
  const tbody = document.querySelector("#project-rows");
  const empty = document.querySelector("#empty-state");
  const wrap = document.querySelector(".table-wrap");
  document.querySelector("#result-count").textContent =
    `Showing ${projects.length} of ${state.projects.length} sample projects.`;

  tbody.replaceChildren();
  if (!projects.length) {
    empty.hidden = false;
    wrap.hidden = true;
    return;
  }
  empty.hidden = true;
  wrap.hidden = false;

  const notes = loadNotes();
  for (const project of projects) {
    const row = document.createElement("tr");
    if (isPaidButNotDone(project)) row.classList.add("is-flagged");
    row.append(
      projectCell(project, notes),
      textCell("Constituency", project.constituency),
      textCell("Category", CATEGORY_LABELS[project.category] || project.category),
      statusCell(project),
      moneyCell("Budget", project.budget_zmw, false),
      moneyCell("Spent", project.spent_zmw, isPaidButNotDone(project)),
    );
    tbody.append(row);
  }
}

function projectCell(project, notes) {
  const cell = document.createElement("td");
  cell.className = "project-cell";
  cell.dataset.label = "Project";

  if (isPaidButNotDone(project)) cell.append(pill("flag-pill", "Paid but not done"));

  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-button";
  button.textContent = project.title;
  button.addEventListener("click", () => openDetail(project.id));

  const meta = document.createElement("div");
  meta.className = "project-meta";
  meta.textContent = `${project.ward} ward · ${project.id}`;

  cell.append(button, meta);
  if (notes[project.id]) cell.append(pill("note-pill", "Visit note saved"));
  return cell;
}

function textCell(label, text) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = text;
  return cell;
}

function statusCell(project) {
  const cell = document.createElement("td");
  cell.dataset.label = "Status";
  cell.append(pill(`status status-${project.status}`, statusLabel(project.status)));
  return cell;
}

function moneyCell(label, amount, emphasize) {
  const cell = document.createElement("td");
  cell.className = emphasize ? "num is-high" : "num";
  cell.dataset.label = label;
  cell.textContent = formatKwacha(amount);
  return cell;
}

function pill(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function openDetail(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  const dialog = document.querySelector("#detail-dialog");
  dialog.replaceChildren(buildDetail(project));
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("#detail-title")?.focus();
}

function buildDetail(project) {
  const body = document.createElement("div");
  body.className = "detail-body";

  const top = document.createElement("div");
  top.className = "detail-top";
  const title = document.createElement("h2");
  title.id = "detail-title";
  title.tabIndex = -1;
  title.textContent = project.title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "button button-ghost";
  close.textContent = "Close";
  close.addEventListener("click", () => document.querySelector("#detail-dialog").close());
  top.append(title, close);

  const fictional = document.createElement("p");
  fictional.className = "fictional-line";
  fictional.textContent = "Fictional sample record. Not a government project.";

  const badges = document.createElement("p");
  badges.append(pill(`status status-${project.status}`, statusLabel(project.status)));
  if (isPaidButNotDone(project)) {
    badges.append(document.createTextNode(" "));
    badges.append(pill("flag-pill", "Paid but not done"));
  }

  const description = document.createElement("p");
  description.textContent = project.description;

  const facts = document.createElement("dl");
  facts.className = "facts";
  addFact(facts, "Constituency", project.constituency);
  addFact(facts, "Ward", project.ward);
  addFact(facts, "Category", CATEGORY_LABELS[project.category] || project.category);
  addFact(facts, "Budget", formatKwacha(project.budget_zmw));
  addFact(facts, "Spent", `${formatKwacha(project.spent_zmw)} (${spentPercent(project)} of budget)`);
  addFact(facts, "Started", formatDate(project.start_date));
  addFact(facts, "Expected", formatDate(project.expected_date));
  addFact(facts, "Map point", formatCoord(project.lat, project.lng));
  addFact(facts, "Id", project.id);

  body.append(top, fictional, badges, description, facts, buildVisitForm(project));
  return body;
}

function buildVisitForm(project) {
  const notes = loadNotes();
  const existing = notes[project.id];
  const form = document.createElement("form");
  form.className = "visit-form";

  const heading = document.createElement("h3");
  heading.textContent = "I visited this site";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = existing
    ? `Saved in this browser on ${formatSavedAt(existing.savedAt)}. Nothing was uploaded.`
    : "Saved only in this browser with localStorage. Nothing is uploaded.";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Your name (optional)";
  const nameInput = document.createElement("input");
  nameInput.id = "visit-name";
  nameInput.maxLength = 80;
  nameInput.value = existing?.name || "";
  nameLabel.append(nameInput);

  const noteLabel = document.createElement("label");
  noteLabel.textContent = "What did you see?";
  const noteInput = document.createElement("textarea");
  noteInput.id = "visit-note";
  noteInput.maxLength = 500;
  noteInput.required = true;
  noteInput.value = existing?.note || "";
  noteLabel.append(noteInput);

  const actions = document.createElement("div");
  actions.className = "visit-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button";
  save.textContent = "Save note";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "button button-ghost";
  clear.textContent = "Remove note";
  actions.append(save, clear);

  const message = document.createElement("p");
  message.className = "visit-message";
  message.setAttribute("role", "status");

  clear.addEventListener("click", () => {
    const stored = loadNotes();
    delete stored[project.id];
    if (!saveNotes(stored)) {
      message.textContent = "Could not update notes in this browser.";
      return;
    }
    nameInput.value = "";
    noteInput.value = "";
    hint.textContent = "Saved only in this browser with localStorage. Nothing is uploaded.";
    message.textContent = "Note removed from this browser.";
    renderTable(currentProjects());
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const note = noteInput.value.trim();
    if (!note) {
      message.textContent = "Write a short note first.";
      return;
    }
    const stored = loadNotes();
    stored[project.id] = {
      name: nameInput.value.trim(),
      note,
      savedAt: new Date().toISOString(),
    };
    if (!saveNotes(stored)) {
      message.textContent = "Could not save the note in this browser.";
      return;
    }
    hint.textContent = "Saved in this browser just now. Nothing was uploaded.";
    message.textContent = "Saved on this browser only.";
    renderTable(currentProjects());
  });

  form.append(heading, hint, nameLabel, noteLabel, actions, message);
  return form;
}

function addFact(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function exportCsv() {
  const csv = projectsToCsv(currentProjects());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cdf-watch-filtered.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fillConstituencies(projects) {
  const select = document.querySelector("#filter-constituency");
  const names = [...new Set(projects.map((project) => project.constituency))].sort();
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
}

function loadNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIT_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function statusColor(status) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--status-${status}`)
    .trim();
  return value || "#5c5348";
}

function spentPercent(project) {
  const share = spentShare(project);
  if (share === null) return "n/a";
  return `${Math.round(share * 100)}%`;
}

function formatCoord(lat, lng) {
  const latHem = lat < 0 ? "S" : "N";
  const lngHem = lng < 0 ? "W" : "E";
  return `${Math.abs(lat).toFixed(3)}° ${latHem}, ${Math.abs(lng).toFixed(3)}° ${lngHem} (approximate)`;
}

function formatSavedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an earlier visit";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function showDashboard() {
  for (const id of ["summary-section", "dashboard", "list-section"]) {
    document.querySelector(`#${id}`).hidden = false;
  }
}

function showMessage(text) {
  const node = document.querySelector("#status-message");
  node.hidden = false;
  node.textContent = text;
}

function hideMessage() {
  document.querySelector("#status-message").hidden = true;
}
