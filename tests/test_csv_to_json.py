"""Tests for the sample-data converter.

Run them with:
    python3 -m unittest tests/test_csv_to_json.py
"""

import csv
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import csv_to_json  # noqa: E402


def sample_row(**overrides):
    row = {
        "id": "KAB-001",
        "constituency": "Kabwata",
        "ward": "Kamwala",
        "category": "community",
        "title": "Kamwala school desk order",
        "description": "Fictional sample. A made-up desk order.",
        "budget_zmw": "850000",
        "spent_zmw": "850000",
        "status": "delayed",
        "start_date": "2024-02-01",
        "expected_date": "2024-08-30",
        "lat": "-15.4428",
        "lng": "28.2922",
        "sample": "fictional",
    }
    row.update(overrides)
    return row


class CsvToJsonTests(unittest.TestCase):
    def write_csv(self, folder, rows):
        path = Path(folder) / "projects.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=csv_to_json.COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_main_writes_a_fictional_document(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = self.write_csv(directory, [sample_row()])
            json_path = Path(directory) / "out" / "projects.json"
            with redirect_stdout(io.StringIO()):
                code = csv_to_json.main([str(csv_path), str(json_path)])
            self.assertEqual(code, 0)
            document = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertIn("FICTIONAL SAMPLE DATA", document["disclaimer"])
            project = document["projects"][0]
            self.assertEqual(project["id"], "KAB-001")
            self.assertEqual(project["budget_zmw"], 850000)
            self.assertEqual(project["lat"], -15.4428)
            self.assertEqual(project["lng"], 28.2922)
            self.assertTrue(project["fictional"])
            self.assertNotIn("sample", project)

    def test_rejects_a_row_that_is_not_marked_fictional(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = self.write_csv(directory, [sample_row(sample="official")])
            with self.assertRaisesRegex(ValueError, "fictional"):
                csv_to_json.read_projects(csv_path)

    def test_rejects_bad_status_duplicate_ids_and_bad_dates(self):
        with tempfile.TemporaryDirectory() as directory:
            bad_status = self.write_csv(directory, [sample_row(status="paid")])
            with self.assertRaisesRegex(ValueError, "status"):
                csv_to_json.read_projects(bad_status)

            duplicate = self.write_csv(
                directory,
                [sample_row(), sample_row(title="Second row")],
            )
            with self.assertRaisesRegex(ValueError, "duplicate"):
                csv_to_json.read_projects(duplicate)

            backwards = self.write_csv(
                directory,
                [sample_row(start_date="2024-08-30", expected_date="2024-02-01")],
            )
            with self.assertRaisesRegex(ValueError, "expected_date"):
                csv_to_json.read_projects(backwards)

            impossible = self.write_csv(directory, [sample_row(start_date="2024-02-31")])
            with self.assertRaisesRegex(ValueError, "start_date"):
                csv_to_json.read_projects(impossible)

    def test_rejects_money_that_is_not_a_whole_number(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = self.write_csv(directory, [sample_row(budget_zmw="1,000")])
            with self.assertRaisesRegex(ValueError, "budget_zmw"):
                csv_to_json.read_projects(csv_path)

    def test_checked_in_csv_matches_checked_in_json(self):
        csv_path = ROOT / "data" / "projects.csv"
        json_path = ROOT / "data" / "projects.json"
        from_csv = csv_to_json.build_document(csv_to_json.read_projects(csv_path))
        on_disk = json.loads(json_path.read_text(encoding="utf-8"))
        self.assertEqual(on_disk, from_csv)

        projects = from_csv["projects"]
        self.assertGreaterEqual(len(projects), 20)
        self.assertLessEqual(len(projects), 30)
        self.assertEqual(
            {project["constituency"] for project in projects},
            {"Kabwata", "Matero", "Munali"},
        )
        self.assertTrue(all(project["fictional"] is True for project in projects))
        for project in projects:
            self.assertGreaterEqual(project["lat"], -15.55)
            self.assertLessEqual(project["lat"], -15.30)
            self.assertGreaterEqual(project["lng"], 28.20)
            self.assertLessEqual(project["lng"], 28.45)


if __name__ == "__main__":
    unittest.main()
