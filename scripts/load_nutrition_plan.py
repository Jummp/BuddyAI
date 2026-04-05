"""CLI: parse nutrition_plan.csv and upsert into Supabase nutrition_plan table.

Usage:
    python scripts/load_nutrition_plan.py nutrition_plan.csv --diet vegetarian --allergies "latticini,glutine"

CSV format (with header):
    nutrient,daily_target,unit,foods,notes
    calories_kcal,2200,kcal,,
    protein_g,150,g,,
    iron_mg,18,mg,"spinaci 200g; lenticchie 150g",priorita alta
"""
import sys
import os
import csv
import argparse
import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import get_settings
from supabase import create_client


FOOD_NUTRIENT_MAP = {
    "iron_mg": "iron",
    "vitamin_b12_ug": "vitamin_b12",
    "vitamin_d_ug": "vitamin_d",
    "vitamin_c_mg": "vitamin_c",
    "calcium_mg": "calcium",
}


def parse_csv(path: str) -> tuple[dict, dict]:
    targets = {}
    foods = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            nutrient = row["nutrient"].strip()
            try:
                targets[nutrient] = float(row["daily_target"])
            except (ValueError, KeyError):
                targets[nutrient] = 0
            food_key = FOOD_NUTRIENT_MAP.get(nutrient)
            if food_key and row.get("foods"):
                items = [{"food": s.strip()} for s in row["foods"].split(";") if s.strip()]
                foods[food_key] = items
    return targets, foods


def load(path: str, diet: str, allergies: list[str]) -> None:
    targets, foods = parse_csv(path)
    if not targets:
        print("Nessun nutriente trovato nel CSV.")
        return

    settings = get_settings()
    sb = create_client(settings.supabase_url, settings.supabase_key)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Delete existing plan and insert fresh
    sb.table("nutrition_plan").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    sb.table("nutrition_plan").insert({
        "diet_type": diet,
        "allergies": allergies,
        "targets": targets,
        "foods": foods,
        "source": "imported",
        "updated_at": now,
    }).execute()

    print(f"OK: Piano nutrizionale caricato ({len(targets)} nutrienti, dieta: {diet}).")
    if allergies:
        print(f"Allergie: {', '.join(allergies)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Carica piano nutrizionale da CSV su Supabase.")
    parser.add_argument("csv_file", help="Percorso al file CSV")
    parser.add_argument("--diet", default="omnivore", help="Tipo dieta: omnivore|vegetarian|vegan|other")
    parser.add_argument("--allergies", default="", help="Allergie separate da virgola, es. 'latticini,glutine'")
    args = parser.parse_args()

    allergy_list = [a.strip() for a in args.allergies.split(",") if a.strip()]
    load(args.csv_file, args.diet, allergy_list)
