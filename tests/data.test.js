import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isPaidButNotDone, spentShare } from "../js/logic.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("sample data", () => {
  const document = JSON.parse(read("data/projects.json"));
  const projects = document.projects;

  it("is labelled as fictional sample data", () => {
    assert.match(document.disclaimer, /FICTIONAL SAMPLE DATA/);
    assert.ok(projects.length >= 20 && projects.length <= 30);
    for (const project of projects) {
      assert.equal(project.fictional, true);
    }
  });

  it("covers three Lusaka constituencies and the fields the page needs", () => {
    const required = [
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
    ];
    const constituencies = new Set(projects.map((project) => project.constituency));
    assert.deepEqual([...constituencies].sort(), ["Kabwata", "Matero", "Munali"]);

    const ids = new Set();
    for (const project of projects) {
      assert.equal(ids.has(project.id), false);
      ids.add(project.id);
      for (const field of required) {
        assert.notEqual(project[field], undefined, `${project.id} ${field}`);
        assert.notEqual(project[field], "", `${project.id} ${field}`);
      }
      assert.ok(["community", "bursary", "empowerment"].includes(project.category));
      assert.ok(["planned", "ongoing", "delayed", "complete", "abandoned"].includes(project.status));
      assert.equal(Number.isInteger(project.budget_zmw), true);
      assert.equal(Number.isInteger(project.spent_zmw), true);
      assert.ok(project.budget_zmw > 0);
      assert.ok(project.spent_zmw >= 0);
      assert.ok(project.lat <= -15.3 && project.lat >= -15.55);
      assert.ok(project.lng >= 28.2 && project.lng <= 28.45);
      assert.match(project.description, /Fictional sample/);
    }
  });

  it("includes a flagged desk example and a fully paid project that is complete", () => {
    const desks = projects.filter((project) => /desk/i.test(project.title));
    assert.ok(desks.some((project) => isPaidButNotDone(project)));

    const paidAndFinished = projects.filter(
      (project) => project.status === "complete" && spentShare(project) >= 0.9,
    );
    assert.ok(paidAndFinished.length > 0);
    assert.ok(paidAndFinished.every((project) => isPaidButNotDone(project) === false));
  });

  it("keeps the Kamwala desk order flagged and the Libala borehole clear", () => {
    const byId = Object.fromEntries(projects.map((project) => [project.id, project]));
    assert.equal(byId["KAB-001"].status, "delayed");
    assert.equal(isPaidButNotDone(byId["KAB-001"]), true);
    assert.equal(byId["KAB-002"].status, "complete");
    assert.equal(isPaidButNotDone(byId["KAB-002"]), false);
  });
});

describe("pages", () => {
  it("shows the unofficial banner and uses relative paths", () => {
    const html = read("index.html");
    assert.match(
      html,
      /class="unofficial-banner"[^>]*>\s*Unofficial demo using sample data - not a government system\s*</,
    );
    assert.match(html, /vendor\/leaflet\/leaflet\.js/);
    assert.match(html, /vendor\/chart\.js\/chart\.umd\.min\.js/);
    assert.match(html, /js\/app\.js/);
    assert.doesNotMatch(html, /(?:src|href)="\//);
    assert.doesNotMatch(html, /coat of arms|Republic of Zambia/i);
    assert.match(html, /www\.zambiamonitor\.com/);
    assert.match(html, /www\.theigc\.org/);
    assert.match(html, /tizambia\.org\.zm/);
  });

  it("loads the JSON from the script location so GitHub Pages subfolders work", () => {
    const app = read("js/app.js");
    assert.match(app, /\.\.\/data\/projects\.json/);
    assert.match(app, /isPaidButNotDone/);
    assert.equal(app.includes('fetch("/'), false);
    assert.equal(app.includes("fetch('/"), false);
  });

  it("keeps the banner visible on the page stylesheet", () => {
    const css = read("css/styles.css");
    assert.match(css, /\.unofficial-banner\s*\{[^}]*position:\s*sticky/);
  });
});
