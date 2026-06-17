import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.data_loader import load_products
from app.database import Base, engine, get_db
from app.models import ChatSession, HandoffTicket, Message, Order
from app.schemas import ChatRequest, ChatResponse, CreateOrderRequest, HandoffRequest
from app.seed import seed_orders
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
        seed_orders(db)
    finally:
        db.close()
    rag_service.reindex()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)) -> dict:
    return chat_service.handle(db, payload.message, payload.session_id, payload.customer_name)


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
def products() -> list[dict]:
    return load_products()


@app.get("/orders/{order_id}")
def get_order(order_id: str, db: Session = Depends(get_db)) -> dict:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _serialize_order(order)


@app.post("/orders")
def create_order(payload: CreateOrderRequest, db: Session = Depends(get_db)) -> dict:
    products_by_id = {product["id"]: product for product in load_products()}
    items = []
    total = 0
    for item in payload.items:
        product = products_by_id.get(item.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"Unknown product {item.product_id}")
        if item.quantity > product["stock"]:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product['name']}")
        items.append({"product_id": product["id"], "name": product["name"], "quantity": item.quantity})
        total += product["price"] * item.quantity

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
