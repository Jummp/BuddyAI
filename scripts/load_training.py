"""CLI: parse Jump.xlsx and upsert exercises into Supabase training_exercises table.

Usage:
    python scripts/load_training.py Jump.xlsx
"""
import sys
import os

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openpyxl
from backend.config import get_settings
from supabase import create_client


def _to_str(val) -> str:
    """Normalize a cell value to string. Converts float integers to int strings."""
    if val is None:
        return ""
    if isinstance(val, float) and val == int(val):
        return str(int(val))
    return str(val)


def parse_exercises(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path)
    ws = wb.active

    exercises = []
    current_block = None

    for row in ws.iter_rows(values_only=True):
        col_a = row[0] if len(row) > 0 else None
        col_b = row[1] if len(row) > 1 else None
        col_c = row[2] if len(row) > 2 else None
        col_d = row[3] if len(row) > 3 else None
        col_e = row[4] if len(row) > 4 else None

        # Block header row: "A - Posterior Chain & Core"
        if isinstance(col_a, str) and len(col_a) >= 3 and col_a[1] == " " and col_a[0] in ("A", "B", "C"):
            current_block = col_a[0]
            continue

        # Skip column header rows
        if col_a == "DRILL":
            continue

        # Skip empty rows or rows without exercise names
        if current_block is None or col_b is None:
            continue

        exercises.append({
            "block": current_block,
            "drill_id": _to_str(col_a),
            "exercise_name": str(col_b).strip(),
            "sets": _to_str(col_c),
            "reps": _to_str(col_d),
            "rest": _to_str(col_e),
        })

    return exercises


def load(path: str) -> None:
    exercises = parse_exercises(path)
    if not exercises:
        print("Nessun esercizio trovato. Controlla il formato del file.")
        return

    settings = get_settings()
    sb = create_client(settings.supabase_url, settings.supabase_key)

    for ex in exercises:
        sb.table("training_exercises").upsert(
            ex,
            on_conflict="block,exercise_name",
        ).execute()

    print(f"OK: Caricati {len(exercises)} esercizi su Supabase.")
    for ex in exercises:
        print(f"  [{ex['block']}] {ex['drill_id']}. {ex['exercise_name']} — {ex['sets']}x{ex['reps']} rest {ex['rest']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/load_training.py Jump.xlsx")
        sys.exit(1)
    load(sys.argv[1])
