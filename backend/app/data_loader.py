import json
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"


def load_json(name: str):
    with (DATA_DIR / name).open("r", encoding="utf-8") as file:
        return json.load(file)


def load_products() -> list[dict]:
    return load_json("products.json")


def load_faq() -> list[dict]:
    return load_json("faq.json")


def load_seed_orders() -> list[dict]:
    return load_json("orders.json")

