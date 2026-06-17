import json
import uuid

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.data_loader import save_faq, save_orders, save_products
from app.database import Base, engine, get_db
from app.models import ChatSession, FAQItem, HandoffTicket, Message, Order, Product
from app.schemas import (
    ChatRequest,
    ChatResponse,
    CreateChatSessionRequest,
    CreateOrderRequest,
    FAQUpsertRequest,
    HandoffRequest,
    ProductUpsertRequest,
)
from app.seed import seed_initial_data
from app.services.chat import ChatService
from app.services.llm import LLMService
from app.rag.service import HybridRAGService


settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag_service = HybridRAGService(settings)
llm_service = LLMService(settings)
chat_service = ChatService(rag_service, llm_service)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    try:
        seed_initial_data(db)
    finally:
        db.close()
    rag_service.reindex()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)) -> dict:
    return chat_service.handle(db, payload.message, payload.session_id, payload.customer_name)


@app.post("/chat/sessions")
def create_chat_session(payload: CreateChatSessionRequest, db: Session = Depends(get_db)) -> dict:
    session = ChatSession(id=str(uuid.uuid4()), customer_name=payload.customer_name or "Demo Customer")
    db.add(session)
    db.flush()
    db.add(
        Message(
            session_id=session.id,
            role="assistant",
            content=(
                "Halo, saya AI CS Toko Rasa Nusantara. Saya bisa bantu cek produk, harga, stok, "
                "pembayaran, pengiriman, order, atau teruskan ke admin."
            ),
        )
    )
    db.commit()
    db.refresh(session)
    return {
        "session_id": session.id,
        "customer_name": session.customer_name,
        "status": session.status,
    }


@app.get("/chat/sessions")
def list_chat_sessions(db: Session = Depends(get_db)) -> list[dict]:
    sessions = db.query(ChatSession).all()
    result = []
    for session in sessions:
        last_message = (
            db.query(Message)
            .filter(Message.session_id == session.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .first()
        )
        result.append(
            {
                "session_id": session.id,
                "customer_name": session.customer_name or "Demo Customer",
                "status": session.status,
                "created_at": session.created_at.isoformat(),
                "last_message": last_message.content if last_message else "New conversation",
                "last_role": last_message.role if last_message else None,
                "last_message_at": (last_message.created_at if last_message else session.created_at).isoformat(),
            }
        )
    return sorted(result, key=lambda item: item["last_message_at"], reverse=True)


@app.get("/chat/sessions/{session_id}")
def get_chat_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    return {
        "session_id": session.id,
        "customer_name": session.customer_name,
        "status": session.status,
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "created_at": message.created_at.isoformat(),
            }
            for message in messages
        ],
    }


@app.get("/products")
def products(db: Session = Depends(get_db)) -> list[dict]:
    return [_serialize_product(product) for product in db.query(Product).order_by(Product.id.asc()).all()]


@app.get("/faq")
def faq(db: Session = Depends(get_db)) -> list[dict]:
    return [_serialize_faq(item) for item in db.query(FAQItem).order_by(FAQItem.id.asc()).all()]


@app.post("/admin/products")
def create_product(payload: ProductUpsertRequest, db: Session = Depends(get_db)) -> dict:
    products_data = [_serialize_product(product) for product in db.query(Product).all()]
    next_number = _next_numeric_id(products_data, "PRD")
    product = Product(id=f"PRD-{next_number:03d}", **_product_payload(payload))
    db.add(product)
    db.commit()
    db.refresh(product)
    return _serialize_product(product)


@app.put("/admin/products/{product_id}")
def update_product(product_id: str, payload: ProductUpsertRequest, db: Session = Depends(get_db)) -> dict:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, value in _product_payload(payload).items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return _serialize_product(product)


@app.post("/admin/faq")
def create_faq(payload: FAQUpsertRequest, db: Session = Depends(get_db)) -> dict:
    faq_data = [_serialize_faq(item) for item in db.query(FAQItem).all()]
    next_number = _next_numeric_id(faq_data, "FAQ")
    item = FAQItem(id=f"FAQ-{next_number:03d}", **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _serialize_faq(item)


@app.put("/admin/faq/{faq_id}")
def update_faq(faq_id: str, payload: FAQUpsertRequest, db: Session = Depends(get_db)) -> dict:
    item = db.get(FAQItem, faq_id)
    if not item:
        raise HTTPException(status_code=404, detail="FAQ not found")
    item.question = payload.question
    item.answer = payload.answer
    db.commit()
    db.refresh(item)
    return _serialize_faq(item)


@app.get("/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(get_db)) -> dict:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _serialize_order(order)


@app.post("/orders")
def create_order(payload: CreateOrderRequest, db: Session = Depends(get_db)) -> dict:
    items = []
    total = 0
    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"Unknown product {item.product_id}")
        if item.quantity > product.stock:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.name}")
        items.append({"product_id": product.id, "name": product.name, "quantity": item.quantity})
        total += product.price * item.quantity
        product.stock -= item.quantity

    order_id = f"ORD-{1000 + db.query(Order).count() + 1}"
    order = Order(
        id=order_id,
        customer_name=payload.customer_name,
        items_json=json.dumps(items, ensure_ascii=False),
        total=total,
        payment_status="waiting_payment",
        delivery_status="pending",
        tracking_number=None,
        notes="Order dibuat via API.",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _serialize_order(order)


@app.post("/handoff")
def handoff(payload: HandoffRequest, db: Session = Depends(get_db)) -> dict:
    ticket = HandoffTicket(session_id=payload.session_id, reason=payload.reason)
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {"ticket_id": ticket.id, "status": ticket.status}


@app.post("/admin/reindex")
def reindex() -> dict:
    return rag_service.reindex()


@app.post("/admin/train")
def train_rag(db: Session = Depends(get_db)) -> dict:
    export = _export_training_data(db)
    result = rag_service.refresh()
    return {**result, **export}


def _export_training_data(db: Session) -> dict:
    products_data = [_serialize_product(product) for product in db.query(Product).order_by(Product.id.asc()).all()]
    faq_data = [_serialize_faq(item) for item in db.query(FAQItem).order_by(FAQItem.id.asc()).all()]
    orders_data = [_serialize_order(order) for order in db.query(Order).order_by(Order.created_at.asc()).all()]
    save_products(products_data)
    save_faq(faq_data)
    save_orders(orders_data)
    return {
        "exported_products": len(products_data),
        "exported_faq": len(faq_data),
        "exported_orders": len(orders_data),
    }


def _serialize_product(product: Product) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "category": product.category,
        "price": product.price,
        "stock": product.stock,
        "description": product.description,
        "tags": json.loads(product.tags_json or "[]"),
    }


def _serialize_faq(item: FAQItem) -> dict:
    return {"id": item.id, "question": item.question, "answer": item.answer}


def _product_payload(payload: ProductUpsertRequest) -> dict:
    return {
        "name": payload.name,
        "category": payload.category,
        "price": payload.price,
        "stock": payload.stock,
        "description": payload.description,
        "tags_json": json.dumps(payload.tags, ensure_ascii=False),
    }


def _serialize_order(order: Order) -> dict:
    return {
        "id": order.id,
        "customer_name": order.customer_name,
        "items": json.loads(order.items_json),
        "total": order.total,
        "payment_status": order.payment_status,
        "delivery_status": order.delivery_status,
        "tracking_number": order.tracking_number,
        "notes": order.notes,
        "created_at": order.created_at.isoformat(),
    }


def _next_numeric_id(items: list[dict], prefix: str) -> int:
    numbers = []
    for item in items:
        raw_id = item.get("id", "")
        if raw_id.startswith(f"{prefix}-"):
            try:
                numbers.append(int(raw_id.split("-", 1)[1]))
            except ValueError:
                continue
    return (max(numbers) if numbers else 0) + 1
