# UMKM AI Support Assistant

This repository contains a working prototype of an AI-powered customer service assistant for Indonesian UMKM (small and medium enterprises). The product is designed as a demo storefront and support system in one application, built to showcase how a retrieval-augmented generation (RAG) assistant can help customers, while also enabling an admin role to manage products, FAQ knowledge, and training data.

The README is written to serve as context for an LLM or pitch deck generator, describing the system architecture, business value, role flows, and implementation details.

---

## 1. Product Summary

**UMKM AI Support Assistant** is a browser-based demo that combines:

- A customer storefront for browsing products, checking stock, placing orders, and asking questions
- An AI chat assistant that answers product, payment, shipping, and order questions in Indonesian
- An admin dashboard for managing product data, FAQ knowledge, and retraining the retrieval pipeline
- A hybrid RAG architecture that combines dense vector search, sparse BM25 search, and optional reranking

This system is ideal for pitch deck content because it demonstrates a practical AI solution for Indonesian small businesses: improving customer support, reducing manual service costs, and enabling business owners to keep their knowledge base up to date.

---

## 2. Business Goals and Value

Key value propositions:

- **Faster support for customers:** AI assistant answers common questions instantly without waiting for human staff.
- **Better knowledge management:** Admin can update FAQs and product details, then refresh the AI context with a single button.
- **Practical UMKM use case:** Tailored for Indonesian commerce scenarios like local products, cashless payments, delivery, stock checks, and complaints.
- **Cost-efficient prototype:** Uses SQLite and local Qdrant for data, with an LLM connection layer that supports OpenAI/Gemini/Groq.
- **Escalation path:** The system detects complaint or refund-related cases and escalates them to a human workflow.

Target audience for the pitch:

- Retail/UMKM owners who want an AI-assisted support channel
- Product teams exploring RAG-driven customer support
- Investors interested in localized commerce + generative AI applications

---

## 3. System Architecture

### 3.1 Backend services

The backend lives in `backend/app/` and includes:

- `main.py`: FastAPI app, startup logic, endpoints for chat, sessions, products, FAQ, orders, admin actions, and train/reindex
- `models.py`: SQLAlchemy ORM models for chat sessions, messages, products, FAQ items, orders, and handoff tickets
- `schemas.py`: Pydantic request/response models for validation and API contracts
- `config.py`: Settings loader for environment variables, including provider config and Qdrant settings
- `database.py`: SQLite engine setup and database session factory
- `seed.py`: initial demo seed data loader for products, FAQ, and orders
- `services/chat.py`: chat orchestration, order-detection workflow, message persistence, and escalation logic
- `services/llm.py`: LLM abstraction layer and prompt engineering for OpenAI, Gemini, Groq, and mock fallback
- `rag/service.py`: Hybrid retrieval service integrating BM25, dense search, fusion, and reranking

### 3.2 Frontend

The frontend lives in `frontend/` and is built with React and Vite.

Key concepts:

- Role-based workspace: `customer` and `admin` flows
- Route-based pages with `react-router-dom`
- Form-driven product and FAQ management for admin users
- Customer order creation, product browsing, FAQ browsing, and AI chat UI
- Session persistence using `localStorage`

### 3.3 Retrieval and knowledge flow

The system uses a hybrid RAG approach:

- **Dense retrieval:** Qdrant vector search based on multilingual E5 embeddings
- **Sparse retrieval:** BM25 search over the same document content
- **Fusion:** reciprocal rank fusion combines dense and sparse ranking lists
- **Optional reranker:** `BAAI/bge-reranker-v2-m3` can rerank candidate passages
- **Prompt engineering:** the final prompt includes a task instruction, examples, and retrieved context

This architecture allows the chat assistant to answer from structured product/FAQ/order knowledge without fine-tuning the LLM.

---

## 4. Product and role flows

### 4.1 Customer experience

A customer user can:

- Browse the product catalog
- Search and filter products by name or category
- Check stock and price information
- Create a simple order from the storefront
- Read FAQ articles
- Chat with the AI assistant about products, payment, delivery, and order status

Customer chat behavior:

- User question is sent to `POST /chat`
- The backend retrieves relevant documents from the RAG pipeline
- The prompt is constructed using a system instruction, few-shot examples, and retrieved context
- The selected LLM provider returns an answer
- If the user asks to `pesan`, `order`, or `beli`, the system may create a simple order automatically
- If the user mentions complaint/refund/damaged items, the message is escalated to admin and a handoff ticket is created

### 4.2 Admin experience

An admin user can:

- Add or update products via `/admin/products` and `/admin/products/{product_id}`
- Add or update FAQ knowledge via `/admin/faq` and `/admin/faq/{faq_id}`
- Trigger `Train RAG` to export current SQLite data and rebuild retrieval indexes
- View chat session history and delete old sessions
- Inspect chat session details and escalation status

Admin responsibilities in a pitch context:

- Keep product data accurate
- Maintain FAQ knowledge for customer support
- Retrain the RAG index when data changes
- Review customer escalations and support tickets

---

## 5. Data model and business objects

### 5.1 Core entities

- `Product`: id, name, category, price, stock, description, tags
- `FAQItem`: id, question, answer
- `Order`: id, customer name, items, total, payment status, delivery status, tracking number
- `ChatSession`: id, customer name, status, created timestamp
- `Message`: role, content, timestamp, linked to chat session
- `HandoffTicket`: session id, reason, status, timestamp

### 5.2 Seed data

The app seeds sample data for the demo from json files under `data/` and `backend/app/data_loader.py`.

Seed scope includes:

- Local-style products such as kopi, sambal, dan cemilan
- FAQ entries for payment, shipping, refund, and order questions
- Example orders to demonstrate order status retrieval

---

## 6. LLM and prompt engineering

This repo intentionally uses prompt engineering instead of fine-tuning.

### 6.1 Prompt strategy

The assistant prompt is designed to:

- Position the model as `AI customer service untuk UMKM Indonesia`
- Keep language in Indonesian with polite, friendly tone
- Prioritize answers using only retrieved context
- Make replies concise, factual, and customer-focused
- Escalate complaint/refund/damaged cases to admin
- Avoid hallucinations and unsupported assumptions

### 6.2 Few-shot examples

The backend includes example pairs such as:

- `Ada kopi gula aren? Harganya berapa?`
- `Stok sambal bawang masih ada?`
- `Metode pembayaran apa saja yang diterima?`
- `Kalau barang rusak, bisa retur?`

These examples help the model match the target conversational style and answer format.

### 6.3 Provider support

The system supports three modes:

- `openai`: standard OpenAI-compatible API
- `gemini`: Google Gemini API via `google-generativeai`
- `groq`: Groq chat completion API
- `mock`: fallback stub that returns deterministic responses without external calls

The chosen provider is configured through environment variables in `backend/.env`.

### 6.4 Why not fine-tuning?

The repo uses RAG because it keeps the assistant aligned with dynamic business data and avoids the cost and complexity of model fine-tuning. This makes it better suited for pitch decks focusing on practical deployment and product-market fit.

---

## 7. Technical stack

### Backend

- Python
- FastAPI
- SQLAlchemy
- SQLite
- Qdrant vector database
- `sentence-transformers` for embedding model
- `rank-bm25` for sparse retrieval
- `openai`, `google-generativeai`, `groq` clients for LLMs

### Frontend

- React
- Vite
- `react-router-dom`
- `lucide-react` for icons

### Infrastructure

- Docker Compose for Qdrant
- Local SQLite storage for quick prototyping

---

## 8. Setup and usage

### Start Qdrant

```bash
docker compose up -d qdrant
```

### Install backend dependencies

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Configure environment

Copy environment file:

```bash
copy .env.example .env
```

Set provider and API keys in `backend/.env`.

### Run backend

```bash
uvicorn app.main:app --reload --port 8000
```

### Install frontend dependencies

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and choose `customer` or `admin`.

---

## 9. API contract summary

### Chat and sessions

- `POST /chat`: send user message and receive AI assistant reply
- `POST /chat/sessions`: create a new chat session
- `GET /chat/sessions`: list existing chat sessions
- `GET /chat/sessions/{session_id}`: get session detail
- `DELETE /chat/sessions/{session_id}`: delete a chat session

### Catalog and support data

- `GET /products`: list products
- `GET /faq`: list FAQ items
- `GET /orders/{order_id}`: get order details
- `POST /orders`: create a new order from the storefront

### Admin operations

- `POST /admin/products`: create product
- `PUT /admin/products/{product_id}`: update product
- `POST /admin/faq`: create FAQ item
- `PUT /admin/faq/{faq_id}`: update FAQ item
- `POST /admin/train`: export data and rebuild retrieval indexes
- `POST /admin/reindex`: force rerun index refresh

---

## 10. Why this is good context for an LLM pitch deck

This README is structured to give an LLM the following usable signals:

- Product mission: AI customer support for Indonesian UMKM
- Dual-role experience: customer storefront + admin management
- Technical differentiators: hybrid retrieval, RAG, prompt engineering
- Business impact: faster support, better knowledge control, escalation for complaints
- Deployment story: local stack with Docker, SQLite, Qdrant, and LLM provider flexibility
- Developer story: lightweight demo, easy setup, and extensible architecture

Use this document as the basis for pitch elements like:

- Problem statement
- Solution overview
- Key features
- Architecture diagram narrative
- Go-to-market and target customer profile
- Competitive advantage through RAG and localized Indonesian support

---

## 11. Repository layout

```text
backend/
  app/
    config.py
    database.py
    data_loader.py
    main.py
    models.py
    schemas.py
    seed.py
    rag/
      bm25.py
      dense.py
      documents.py
      fusion.py
      reranker.py
      service.py
    services/
      chat.py
      llm.py
frontend/
  src/
    main.jsx
    styles.css
data/
  faq.json
  orders.json
  products.json
docker-compose.yml
```

---

## 12. Additional notes

- The system uses Indonesian-language UI copy and assistant prompts.
- The chat assistant is designed to answer with support-specific tone and avoid hallucination by relying on retrieved context.
- The app can still run in mock mode for offline demos, making it suitable for early-stage pitch presentations without external API dependency.
- The admin training flow is the main product hook: data changes in the catalog/FAQ can be reflected immediately in the AI assistant via retraining.
