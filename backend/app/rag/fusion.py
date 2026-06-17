from app.rag.documents import SearchDocument


def reciprocal_rank_fusion(
    result_sets: list[list[tuple[SearchDocument, float]]],
    k: int = 60,
    limit: int = 8,
) -> list[tuple[SearchDocument, float]]:
    scores: dict[str, float] = {}
    docs: dict[str, SearchDocument] = {}

    for results in result_sets:
        for rank, (doc, _) in enumerate(results, start=1):
            docs[doc.id] = doc
            scores[doc.id] = scores.get(doc.id, 0.0) + 1.0 / (k + rank)

    ranked_ids = sorted(scores, key=scores.get, reverse=True)
    return [(docs[doc_id], scores[doc_id]) for doc_id in ranked_ids[:limit]]

