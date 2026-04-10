import datetime
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from backend.services.supabase import (
    get_nutrition_logs,
    get_nutrition_plan,
    save_nutrition_plan,
    get_fridge_items,
    upsert_fridge_item,
    delete_fridge_item,
    delete_nutrition_log,
    update_nutrition_log,
)

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


class FridgeItemIn(BaseModel):
    name: str
    quantity: float
    unit: str


class NutritionPlanIn(BaseModel):
    diet_type: str
    allergies: list[str] = []
    targets: dict = {}
    foods: dict = {}
    notes: str = ""


@router.get("/logs")
async def nutrition_logs(
    date_from: str = Query(default=None),
    date_to: str = Query(default=None),
):
    if date_from is None:
        date_from = datetime.date.today().isoformat()
    return await get_nutrition_logs(date_from, date_to)


@router.get("/plan")
async def nutrition_plan():
    return await get_nutrition_plan()


@router.put("/plan")
async def update_nutrition_plan(body: NutritionPlanIn):
    await save_nutrition_plan(
        diet_type=body.diet_type,
        allergies=body.allergies,
        targets=body.targets,
        foods=body.foods,
        notes=body.notes,
        source="manual",
    )
    return await get_nutrition_plan()


@router.get("/fridge")
async def fridge():
    return await get_fridge_items()


@router.post("/fridge")
async def add_fridge_item(body: FridgeItemIn):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name required")
    return await upsert_fridge_item(body.name.strip(), body.quantity, body.unit.strip())


@router.delete("/fridge/{item_id}")
async def remove_fridge_item(item_id: str):
    await delete_fridge_item(item_id)
    return {"ok": True}


class NutritionLogPatch(BaseModel):
    meal_description: str
    nutrients: dict


@router.get("/suggest")
async def meal_suggestion():
    """Suggerisce pasti in base a frigo + consumato oggi + target. Nessuna domanda."""
    from backend.agents.nutrition import suggest_meals
    text = await suggest_meals()
    return {"suggestion": text}


@router.delete("/logs/{log_id}", status_code=204)
async def remove_nutrition_log(log_id: str):
    await delete_nutrition_log(log_id)


@router.patch("/logs/{log_id}")
async def patch_nutrition_log(log_id: str, body: NutritionLogPatch):
    return await update_nutrition_log(log_id, body.meal_description, body.nutrients)
