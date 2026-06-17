import re

from rank_bm25 import BM25Okapi

from app.rag.documents import SearchDocument


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9\-]+", text.lower())


class BM25Retriever:
    def __init__(self, documents: list[SearchDocument]):
        self.documents = documents
        self.tokens = [tokenize(f"{doc.title} {doc.content}") for doc in documents]
        self.index = BM25Okapi(self.tokens)

    def search(self, query: str, limit: int = 8) -> list[tuple[SearchDocument, float]]:
        scores = self.index.get_scores(tokenize(query))
        ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)
        return [(self.documents[index], float(score)) for index, score in ranked[:limit] if score > 0]

