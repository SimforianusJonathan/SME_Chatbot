import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Headphones,
  MessageSquarePlus,
  Save,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SESSION_STORAGE_KEY = 'umkm-support-session-id';
const emptyProduct = { name: '', category: '', price: 0, stock: 0, description: '', tags: [] };
const emptyFaq = { question: '', answer: '' };
const welcomeMessage = {
  role: 'assistant',
  content: 'Halo, saya AI CS Toko Rasa Nusantara. Saya bisa bantu cek produk, harga, stok, pembayaran, pengiriman, order, atau teruskan ke admin.',
  mode: 'mock',
};

const quickPrompts = [
  'Ada kopi susu gula aren? harganya berapa?',
  'Stok sambal bawang masih ada?',
  'Metode pembayarannya apa saja?',
  'Cek status order ORD-1001',
  'Saya mau pesan 2 kopi susu gula aren',
  'Saya mau komplain barang rusak',
];

function App() {
  const [page, setPage] = useState('customer');
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_STORAGE_KEY));
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('AI assistant');
  const [isSending, setIsSending] = useState(false);
  const [products, setProducts] = useState([]);
  const [faq, setFaq] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedFaqId, setSelectedFaqId] = useState('');
  const [productForm, setProductForm] = useState(emptyProduct);
  const [faqForm, setFaqForm] = useState(emptyFaq);
  const [customerName, setCustomerName] = useState('Demo Customer');
  const [orderProductId, setOrderProductId] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [orderNotice, setOrderNotice] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [isTraining, setIsTraining] = useState(false);

  useEffect(() => {
    const savedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    loadCatalog();
    loadSessions();
    if (savedSessionId) loadHistory(savedSessionId);
  }, []);

  const lastCitations = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.citations?.length);
    return last?.citations || [];
  }, [messages]);

  async function loadCatalog() {
    const [productsResponse, faqResponse] = await Promise.all([
      fetch(`${API_URL}/products`),
      fetch(`${API_URL}/faq`),
    ]);
    if (productsResponse.ok) {
      const data = await productsResponse.json();
      setProducts(data);
      if (!orderProductId && data[0]) setOrderProductId(data[0].id);
    }
    if (faqResponse.ok) {
      setFaq(await faqResponse.json());
    }
  }

  async function loadSessions() {
    try {
      const response = await fetch(`${API_URL}/chat/sessions`);
      if (!response.ok) return;
      setSessions(await response.json());
    } catch (error) {
      setSessions([]);
    }
  }

  async function loadHistory(targetSessionId) {
    try {
      const response = await fetch(`${API_URL}/chat/sessions/${targetSessionId}`);
      if (!response.ok) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setSessionId(null);
        return;
      }

      const data = await response.json();
      setSessionId(data.session_id);
      localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
      setStatus(data.status === 'handoff' ? 'Escalated to admin' : 'AI assistant');
      setMessages(data.messages.length > 0 ? data.messages : [welcomeMessage]);
    } catch (error) {
      setMessages([welcomeMessage]);
    }
  }

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId,
          customer_name: customerName,
        }),
      });
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);

      const data = await response.json();
      setSessionId(data.session_id);
      localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
      setStatus(data.escalated ? 'Escalated to admin' : `AI assistant (${data.mode})`);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.reply,
          mode: data.mode,
          escalated: data.escalated,
          citations: data.citations,
        },
      ]);
      loadSessions();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Backend belum tersedia. Jalankan FastAPI di port 8000, lalu coba lagi.',
          mode: 'offline',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function createOrder() {
    setOrderNotice('');
    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          items: [{ product_id: orderProductId, quantity: Number(orderQuantity) }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Order failed');
      setOrderNotice(`Order ${data.id} created. Total Rp${data.total.toLocaleString('id-ID')}.`);
      await loadCatalog();
    } catch (error) {
      setOrderNotice(error.message);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      tags: Array.isArray(productForm.tags)
        ? productForm.tags
        : String(productForm.tags).split(',').map((tag) => tag.trim()).filter(Boolean),
    };
    const url = selectedProductId
      ? `${API_URL}/admin/products/${selectedProductId}`
      : `${API_URL}/admin/products`;
    const method = selectedProductId ? 'PUT' : 'POST';
    await saveAdminResource(url, method, payload, 'Product saved to database. Click Train RAG to update chatbot knowledge.');
    setSelectedProductId('');
    setProductForm(emptyProduct);
  }

  async function saveFaq(event) {
    event.preventDefault();
    const url = selectedFaqId ? `${API_URL}/admin/faq/${selectedFaqId}` : `${API_URL}/admin/faq`;
    const method = selectedFaqId ? 'PUT' : 'POST';
    await saveAdminResource(url, method, faqForm, 'FAQ saved to database. Click Train RAG to update chatbot knowledge.');
    setSelectedFaqId('');
    setFaqForm(emptyFaq);
  }

  async function saveAdminResource(url, method, payload, successMessage) {
    setAdminNotice('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Save failed');
      setAdminNotice(successMessage);
      await loadCatalog();
    } catch (error) {
      setAdminNotice(error.message);
    }
  }

  function editProduct(product) {
    setSelectedProductId(product.id);
    setProductForm({ ...product, tags: product.tags.join(', ') });
  }

  function editFaq(item) {
    setSelectedFaqId(item.id);
    setFaqForm({ question: item.question, answer: item.answer });
  }

  async function trainRag() {
    setAdminNotice('');
    setIsTraining(true);
    try {
      const response = await fetch(`${API_URL}/admin/train`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Training failed');
      setAdminNotice(
        `RAG trained from database: ${data.exported_products} products, ${data.exported_faq} FAQ, ${data.exported_orders} orders.`
      );
    } catch (error) {
      setAdminNotice(error.message);
    } finally {
      setIsTraining(false);
    }
  }

  function startNewChat() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setStatus('AI assistant');
    setMessages([welcomeMessage]);
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><ShoppingBag size={22} /></div>
          <div>
            <h1>Toko Rasa Nusantara</h1>
            <p>UMKM support inbox</p>
          </div>
        </div>

        <nav className="page-tabs" aria-label="Main pages">
          <button className={page === 'customer' ? 'active' : ''} type="button" onClick={() => setPage('customer')}>
            Customer
          </button>
          <button className={page === 'admin' ? 'active' : ''} type="button" onClick={() => setPage('admin')}>
            Admin
          </button>
        </nav>

        <section className="operator-panel">
          <div className="avatar"><Bot size={24} /></div>
          <div>
            <h2>AI Customer Service</h2>
            <p>{status}</p>
          </div>
        </section>

        <section className="history-panel">
          <div className="history-header">
            <h2>Chat history</h2>
            <button type="button" onClick={startNewChat} aria-label="Start new chat">
              <MessageSquarePlus size={18} />
            </button>
          </div>
          <div className="history-list">
            {sessions.length === 0 ? (
              <p>No saved chats yet.</p>
            ) : (
              sessions.map((session) => (
                <button
                  className={`history-item ${session.session_id === sessionId ? 'active' : ''}`}
                  key={session.session_id}
                  type="button"
                  onClick={() => {
                    setPage('customer');
                    loadHistory(session.session_id);
                  }}
                >
                  <span>{session.customer_name}</span>
                  <strong>{session.last_message}</strong>
                  <small>{session.status === 'handoff' ? 'Admin handoff' : 'AI handled'}</small>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>

      {page === 'customer' ? (
        <CustomerPage
          customerName={customerName}
          faq={faq}
          handleSubmit={handleSubmit}
          input={input}
          isSending={isSending}
          lastCitations={lastCitations}
          messages={messages}
          orderNotice={orderNotice}
          orderProductId={orderProductId}
          orderQuantity={orderQuantity}
          products={products}
          quickPrompts={quickPrompts}
          sendMessage={sendMessage}
          setCustomerName={setCustomerName}
          setInput={setInput}
          setOrderProductId={setOrderProductId}
          setOrderQuantity={setOrderQuantity}
          status={status}
          createOrder={createOrder}
        />
      ) : (
        <AdminPage
          adminNotice={adminNotice}
          editFaq={editFaq}
          editProduct={editProduct}
          faq={faq}
          faqForm={faqForm}
          productForm={productForm}
          products={products}
          saveFaq={saveFaq}
          saveProduct={saveProduct}
          selectedFaqId={selectedFaqId}
          selectedProductId={selectedProductId}
          setFaqForm={setFaqForm}
          setProductForm={setProductForm}
          setSelectedFaqId={setSelectedFaqId}
          setSelectedProductId={setSelectedProductId}
          trainRag={trainRag}
          isTraining={isTraining}
        />
      )}
    </main>
  );
}

function CustomerPage(props) {
  return (
    <section className="customer-page">
      <header className="workspace-header">
        <div>
          <h2>Customer storefront</h2>
          <p><CheckCircle2 size={14} /> Browse products, read FAQ, order items, and chat with AI support</p>
        </div>
        <div className="handoff-indicator">
          <Headphones size={16} />
          <span>{props.status.includes('Escalated') ? 'Admin needed' : 'AI handling'}</span>
        </div>
      </header>

      <div className="storefront-layout">
        <section className="catalog-panel">
          <div className="section-heading">
            <h3>Products</h3>
            <input value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} />
          </div>
          <div className="product-grid">
            {props.products.map((product) => (
              <article className="product-card" key={product.id}>
                <span>{product.category}</span>
                <h4>{product.name}</h4>
                <p>{product.description}</p>
                <footer>
                  <strong>Rp{product.price.toLocaleString('id-ID')}</strong>
                  <small>{product.stock} stock</small>
                </footer>
              </article>
            ))}
          </div>

          <div className="order-panel">
            <h3>Create order</h3>
            <div className="order-controls">
              <select value={props.orderProductId} onChange={(event) => props.setOrderProductId(event.target.value)}>
                {props.products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <input
                min="1"
                type="number"
                value={props.orderQuantity}
                onChange={(event) => props.setOrderQuantity(event.target.value)}
              />
              <button type="button" onClick={props.createOrder}>Order</button>
            </div>
            {props.orderNotice && <p className="notice">{props.orderNotice}</p>}
          </div>

          <div className="faq-panel">
            <h3>FAQ</h3>
            {props.faq.map((item) => (
              <details key={item.id}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <ChatPanel {...props} />
      </div>
    </section>
  );
}

function ChatPanel(props) {
  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="customer">
          <div className="customer-avatar"><UserRound size={22} /></div>
          <div>
            <h2>{props.customerName}</h2>
            <p><CheckCircle2 size={14} /> Online via web chat simulator</p>
          </div>
        </div>
      </header>

      <div className="messages">
        {props.messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="bubble">
              <p>{message.content}</p>
              <footer>
                <Clock3 size={12} />
                <span>{message.mode || 'sent'}</span>
              </footer>
            </div>
          </article>
        ))}
        {props.isSending && (
          <article className="message assistant">
            <div className="bubble typing">Mencari konteks dan menyusun jawaban...</div>
          </article>
        )}
      </div>

      <div className="quick-prompts">
        {props.quickPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => props.sendMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={props.handleSubmit}>
        <input
          value={props.input}
          onChange={(event) => props.setInput(event.target.value)}
          placeholder="Tulis pesan customer..."
          aria-label="Tulis pesan"
        />
        <button type="submit" disabled={props.isSending} aria-label="Kirim pesan">
          <Send size={20} />
        </button>
      </form>

      <div className="citations-strip">
        <strong>Retrieved context</strong>
        {props.lastCitations.length === 0 ? (
          <span>No retrieved context yet.</span>
        ) : (
          props.lastCitations.map((citation) => (
            <span key={`${citation.source}-${citation.title}`}>{citation.source}: {citation.title}</span>
          ))
        )}
      </div>
    </section>
  );
}

function AdminPage(props) {
  const tagsValue = Array.isArray(props.productForm.tags)
    ? props.productForm.tags.join(', ')
    : props.productForm.tags;

  return (
    <section className="admin-page">
      <header className="workspace-header">
        <div>
          <h2>Admin content manager</h2>
          <p>Edit product and FAQ records in SQLite, then train RAG from the database snapshot</p>
        </div>
        <button className="train-button" type="button" onClick={props.trainRag} disabled={props.isTraining}>
          <SlidersHorizontal size={16} />
          {props.isTraining ? 'Training...' : 'Train RAG'}
        </button>
      </header>

      {props.adminNotice && <p className="notice admin-notice">{props.adminNotice}</p>}

      <div className="admin-grid">
        <section className="admin-editor">
          <div className="section-heading">
            <h3>{props.selectedProductId ? `Edit ${props.selectedProductId}` : 'New product'}</h3>
            <button
              type="button"
              onClick={() => {
                props.setSelectedProductId('');
                props.setProductForm(emptyProduct);
              }}
            >
              New
            </button>
          </div>
          <form onSubmit={props.saveProduct}>
            <label>Name<input value={props.productForm.name} onChange={(event) => props.setProductForm({ ...props.productForm, name: event.target.value })} /></label>
            <label>Category<input value={props.productForm.category} onChange={(event) => props.setProductForm({ ...props.productForm, category: event.target.value })} /></label>
            <label>Price<input type="number" value={props.productForm.price} onChange={(event) => props.setProductForm({ ...props.productForm, price: event.target.value })} /></label>
            <label>Stock<input type="number" value={props.productForm.stock} onChange={(event) => props.setProductForm({ ...props.productForm, stock: event.target.value })} /></label>
            <label>Description<textarea value={props.productForm.description} onChange={(event) => props.setProductForm({ ...props.productForm, description: event.target.value })} /></label>
            <label>Tags<input value={tagsValue} onChange={(event) => props.setProductForm({ ...props.productForm, tags: event.target.value })} /></label>
            <button className="primary-action" type="submit"><Save size={16} /> Save product</button>
          </form>
        </section>

        <section className="admin-list">
          <h3>Products</h3>
          {props.products.map((product) => (
            <button key={product.id} type="button" onClick={() => props.editProduct(product)}>
              <span>{product.id}</span>
              <strong>{product.name}</strong>
              <small>Rp{product.price.toLocaleString('id-ID')} · {product.stock} stock</small>
            </button>
          ))}
        </section>

        <section className="admin-editor">
          <div className="section-heading">
            <h3>{props.selectedFaqId ? `Edit ${props.selectedFaqId}` : 'New FAQ'}</h3>
            <button
              type="button"
              onClick={() => {
                props.setSelectedFaqId('');
                props.setFaqForm(emptyFaq);
              }}
            >
              New
            </button>
          </div>
          <form onSubmit={props.saveFaq}>
            <label>Question<input value={props.faqForm.question} onChange={(event) => props.setFaqForm({ ...props.faqForm, question: event.target.value })} /></label>
            <label>Answer<textarea value={props.faqForm.answer} onChange={(event) => props.setFaqForm({ ...props.faqForm, answer: event.target.value })} /></label>
            <button className="primary-action" type="submit"><Save size={16} /> Save FAQ</button>
          </form>
        </section>

        <section className="admin-list">
          <h3>FAQ</h3>
          {props.faq.map((item) => (
            <button key={item.id} type="button" onClick={() => props.editFaq(item)}>
              <span>{item.id}</span>
              <strong>{item.question}</strong>
              <small>{item.answer}</small>
            </button>
          ))}
        </section>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
