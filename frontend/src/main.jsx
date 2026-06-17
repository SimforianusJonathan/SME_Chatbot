import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Headphones,
  Home,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Package,
  Save,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SESSION_STORAGE_KEY = 'umkm-support-session-id';
const ROLE_STORAGE_KEY = 'umkm-support-role';
const CHAT_TIMEOUT_MS = 45000;
const emptyProduct = { name: '', category: '', price: 0, stock: 0, description: '', tags: [] };
const emptyFaq = { question: '', answer: '' };

const welcomeMessage = {
  role: 'assistant',
  content: 'Halo, saya AI CS Toko Rasa Nusantara. Saya bisa bantu cek produk, harga, stok, pembayaran, pengiriman, order, atau teruskan ke admin.',
  mode: 'system',
};

const quickPrompts = [
  'Ada kopi susu gula aren? harganya berapa?',
  'Stok sambal bawang masih ada?',
  'Metode pembayarannya apa saja?',
  'Cek status order ORD-1001',
  'Saya mau pesan 2 kopi susu gula aren',
  'Saya mau komplain barang rusak',
];

const roleSections = {
  customer: [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Order', icon: ClipboardList },
    { id: 'faq', label: 'FAQ', icon: Headphones },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  ],
  admin: [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'faq', label: 'FAQ', icon: Headphones },
    { id: 'train', label: 'Train RAG', icon: SlidersHorizontal },
    { id: 'chats', label: 'Chat History', icon: MessageSquare },
  ],
};

function App() {
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY));
  const [section, setSection] = useState('home');
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
  const [trainStatus, setTrainStatus] = useState({
    state: 'idle',
    detail: 'Train RAG after product, FAQ, or order data changes.',
  });

  useEffect(() => {
    loadCatalog();
    loadSessions();
    const savedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSessionId) loadHistory(savedSessionId);
  }, []);

  const lastCitations = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.citations?.length);
    return last?.citations || [];
  }, [messages]);

  const lowStockCount = products.filter((product) => product.stock <= 5).length;
  const totalStock = products.reduce((total, product) => total + Number(product.stock), 0);

  async function loadCatalog() {
    const [productsResponse, faqResponse] = await Promise.all([
      fetch(`${API_URL}/products`),
      fetch(`${API_URL}/faq`),
    ]);
    if (productsResponse.ok) {
      const data = await productsResponse.json();
      setProducts(data);
      setOrderProductId((current) => current || data[0]?.id || '');
    }
    if (faqResponse.ok) setFaq(await faqResponse.json());
  }

  async function loadSessions() {
    try {
      const response = await fetch(`${API_URL}/chat/sessions`);
      if (response.ok) setSessions(await response.json());
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

  async function createNewChat() {
    const response = await fetch(`${API_URL}/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: customerName }),
    });
    const data = await response.json();
    if (!response.ok) return;
    setSessionId(data.session_id);
    localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
    setStatus('AI assistant');
    await loadHistory(data.session_id);
    await loadSessions();
    setSection(role === 'admin' ? 'chats' : 'chat');
  }

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const response = await fetch(`${API_URL}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: customerName }),
      });
      const data = await response.json();
      activeSessionId = data.session_id;
      setSessionId(activeSessionId);
      localStorage.setItem(SESSION_STORAGE_KEY, activeSessionId);
    }

    setInput('');
    setIsSending(true);
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          session_id: activeSessionId,
          customer_name: customerName,
        }),
      });
      window.clearTimeout(timeoutId);
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
      const errorMessage = error.name === 'AbortError'
        ? 'Respons AI terlalu lama. Coba lagi, atau gunakan mode mock/API key lain.'
        : 'Backend belum tersedia. Jalankan FastAPI di port 8000, lalu coba lagi.';
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: errorMessage, mode: 'offline' },
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
    const url = selectedProductId ? `${API_URL}/admin/products/${selectedProductId}` : `${API_URL}/admin/products`;
    const method = selectedProductId ? 'PUT' : 'POST';
    await saveAdminResource(url, method, payload, 'Product saved to database. Click Train RAG before testing chatbot knowledge.');
    setSelectedProductId('');
    setProductForm(emptyProduct);
  }

  async function saveFaq(event) {
    event.preventDefault();
    const url = selectedFaqId ? `${API_URL}/admin/faq/${selectedFaqId}` : `${API_URL}/admin/faq`;
    const method = selectedFaqId ? 'PUT' : 'POST';
    await saveAdminResource(url, method, faqForm, 'FAQ saved to database. Click Train RAG before testing chatbot knowledge.');
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

  async function trainRag() {
    setAdminNotice('');
    setIsTraining(true);
    setTrainStatus({
      state: 'waiting',
      detail: 'Training is running. The backend is exporting SQLite records to JSON and rebuilding retrieval indexes.',
    });
    try {
      const response = await fetch(`${API_URL}/admin/train`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Training failed');
      const message = `Completed. Exported ${data.exported_products} products, ${data.exported_faq} FAQ, and ${data.exported_orders} orders. Indexed ${data.documents} documents.`;
      setAdminNotice(message);
      setTrainStatus({ state: 'completed', detail: message });
    } catch (error) {
      setAdminNotice(error.message);
      setTrainStatus({ state: 'failed', detail: error.message });
    } finally {
      setIsTraining(false);
    }
  }

  function login(nextRole) {
    setRole(nextRole);
    setSection('home');
    localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
  }

  function logout() {
    setRole(null);
    setSection('home');
    localStorage.removeItem(ROLE_STORAGE_KEY);
  }

  function editProduct(product) {
    setSelectedProductId(product.id);
    setProductForm({ ...product, tags: product.tags.join(', ') });
    setSection('products');
  }

  function editFaq(item) {
    setSelectedFaqId(item.id);
    setFaqForm({ question: item.question, answer: item.answer });
    setSection('faq');
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  if (!role) return <LoginPage onLogin={login} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><ShoppingBag size={22} /></div>
          <div>
            <h1>Toko Rasa Nusantara</h1>
            <p>{role === 'admin' ? 'Admin workspace' : 'Customer workspace'}</p>
          </div>
        </div>

        <nav className="section-nav" aria-label="Workspace sections">
          {roleSections[role].map((item) => {
            const Icon = item.icon;
            return (
              <button className={section === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setSection(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button className="logout-button" type="button" onClick={logout}>
          <LogOut size={17} />
          Change role
        </button>
      </header>

      {role === 'customer' ? (
        <CustomerDashboard
          activeSection={section}
          createNewChat={createNewChat}
          createOrder={createOrder}
          customerName={customerName}
          faq={faq}
          handleSubmit={handleSubmit}
          input={input}
          isSending={isSending}
          lastCitations={lastCitations}
          lowStockCount={lowStockCount}
          messages={messages}
          orderNotice={orderNotice}
          orderProductId={orderProductId}
          orderQuantity={orderQuantity}
          products={products}
          quickPrompts={quickPrompts}
          sendMessage={sendMessage}
          sessions={sessions}
          sessionId={sessionId}
          setCustomerName={setCustomerName}
          setInput={setInput}
          setOrderProductId={setOrderProductId}
          setOrderQuantity={setOrderQuantity}
          setSection={setSection}
          status={status}
          totalStock={totalStock}
          loadHistory={loadHistory}
        />
      ) : (
        <AdminDashboard
          activeSection={section}
          adminNotice={adminNotice}
          editFaq={editFaq}
          editProduct={editProduct}
          faq={faq}
          faqForm={faqForm}
          isTraining={isTraining}
          lowStockCount={lowStockCount}
          productForm={productForm}
          products={products}
          saveFaq={saveFaq}
          saveProduct={saveProduct}
          selectedFaqId={selectedFaqId}
          selectedProductId={selectedProductId}
          sessions={sessions}
          sessionId={sessionId}
          setFaqForm={setFaqForm}
          setProductForm={setProductForm}
          setSelectedFaqId={setSelectedFaqId}
          setSelectedProductId={setSelectedProductId}
          setSection={setSection}
          totalStock={totalStock}
          trainRag={trainRag}
          trainStatus={trainStatus}
          createNewChat={createNewChat}
          loadHistory={loadHistory}
        />
      )}
    </main>
  );
}

function LoginPage({ onLogin }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand large">
          <div className="brand-icon"><ShoppingBag size={26} /></div>
          <div>
            <h1>Toko Rasa Nusantara</h1>
            <p>AI-powered UMKM support assistant</p>
          </div>
        </div>
        <div className="role-grid">
          <button type="button" onClick={() => onLogin('customer')}>
            <UserRound size={28} />
            <strong>Customer</strong>
            <span>Browse products, order items, read FAQ, and chat with support.</span>
          </button>
          <button type="button" onClick={() => onLogin('admin')}>
            <SlidersHorizontal size={28} />
            <strong>Admin</strong>
            <span>Manage products, FAQ, RAG training, and customer conversations.</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function CustomerDashboard(props) {
  return (
    <section className="workspace">
      {props.activeSection === 'home' && (
        <LandingPage
          role="customer"
          title="Shop local favorites with AI support on standby"
          subtitle="Browse UMKM products, create a simple order, read store FAQ, or ask the assistant when you need help."
          cards={[
            ['Products', props.products.length, 'Ready-to-order catalog items.'],
            ['FAQ Articles', props.faq.length, 'Store policies and delivery answers.'],
            ['Total Stock', props.totalStock, 'Available units across all products.'],
            ['Low Stock', props.lowStockCount, 'Items that need attention soon.'],
          ]}
          primaryAction="Start AI Chat"
          secondaryAction="Browse Products"
          onPrimary={() => props.setSection('chat')}
          onSecondary={() => props.setSection('products')}
        />
      )}
      {props.activeSection === 'products' && <ProductCatalog products={props.products} />}
      {props.activeSection === 'orders' && <OrderSection {...props} />}
      {props.activeSection === 'faq' && <FaqList faq={props.faq} />}
      {props.activeSection === 'chat' && <ChatWorkspace {...props} />}
    </section>
  );
}

function AdminDashboard(props) {
  return (
    <section className="workspace">
      {props.adminNotice && <p className="notice workspace-notice">{props.adminNotice}</p>}
      {props.activeSection === 'home' && (
        <LandingPage
          role="admin"
          title="Manage store knowledge before the assistant answers"
          subtitle="Update product and FAQ records in SQLite, review conversations, then train RAG from the dedicated training section."
          cards={[
            ['Products', props.products.length, 'Product records stored in SQLite.'],
            ['FAQ Articles', props.faq.length, 'Editable customer support answers.'],
            ['Customer Chats', props.sessions.length, 'Saved chat sessions.'],
            ['Low Stock', props.lowStockCount, 'Products with 5 or fewer units.'],
          ]}
          primaryAction="Manage Products"
          secondaryAction="Open Train RAG"
          onPrimary={() => props.setSection('products')}
          onSecondary={() => props.setSection('train')}
        />
      )}
      {props.activeSection === 'products' && <AdminProductSection {...props} />}
      {props.activeSection === 'faq' && <AdminFaqSection {...props} />}
      {props.activeSection === 'train' && <TrainSection {...props} />}
      {props.activeSection === 'chats' && <ChatHistorySection {...props} />}
    </section>
  );
}

function LandingPage({ cards, onPrimary, onSecondary, primaryAction, role, secondaryAction, subtitle, title }) {
  return (
    <section className={`landing-page ${role}`}>
      <div className="landing-hero">
        <span>{role === 'admin' ? 'Store operations' : 'Customer service'}</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        <div className="landing-actions">
          <button className="primary-action" type="button" onClick={onPrimary}>{primaryAction}</button>
          <button className="secondary-action" type="button" onClick={onSecondary}>{secondaryAction}</button>
        </div>
      </div>
      <div className="stat-grid">
        {cards.map(([label, value, detail]) => (
          <article className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductCatalog({ products }) {
  return (
    <section className="content-section">
      <div className="product-grid">
        {products.map((product) => (
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
    </section>
  );
}

function OrderSection(props) {
  return (
    <section className="content-section narrow">
      <div className="form-panel">
        <h3>Create order</h3>
        <label>Customer name<input value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} /></label>
        <label>Product
          <select value={props.orderProductId} onChange={(event) => props.setOrderProductId(event.target.value)}>
            {props.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label>Quantity<input min="1" type="number" value={props.orderQuantity} onChange={(event) => props.setOrderQuantity(event.target.value)} /></label>
        <button className="primary-action" type="button" onClick={props.createOrder}>Create order</button>
        {props.orderNotice && <p className="notice">{props.orderNotice}</p>}
      </div>
    </section>
  );
}

function FaqList({ faq }) {
  return (
    <section className="content-section narrow">
      <div className="faq-panel">
        {faq.map((item) => (
          <details key={item.id}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ChatWorkspace(props) {
  return (
    <section className="chat-workspace">
      <ChatHistoryList {...props} />
      <ChatPanel {...props} />
    </section>
  );
}

function ChatHistorySection(props) {
  return (
    <section className="content-section narrow">
      <ChatHistoryList {...props} />
    </section>
  );
}

function ChatHistoryList(props) {
  return (
    <aside className="history-panel">
      <div className="history-header">
        <h3>Chat history</h3>
        <button type="button" onClick={props.createNewChat} aria-label="Start new chat"><MessageSquarePlus size={18} /></button>
      </div>
      <div className="history-list">
        {props.sessions.length === 0 ? (
          <p>No saved chats yet.</p>
        ) : (
          props.sessions.map((session) => (
            <button
              className={`history-item ${session.session_id === props.sessionId ? 'active' : ''}`}
              key={session.session_id}
              type="button"
              onClick={() => props.loadHistory(session.session_id)}
            >
              <span>{session.customer_name}</span>
              <strong>{session.last_message}</strong>
              <small>{session.status === 'handoff' ? 'Admin handoff' : 'AI handled'}</small>
            </button>
          ))
        )}
      </div>
    </aside>
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
            <p><CheckCircle2 size={14} /> {props.status}</p>
          </div>
        </div>
        <button className="secondary-action" type="button" onClick={props.createNewChat}>
          <MessageSquarePlus size={17} /> New chat
        </button>
      </header>
      <div className="messages">
        {props.messages.map((message, index) => (
          <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="bubble">
              <p>{message.content}</p>
              <footer>{message.mode || 'sent'}</footer>
            </div>
          </article>
        ))}
        {props.isSending && <article className="message assistant"><div className="bubble typing">Mencari konteks dan menyusun jawaban...</div></article>}
      </div>
      <div className="quick-prompts">
        {quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => props.sendMessage(prompt)}>{prompt}</button>)}
      </div>
      <form className="composer" onSubmit={props.handleSubmit}>
        <input value={props.input} onChange={(event) => props.setInput(event.target.value)} placeholder="Tulis pesan customer..." />
        <button type="submit" disabled={props.isSending} aria-label="Kirim pesan"><Send size={20} /></button>
      </form>
      <div className="citations-strip">
        <strong>Retrieved context</strong>
        {props.lastCitations.length === 0 ? <span>No retrieved context yet.</span> : props.lastCitations.map((citation) => <span key={`${citation.source}-${citation.title}`}>{citation.source}: {citation.title}</span>)}
      </div>
    </section>
  );
}

function AdminProductSection(props) {
  const tagsValue = Array.isArray(props.productForm.tags) ? props.productForm.tags.join(', ') : props.productForm.tags;
  return (
    <section className="admin-grid">
      <div className="form-panel">
        <div className="section-heading">
          <h3>{props.selectedProductId ? `Edit ${props.selectedProductId}` : 'New product'}</h3>
          <button type="button" onClick={() => { props.setSelectedProductId(''); props.setProductForm(emptyProduct); }}>New</button>
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
      </div>
      <ListPanel title="Products" items={props.products} onSelect={props.editProduct} renderMeta={(product) => `Rp${product.price.toLocaleString('id-ID')} · ${product.stock} stock`} />
    </section>
  );
}

function AdminFaqSection(props) {
  return (
    <section className="admin-grid">
      <div className="form-panel">
        <div className="section-heading">
          <h3>{props.selectedFaqId ? `Edit ${props.selectedFaqId}` : 'New FAQ'}</h3>
          <button type="button" onClick={() => { props.setSelectedFaqId(''); props.setFaqForm(emptyFaq); }}>New</button>
        </div>
        <form onSubmit={props.saveFaq}>
          <label>Question<input value={props.faqForm.question} onChange={(event) => props.setFaqForm({ ...props.faqForm, question: event.target.value })} /></label>
          <label>Answer<textarea value={props.faqForm.answer} onChange={(event) => props.setFaqForm({ ...props.faqForm, answer: event.target.value })} /></label>
          <button className="primary-action" type="submit"><Save size={16} /> Save FAQ</button>
        </form>
      </div>
      <ListPanel title="FAQ" items={props.faq} onSelect={props.editFaq} labelKey="id" titleKey="question" renderMeta={(item) => item.answer} />
    </section>
  );
}

function TrainSection(props) {
  return (
    <section className="content-section narrow">
      <div className="form-panel">
        <h3>Train chatbot knowledge</h3>
        <p className="muted">This exports products, FAQ, and orders from SQLite into JSON snapshots, then rebuilds the RAG index.</p>
        <div className={`train-status ${props.trainStatus.state}`}>
          <strong>{props.trainStatus.state === 'waiting' ? 'Waiting' : props.trainStatus.state === 'completed' ? 'Completed' : props.trainStatus.state === 'failed' ? 'Failed' : 'Ready'}</strong>
          <p>{props.trainStatus.detail}</p>
        </div>
        <button className="primary-action" type="button" onClick={props.trainRag} disabled={props.isTraining}>
          <SlidersHorizontal size={16} /> {props.isTraining ? 'Training...' : 'Train RAG'}
        </button>
      </div>
    </section>
  );
}

function ListPanel({ title, items, onSelect, labelKey = 'id', titleKey = 'name', renderMeta }) {
  return (
    <div className="list-panel">
      <h3>{title}</h3>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item)}>
          <span>{item[labelKey]}</span>
          <strong>{item[titleKey]}</strong>
          <small>{renderMeta(item)}</small>
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
