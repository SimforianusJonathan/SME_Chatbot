import json
import re
import uuid

from sqlalchemy.orm import Session

from app.models import ChatSession, HandoffTicket, Message, Order, Product
from app.rag.service import HybridRAGService
from app.schemas import Citation
from app.services.llm import LLMService


ESCALATION_KEYWORDS = ["komplain", "rusak", "refund", "retur", "admin", "manusia", "kecewa", "marah"]


class ChatService:
    def __init__(self, rag: HybridRAGService, llm: LLMService):
        self.rag = rag
        self.llm = llm

    def handle(self, db: Session, message: str, session_id: str | None, customer_name: str | None) -> dict:
        session = self._get_or_create_session(db, session_id, customer_name)
        db.add(Message(session_id=session.id, role="user", content=message))

        maybe_order_reply = self._try_create_order(db, message, customer_name or session.customer_name or "Customer")
        if maybe_order_reply:
            reply = maybe_order_reply
            mode = "workflow"
            contexts = []
        else:
            contexts = self.rag.retrieve(message)
            reply, mode = self.llm.generate(message, contexts)

        escalated = self._should_escalate(message, reply)
        if escalated:
            session.status = "handoff"
            db.add(HandoffTicket(session_id=session.id, reason=message))

        db.add(Message(session_id=session.id, role="assistant", content=reply))
        db.commit()

        return {
            "session_id": session.id,
            "reply": reply,
            "mode": mode,
            "escalated": escalated,
            "citations": [
                Citation(source=doc.source, title=doc.title, score=round(score, 4))
                for doc, score in contexts
            ],
        }

    def _get_or_create_session(self, db: Session, session_id: str | None, customer_name: str | None) -> ChatSession:
        if session_id:
            existing = db.get(ChatSession, session_id)
            if existing:
                return existing

        session = ChatSession(id=str(uuid.uuid4()), customer_name=customer_name)
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def _should_escalate(self, message: str, reply: str) -> bool:
        text = f"{message} {reply}".lower()
        return any(keyword in text for keyword in ESCALATION_KEYWORDS)

    def _try_create_order(self, db: Session, message: str, customer_name: str) -> str | None:
        lowered = message.lower()
        if not any(word in lowered for word in ["pesan", "order", "beli"]):
            return None

        products = db.query(Product).all()
        matched = next((product for product in products if product.name.lower() in lowered), None)
        if not matched:
            matched = next(
                (
                    product
                    for product in products
                    if any(tag.lower() in lowered for tag in json.loads(product.tags_json or "[]"))
                ),
                None,
            )
        if not matched:
            return None

        quantity_match = re.search(r"\b(\d+)\b", lowered)
        quantity = int(quantity_match.group(1)) if quantity_match else 1
        if matched.stock <= 0:
            return f"Maaf, {matched.name} sedang kosong sehingga belum bisa dibuatkan pesanan."
        if quantity > matched.stock:
            return f"Stok {matched.name} hanya {matched.stock} pcs. Mau saya buatkan sesuai stok yang tersedia?"

        order_id = f"ORD-{uuid.uuid4().hex[:6].upper()}"
        total = matched.price * quantity
        items = [{"product_id": matched.id, "name": matched.name, "quantity": quantity}]
        db.add(
            Order(
                id=order_id,
                customer_name=customer_name,
                items_json=json.dumps(items, ensure_ascii=False),
                total=total,
                payment_status="waiting_payment",
                delivery_status="pending",
                tracking_number=None,
                notes="Order dibuat dari chat simulator.",
            )
        )
        matched.stock -= quantity
        return (
            f"Siap, saya buatkan order {order_id}: {quantity}x {matched.name} "
            f"dengan total Rp{total:,}. Status pembayaran masih menunggu pembayaran. "
            "Pembayaran bisa via transfer bank, QRIS, GoPay, OVO, atau COD area tertentu."
        )
