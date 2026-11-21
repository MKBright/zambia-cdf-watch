#!/usr/bin/env python3
"""Turn data/projects.csv into data/projects.json.

The CSV is the file to edit. The website reads the JSON. Run this after
every CSV change so the two files describe the same fictional projects.

Usage:
    python3 scripts/csv_to_json.py
    python3 scripts/csv_to_json.py data/projects.csv data/projects.json
"""

import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# Column order in the sample CSV. "sample" must be the word fictional on
# every row so a quick look at the file still shows it is not official data.
COLUMNS = [
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
    "sample",
]

STATUSES = {"planned", "ongoing", "delayed", "complete", "abandoned"}
CATEGORIES = {"community", "bursary", "empowerment"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")

DISCLAIMER = (
    "FICTIONAL SAMPLE DATA for an unofficial student demo. "
    "These are not official CDF records, contracts, payments, or government figures. "
    "Ward coordinates are approximate public locations so the markers sit in the right part of Lusaka. "
    "Do not use this file for oversight, payment, or audit decisions."
)


def parse_date(text, line_number, field):
    try:
        return datetime.strptime(text.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(
            f"Line {line_number}: {field} must be a real date like 2024-03-01"
        ) from None


def parse_money(text, line_number, field):
    raw = text.strip()
    if not raw.isdigit():
        raise ValueError(
            f"Line {line_number}: {field} must be a whole number of kwacha, with no commas"
        )
    return int(raw)


def parse_coord(text, line_number, field, low, high):
    try:
        value = float(text.strip())
    except ValueError:
        raise ValueError(f"Line {line_number}: {field} must be a number") from None
    if value < low or value > high:
        raise ValueError(f"Line {line_number}: {field} is out of range")
    # Four decimal places is about 11 metres. Enough for a demo map.
    return round(value, 4)


def row_to_project(row, line_number):
    """Check one CSV row and return the object the website stores."""
    status = row["status"].strip()
    category = row["category"].strip()
    project_id = row["id"].strip()

    if row.get("sample", "").strip() != "fictional":
        raise ValueError(f"Line {line_number}: sample must be the word fictional")
    if not ID_PATTERN.fullmatch(project_id):
        raise ValueError(f"Line {line_number}: id must use letters, numbers, and hyphens only")
    if status not in STATUSES:
        raise ValueError(f"Line {line_number}: status must be one of {', '.join(sorted(STATUSES))}")
    if category not in CATEGORIES:
        raise ValueError(
            f"Line {line_number}: category must be one of {', '.join(sorted(CATEGORIES))}"
        )

    title = row["title"].strip()
    description = row["description"].strip()
    constituency = row["constituency"].strip()
    ward = row["ward"].strip()
    if not title or not description or not constituency or not ward:
        raise ValueError(f"Line {line_number}: title, description, constituency, and ward are required")

    start = parse_date(row["start_date"], line_number, "start_date")
    expected = parse_date(row["expected_date"], line_number, "expected_date")
    if expected < start:
        raise ValueError(f"Line {line_number}: expected_date is before start_date")

    return {
        "id": project_id,
        "constituency": constituency,
        "ward": ward,
        "category": category,
        "title": title,
        "description": description,
        "budget_zmw": parse_money(row["budget_zmw"], line_number, "budget_zmw"),
        "spent_zmw": parse_money(row["spent_zmw"], line_number, "spent_zmw"),
        "status": status,
        "start_date": start.isoformat(),
        "expected_date": expected.isoformat(),
        "lat": parse_coord(row["lat"], line_number, "lat", -90, 90),
        "lng": parse_coord(row["lng"], line_number, "lng", -180, 180),
        "fictional": True,
    }


def read_projects(csv_path):
    """Read the CSV and return a list of project objects."""
    path = Path(csv_path)
    # utf-8-sig drops a byte-order mark if Excel added one.
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row")
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        missing = [name for name in COLUMNS if name not in reader.fieldnames]
        if missing:
            raise ValueError("CSV is missing columns: " + ", ".join(missing))

        projects = []
        seen_ids = set()
        for line_number, row in enumerate(reader, start=2):
            if not any((value or "").strip() for value in row.values()):
                continue
            project = row_to_project(row, line_number)
            if project["id"] in seen_ids:
                raise ValueError(f"Line {line_number}: duplicate id {project['id']}")
            seen_ids.add(project["id"])
            projects.append(project)

    if not projects:
        raise ValueError("CSV has no projects")
    return projects


def build_document(projects):
    """Wrap the projects with a disclaimer. This is the JSON file shape."""
    return {
        "disclaimer": DISCLAIMER,
        "projects": projects,
    }


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    csv_path = Path(args[0]) if args else Path("data/projects.csv")
    json_path = Path(args[1]) if len(args) > 1 else Path("data/projects.json")
    document = build_document(read_projects(csv_path))
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(document['projects'])} fictional projects to {json_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
