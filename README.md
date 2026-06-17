# UMKM AI Support Assistant

A working prototype of an AI-powered customer service assistant for Indonesian SMEs. The app simulates a WhatsApp-like support chatbot that can answer product questions, pricing, stock availability, payment options, delivery status, create simple orders, and hand off complex cases to a human admin.

This repository is designed for an AI Builder interview challenge, so the focus is a clean end-to-end demo, simple setup, and understandable architecture.

## Tech Stack

- Backend: FastAPI
- Frontend: React + Vite
- Database: SQLite
- Vector database: local Qdrant via Docker
- Dense embedding: `intfloat/multilingual-e5-base`
- Sparse retrieval: BM25 with `rank_bm25`
- Fusion: Reciprocal Rank Fusion
- Reranker: optional `BAAI/bge-reranker-v2-m3`
- LLM: OpenAI-compatible, Gemini, or Groq API
- Fallback: mock assistant when no API key, model, or vector database is available

## Quick Start

### 1. Start Qdrant

```bash
docker compose up -d qdrant
```

Qdrant will be available at `http://localhost:6333`.

### 2. Start the Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

The backend still works without an API key by using the mock fallback mode.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## LLM Configuration

Set one provider in `backend/.env`.

### OpenAI-Compatible

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

### Groq

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
```

### Gemini

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

### Optional Reranker

```env
ENABLE_RERANKER=true
```

Note: the embedding model and reranker are downloaded from Hugging Face on first use, so the initial setup requires internet access.

## Demo Prompts

- `Ada kopi susu gula aren? harganya berapa?`
- `Stok sambal bawang masih ada?`
- `Metode pembayarannya apa saja?`
- `Cek status order ORD-1001`
- `Saya mau pesan 2 kopi susu gula aren`
- `Saya mau komplain barang rusak`

## RAG Flow

1. Product, FAQ, and order data are loaded from `data/*.json`.
2. Documents are indexed into Qdrant using multilingual E5 embeddings.
3. The user query is searched with dense retrieval in Qdrant.
4. The same query is searched with local BM25.
5. Dense and sparse results are combined with Reciprocal Rank Fusion.
6. If `ENABLE_RERANKER=true`, candidates are reranked with `BAAI/bge-reranker-v2-m3`.
7. The final context is sent to the configured LLM. If no API key is available, the mock assistant answers from the same retrieved context.

## API Endpoints

- `POST /chat`
- `GET /products`
- `GET /orders/{order_id}`
- `POST /orders`
- `POST /handoff`
- `POST /admin/reindex`

## Repository Layout

```text
backend/
  app/
    main.py
    rag/
    services/
  requirements.txt
  .env.example
frontend/
  src/
data/
  products.json
  faq.json
  orders.json
docker-compose.yml
```

## Notes for Reviewers

- The system is intentionally lightweight and demo-oriented.
- Qdrant is used for dense retrieval, while BM25 provides a reliable local sparse fallback.
- The backend can run in mock mode without any paid API key.
- Complex or sensitive cases, such as complaints, returns, refunds, or damaged products, are escalated to a human admin handoff ticket.
