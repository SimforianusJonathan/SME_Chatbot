from app.config import Settings
from app.rag.documents import SearchDocument


SYSTEM_PROMPT = """Kamu adalah AI customer service untuk UMKM Indonesia.
Jawab singkat, ramah, dan praktis dalam Bahasa Indonesia.
Gunakan hanya konteks yang diberikan untuk fakta produk, harga, stok, FAQ, dan order.
Jika kasus perlu manusia, katakan akan diteruskan ke admin."""


class LLMService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def generate(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> tuple[str, str]:
        provider = self.settings.llm_provider.lower()
        if provider == "openai" and self.settings.openai_api_key:
            return self._openai(message, contexts), "openai"
        if provider == "groq" and self.settings.groq_api_key:
            return self._groq(message, contexts), "groq"
        if provider == "gemini" and self.settings.gemini_api_key:
            return self._gemini(message, contexts), "gemini"
        return self._mock(message, contexts), "mock"

    def _context_text(self, contexts: list[tuple[SearchDocument, float]]) -> str:
        return "\n\n".join(f"[{doc.source}:{doc.id}] {doc.content}" for doc, _ in contexts)

    def _messages(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> list[dict[str, str]]:
        context_text = self._context_text(contexts)
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Konteks:\n{context_text}\n\nPertanyaan customer:\n{message}"},
        ]

    def _openai(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        from openai import OpenAI

        client = OpenAI(api_key=self.settings.openai_api_key, base_url=self.settings.openai_base_url)
        response = client.chat.completions.create(
            model=self.settings.openai_model,
            messages=self._messages(message, contexts),
            temperature=0.2,
        )
        return response.choices[0].message.content or ""

    def _groq(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        from groq import Groq

        client = Groq(api_key=self.settings.groq_api_key)
        response = client.chat.completions.create(
            model=self.settings.groq_model,
            messages=self._messages(message, contexts),
            temperature=0.2,
        )
        return response.choices[0].message.content or ""

    def _gemini(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        import google.generativeai as genai

        genai.configure(api_key=self.settings.gemini_api_key)
        model = genai.GenerativeModel(self.settings.gemini_model)
        prompt = f"{SYSTEM_PROMPT}\n\nKonteks:\n{self._context_text(contexts)}\n\nPertanyaan customer:\n{message}"
        response = model.generate_content(prompt)
        return response.text or ""

    def _mock(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        lowered = message.lower()
        if any(word in lowered for word in ["komplain", "rusak", "refund", "marah", "kecewa", "admin", "manusia"]):
            return "Saya bantu teruskan ke admin ya. Mohon tunggu sebentar, tim kami akan menangani kasus ini."

        if not contexts:
            return "Maaf, saya belum menemukan informasi yang cocok. Saya bisa bantu cek produk, stok, pembayaran, pengiriman, atau status order."

        top_doc = contexts[0][0]
        if top_doc.source == "products":
            meta = top_doc.metadata
            stock_text = "tersedia" if meta["stock"] > 0 else "sedang kosong"
            return (
                f"{meta['name']} harganya Rp{meta['price']:,}. "
                f"Stok saat ini {meta['stock']} pcs, jadi {stock_text}. "
                f"{meta['description']}"
            )
        if top_doc.source == "orders":
            meta = top_doc.metadata
            tracking = meta.get("tracking_number") or "belum tersedia"
            return (
                f"Status order {meta['id']}: pembayaran {meta['payment_status']}, "
                f"pengiriman {meta['delivery_status']}, resi {tracking}. "
                f"{meta.get('notes') or ''}"
            )
        if top_doc.source == "faq":
            return top_doc.metadata["answer"]

        return top_doc.content

