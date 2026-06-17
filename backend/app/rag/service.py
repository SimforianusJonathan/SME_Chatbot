from app.config import Settings
from app.rag.bm25 import BM25Retriever
from app.rag.dense import DenseRetriever
from app.rag.documents import SearchDocument, build_documents
from app.rag.fusion import reciprocal_rank_fusion
from app.rag.reranker import Reranker


class HybridRAGService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.documents = build_documents()
        self.bm25 = BM25Retriever(self.documents)
        self.dense = DenseRetriever(settings, self.documents) if settings.enable_dense_retrieval else None
        self.reranker = Reranker(settings) if settings.enable_reranker else None

    def reindex(self) -> dict:
        if self.dense:
            self.dense.ensure_index()
        return {"documents": len(self.documents), "dense_enabled": bool(self.dense)}

    def retrieve(self, query: str, limit: int = 5) -> list[tuple[SearchDocument, float]]:
        sparse_results = self.bm25.search(query, limit=10)
        dense_results = self.dense.search(query, limit=10) if self.dense else []
        fused = reciprocal_rank_fusion([dense_results, sparse_results], limit=10)
        if self.reranker:
            return self.reranker.rerank(query, fused, limit=limit)
        return fused[:limit]

