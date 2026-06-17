# UMKM AI Support Assistant

Prototype AI customer service assistant untuk UMKM Indonesia. Aplikasi ini mensimulasikan chat WhatsApp untuk menjawab pertanyaan produk, harga, stok, pembayaran, pengiriman, status order, membuat order sederhana, dan eskalasi ke admin manusia.

## Stack

- Backend: FastAPI
- Frontend: React + Vite
- Database: SQLite
- Vector database: Qdrant local Docker
- Dense embedding: `intfloat/multilingual-e5-base`
- Sparse retrieval: BM25 dengan `rank_bm25`
- Fusion: Reciprocal Rank Fusion
- Reranker: `BAAI/bge-reranker-v2-m3` optional
- LLM: OpenAI-compatible, Gemini, atau Groq API
- Fallback: mock assistant saat API/model/vector DB tidak tersedia

## Quick Start

### 1. Jalankan Qdrant

```bash
docker compose up -d qdrant
```

Qdrant tersedia di `http://localhost:6333`.

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Tanpa API key, backend tetap berjalan dengan mock fallback.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173`.

## LLM Configuration

Isi salah satu provider di `backend/.env`:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Atau:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
```

Atau:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

Untuk reranker:

```env
ENABLE_RERANKER=true
```

Catatan: embedding dan reranker pertama kali akan mengunduh model Hugging Face, jadi butuh internet saat setup awal.

## Demo Prompts

- `Ada kopi susu gula aren? harganya berapa?`
- `Stok sambal bawang masih ada?`
- `Metode pembayarannya apa saja?`
- `Cek status order ORD-1001`
- `Saya mau pesan 2 kopi susu gula aren`
- `Saya mau komplain barang rusak`

## RAG Flow

1. Data produk, FAQ, dan order dimuat dari `data/*.json`.
2. Dokumen di-index ke Qdrant menggunakan embedding multilingual E5.
3. Query user dicari dengan dense retrieval di Qdrant.
4. Query yang sama dicari dengan BM25 lokal.
5. Hasil dense dan sparse digabung dengan Reciprocal Rank Fusion.
6. Jika `ENABLE_RERANKER=true`, kandidat diurutkan ulang dengan `BAAI/bge-reranker-v2-m3`.
7. Konteks final dikirim ke LLM. Jika API key tidak tersedia, mock assistant menjawab dari konteks yang sama.

## API

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

