import json

from sqlalchemy.orm import Session

from app.data_loader import load_seed_orders
from app.models import Order


def seed_orders(db: Session) -> None:
    for order in load_seed_orders():
        existing = db.get(Order, order["id"])
        if existing:
            continue
        db.add(
            Order(
                id=order["id"],
                customer_name=order["customer_name"],
                items_json=json.dumps(order["items"], ensure_ascii=False),
                total=order["total"],
                payment_status=order["payment_status"],
                delivery_status=order["delivery_status"],
                tracking_number=order.get("tracking_number"),
                notes=order.get("notes"),
            )
        )
    db.commit()

