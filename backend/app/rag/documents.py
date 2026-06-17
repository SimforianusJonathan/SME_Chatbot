from dataclasses import dataclass

from app.data_loader import load_faq, load_products, load_seed_orders


@dataclass(frozen=True)
class SearchDocument:
    id: str
    source: str
    title: str
    content: str
    metadata: dict


def build_documents() -> list[SearchDocument]:
    documents: list[SearchDocument] = []

    for product in load_products():
        content = (
            f"Produk: {product['name']}\n"
            f"Kategori: {product['category']}\n"
            f"Harga: Rp{product['price']:,}\n"
            f"Stok: {product['stock']}\n"
            f"Deskripsi: {product['description']}\n"
            f"Tag: {', '.join(product.get('tags', []))}"
        )
        documents.append(
            SearchDocument(
                id=product["id"],
                source="products",
                title=product["name"],
                content=content,
                metadata=product,
            )
        )

    for faq in load_faq():
        content = f"Pertanyaan: {faq['question']}\nJawaban: {faq['answer']}"
        documents.append(
            SearchDocument(
                id=faq["id"],
                source="faq",
                title=faq["question"],
                content=content,
                metadata=faq,
            )
        )

    for order in load_seed_orders():
        items = ", ".join(f"{item['quantity']}x {item['name']}" for item in order["items"])
        content = (
            f"Order: {order['id']}\n"
            f"Customer: {order['customer_name']}\n"
            f"Items: {items}\n"
            f"Total: Rp{order['total']:,}\n"
            f"Status pembayaran: {order['payment_status']}\n"
            f"Status pengiriman: {order['delivery_status']}\n"
            f"Nomor resi: {order.get('tracking_number') or '-'}\n"
            f"Catatan: {order.get('notes') or '-'}"
        )
        documents.append(
            SearchDocument(
                id=order["id"],
                source="orders",
                title=order["id"],
                content=content,
                metadata=order,
            )
        )

    return documents

