import json

from sqlalchemy.orm import Session

from app.data_loader import load_faq, load_products, load_seed_orders
from app.models import FAQItem, Order, Product


def seed_initial_data(db: Session) -> None:
    seed_products(db)
    seed_faq(db)
    seed_orders(db)


def seed_products(db: Session) -> None:
    for product in load_products():
        existing = db.get(Product, product["id"])
        if existing:
            continue
        db.add(
            Product(
                id=product["id"],
                name=product["name"],
                category=product["category"],
                price=product["price"],
                stock=product["stock"],
                description=product["description"],
                tags_json=json.dumps(product.get("tags", []), ensure_ascii=False),
            )
        )
    db.commit()


def seed_faq(db: Session) -> None:
    for item in load_faq():
        existing = db.get(FAQItem, item["id"])
        if existing:
            continue
        db.add(FAQItem(id=item["id"], question=item["question"], answer=item["answer"]))
    db.commit()


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
