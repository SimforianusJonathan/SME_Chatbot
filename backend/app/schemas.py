from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None
    customer_name: str | None = None


class Citation(BaseModel):
    source: str
    title: str
    score: float


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    mode: str
    escalated: bool = False
    citations: list[Citation] = []


class OrderItemRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)


class CreateOrderRequest(BaseModel):
    customer_name: str
    items: list[OrderItemRequest]


class HandoffRequest(BaseModel):
    session_id: str
    reason: str


class ProductUpsertRequest(BaseModel):
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    price: int = Field(ge=0)
    stock: int = Field(ge=0)
    description: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class FAQUpsertRequest(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
