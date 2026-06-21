import logging
from functools import cached_property

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from sentence_transformers import SentenceTransformer

from app.config import Settings
from app.rag.documents import SearchDocument


logger = logging.getLogger(__name__)


class DenseRetriever:
    def __init__(self, settings: Settings, documents: list[SearchDocument]):
        self.settings = settings
        self.documents = {doc.id: doc for doc in documents}
        self.client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key, timeout=3)
        self.available = True

    @cached_property
    def model(self) -> SentenceTransformer:
        return SentenceTransformer(self.settings.embedding_model)

    def embed_query(self, query: str) -> list[float]:
        vector = self.model.encode([f"query: {query}"], normalize_embeddings=True)[0]
        return vector.tolist()

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode([f"passage: {text}" for text in texts], normalize_embeddings=True)
        return [vector.tolist() for vector in vectors]

    def ensure_index(self, force: bool = False) -> None:
        try:
            self.available = True
            collections = self.client.get_collections().collections
            names = {collection.name for collection in collections}
            if force and self.settings.qdrant_collection in names:
                self.client.delete_collection(collection_name=self.settings.qdrant_collection)
                names.remove(self.settings.qdrant_collection)

            if self.settings.qdrant_collection not in names:
                vector_size = self.model.get_sentence_embedding_dimension()
                self.client.create_collection(
                    collection_name=self.settings.qdrant_collection,
                    vectors_config=qmodels.VectorParams(size=vector_size, distance=qmodels.Distance.COSINE),
                )

            points_count = self.client.count(self.settings.qdrant_collection, exact=True).count
            if not force and points_count >= len(self.documents):
                return

            docs = list(self.documents.values())
            vectors = self.embed_passages([doc.content for doc in docs])
            points = [
                qmodels.PointStruct(
                    id=index + 1,
                    vector=vectors[index],
                    payload={
                        "doc_id": doc.id,
                        "source": doc.source,
                        "title": doc.title,
                        "content": doc.content,
                        "metadata": doc.metadata,
                    },
                )
                for index, doc in enumerate(docs)
            ]
            self.client.upsert(collection_name=self.settings.qdrant_collection, points=points)
        except Exception as exc:
            self.available = False
            logger.warning("Dense index unavailable, falling back to BM25 only: %s", exc)

    def search(self, query: str, limit: int = 8) -> list[tuple[SearchDocument, float]]:
        if not self.available:
            return []
        try:
            hits = self.client.search(
                collection_name=self.settings.qdrant_collection,
                query_vector=self.embed_query(query),
                limit=limit,
            )
        except Exception as exc:
            logger.warning("Dense search failed: %s", exc)
            return []

        results: list[tuple[SearchDocument, float]] = []
        for hit in hits:
            payload = hit.payload or {}
            doc_id = payload.get("doc_id")
            if doc_id in self.documents:
                results.append((self.documents[doc_id], float(hit.score)))
        return results
