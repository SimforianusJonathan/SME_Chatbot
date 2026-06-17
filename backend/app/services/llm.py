import logging

from app.config import Settings
from app.rag.documents import SearchDocument


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Kamu adalah AI customer service untuk UMKM Indonesia bernama Toko Rasa Nusantara.

Tugas kamu:
- Jawab pertanyaan customer dengan bahasa Indonesia yang sopan, ramah, dan jelas.
- Fokus pada informasi produk, harga, stok, pembayaran, pengiriman, status order, dan FAQ.
- Gunakan hanya konteks yang diberikan oleh sistem. Jika data tidak ada di konteks, jangan berasumsi.
- Berikan jawaban singkat tetapi cukup informatif untuk membuat customer merasa terbantu.
- Jika customer membutuhkan bantuan manusia, sarankan agar case diteruskan ke admin.
- Pastikan jawaban terdengar personal, bukan robotik.

Aturan respon:
1. Jika pertanyaan tentang produk atau harga, jawab langsung dengan nama produk, harga, dan stok bila tersedia.
2. Jika pertanyaan tentang pembayaran, sebutkan metode yang tersedia dan jangan berikan informasi yang tidak pasti.
3. Jika pertanyaan tentang pengiriman, jelaskan estimasi pengiriman dan beri opsi agar customer mengonfirmasi alamat atau kurir.
4. Jika customer menanyakan status order, gunakan informasi order yang ada dan sebut nomor order bila tersedia.
5. Jika topik adalah komplain, retur, refund, atau barang rusak, jawab dengan empati dan arahkan ke admin atau tim dukungan.
6. Jika tidak ada konteks yang relevan, jawab dengan jujur bahwa informasi belum tersedia dan tawarkan untuk menghubungkan ke admin.
7. Jangan membuat detail tambahan yang tidak disebutkan dalam konteks.

Contoh gaya:
Customer: Ada kopi gula aren? Harganya berapa?
Assistant: Kopi gula aren tersedia seharga Rp28.000 per gelas. Stok masih ada. Mau saya bantu pesan?

Customer: Stok sambal bawang masih ada?
Assistant: Sambal bawang tersedia, stok 12 botol. Mau saya bantu tambahkan ke pesanan?

Customer: Bagaimana cara bayar?
Assistant: Pembayaran bisa via transfer bank, QRIS, GoPay, OVO, atau COD untuk area tertentu."""

FEW_SHOT_EXAMPLES = [
    {
        "user": "Ada kopi gula aren? Harganya berapa?",
        "assistant": "Kopi gula aren tersedia seharga Rp28.000 per gelas. Stok masih ada. Mau pesan sekarang?",
    },
    {
        "user": "Stok sambal bawang masih ada?",
        "assistant": "Sambal bawang tersedia, stok 12 botol. Mau saya bantu tambahkan ke pesanan?",
    },
    {
        "user": "Metode pembayaran apa saja yang diterima?",
        "assistant": "Pembayaran bisa via transfer bank, QRIS, GoPay, OVO, atau pembayaran di tempat untuk area tertentu.",
    },
    {
        "user": "Kalau barang rusak, bisa retur?",
        "assistant": "Bisa. Kirim foto kerusakan, nanti kami bantu proses retur atau refund.",
    },
]


class LLMService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def generate(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> tuple[str, str]:
        provider = self.settings.llm_provider.lower()
        try:
            if provider == "openai" and self.settings.openai_api_key:
                return self._openai(message, contexts), "openai"
            if provider == "groq" and self.settings.groq_api_key:
                return self._groq(message, contexts), "groq"
            if provider == "gemini" and self.settings.gemini_api_key:
                return self._gemini(message, contexts), "gemini"
        except Exception as exc:
            logger.warning("LLM provider %s failed, using mock fallback: %s", provider, exc)
        return self._mock(message, contexts), "mock"

    def _context_text(self, contexts: list[tuple[SearchDocument, float]]) -> str:
        return "\n\n".join(f"[{doc.source}:{doc.id}] {doc.content}" for doc, _ in contexts)

    def _messages(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> list[dict[str, str]]:
        context_text = self._context_text(contexts)
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        for example in FEW_SHOT_EXAMPLES:
            messages.append({"role": "user", "content": example["user"]})
            messages.append({"role": "assistant", "content": example["assistant"]})

        messages.append(
            {
                "role": "user",
                "content": (
                    f"Konteks:\n{context_text}\n\n"
                    f"Pertanyaan customer:\n{message}\n\n"
                    "Berikan jawaban singkat, ramah, dan langsung ke poin."
                ),
            }
        )
        return messages

    def _openai(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        from openai import OpenAI

        client = OpenAI(api_key=self.settings.openai_api_key, base_url=self.settings.openai_base_url, timeout=25)
        response = client.chat.completions.create(
            model=self.settings.openai_model,
            messages=self._messages(message, contexts),
            temperature=0.2,
        )
        return response.choices[0].message.content or ""

    def _groq(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        from groq import Groq

        client = Groq(api_key=self.settings.groq_api_key, timeout=25)
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
        prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"Konteks:\n{self._context_text(contexts)}\n\n"
            f"Pertanyaan customer:\n{message}\n\n"
            "Berikan jawaban singkat, ramah, dan langsung ke poin."
        )
        response = model.generate_content(prompt, request_options={"timeout": 25})
        return response.text or ""

    def _mock(self, message: str, contexts: list[tuple[SearchDocument, float]]) -> str:
        lowered = message.lower()
        if any(phrase in lowered for phrase in ["who are you", "siapa kamu", "kamu siapa", "apa kamu"]):
            return (
                "Saya AI customer service Toko Rasa Nusantara. Saya bisa bantu cek produk, harga, stok, "
                "pembayaran, pengiriman, status order, membuat pesanan sederhana, atau meneruskan kasus ke admin."
            )
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
