import logging
from functools import cached_property

from sentence_transformers import CrossEncoder

from app.config import Settings
from app.rag.documents import SearchDocument


logger = logging.getLogger(__name__)


class Reranker:
    def __init__(self, settings: Settings):
        self.settings = settings

    @cached_property
    def model(self) -> CrossEncoder:
        return CrossEncoder(self.settings.reranker_model)

    def rerank(self, query: str, docs: list[tuple[SearchDocument, float]], limit: int = 5) -> list[tuple[SearchDocument, float]]:
        if not docs:
            return []
        try:
            pairs = [(query, doc.content) for doc, _ in docs]
            scores = self.model.predict(pairs)
            reranked = [(docs[index][0], float(scores[index])) for index in range(len(docs))]
            return sorted(reranked, key=lambda item: item[1], reverse=True)[:limit]
        except Exception as exc:
            logger.warning("Reranker failed, using fused results: %s", exc)
            return docs[:limit]

