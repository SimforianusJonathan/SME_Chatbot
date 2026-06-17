import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BadgePercent,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Database,
  Headphones,
  Home,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  Package,
  Save,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
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
    { id: 'products', label: 'Produk', icon: Package },
    { id: 'orders', label: 'Pesanan', icon: ClipboardList },
    { id: 'faq', label: 'FAQ', icon: Headphones },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  ],
  admin: [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'products', label: 'Produk', icon: Package },
    { id: 'faq', label: 'FAQ', icon: Headphones },
    { id: 'train', label: 'Train RAG', icon: SlidersHorizontal },
    { id: 'chats', label: 'Chat History', icon: MessageSquare },
  ],
};

function formatPrice(value) {
  return `Rp${Number(value || 0).toLocaleString('id-ID')}`;
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return String(tags).split(',').map((tag) => tag.trim()).filter(Boolean);
}

function getCategoryTone(category = '') {
  const text = category.toLowerCase();
  if (text.includes('kopi') || text.includes('coffee') || text.includes('minum')) return 'coffee';
  if (text.includes('sambal') || text.includes('spice') || text.includes('pedas')) return 'spice';
  if (text.includes('snack') || text.includes('camil') || text.includes('makanan')) return 'snack';
  if (text.includes('gift') || text.includes('bundle') || text.includes('paket')) return 'bundle';
  return 'default';
}

function getProductEmoji(product) {
  const tone = getCategoryTone(product.category || product.name);
  if (tone === 'coffee') return '☕';
  if (tone === 'spice') return '🌶️';
  if (tone === 'snack') return '🍪';
  if (tone === 'bundle') return '🎁';
  return '🛍️';
}

function stockStatus(stock) {
  const value = Number(stock || 0);
  if (value <= 0) return ['Habis', 'danger'];
  if (value <= 5) return ['Stok rendah', 'warning'];
  return ['Tersedia', 'success'];
}

function App() {
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY));
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
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const section = location.pathname.split('/')[2] || 'home';

  useEffect(() => {
    loadCatalog();
    loadSessions();
    const savedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSessionId) loadHistory(savedSessionId);
  }, []);

  useEffect(() => {
    if (!role && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [role, location.pathname]);

  const lastCitations = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.citations?.length);
    return last?.citations || [];
  }, [messages]);

  const lowStockCount = products.filter((product) => product.stock <= 5).length;
  const totalStock = products.reduce((total, product) => total + Number(product.stock), 0);

  async function loadCatalog() {
    try {
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
    } catch (error) {
      console.error('Failed to load catalog:', error);
      setProducts([]);
      setFaq([]);
    }
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
    navigate(role === 'admin' ? '/admin/chats' : '/customer/chat');
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
      setOrderNotice(`Order ${data.id} berhasil dibuat. Total ${formatPrice(data.total)}.`);
      await loadCatalog();
    } catch (error) {
      setOrderNotice(error.message);
    }
  }

  async function deleteChatSession(sessionIdToDelete) {
    if (!sessionIdToDelete) return;
    setIsDeletingSession(true);
    try {
      const response = await fetch(`${API_URL}/chat/sessions/${sessionIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Hapus chat gagal');
      if (sessionIdToDelete === sessionId) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setSessionId(null);
        setMessages([welcomeMessage]);
        setStatus('AI assistant');
      }
      await loadSessions();
    } catch (error) {
      console.error('Delete session failed', error);
      alert(error.message || 'Gagal menghapus sesi chat.');
    } finally {
      setIsDeletingSession(false);
    }
  }

  async function confirmDeleteChatSession(sessionIdToDelete) {
    const accepted = window.confirm('Yakin ingin menghapus sesi chat ini? Aksi ini tidak bisa dikembalikan.');
    if (!accepted) return;
    await deleteChatSession(sessionIdToDelete);
  }

  async function saveProduct(event) {
    event.preventDefault();
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      stock: Number(productForm.stock),
      tags: normalizeTags(productForm.tags),
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
    localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
    navigate(`/${nextRole}/home`);
  }

  function logout() {
    setRole(null);
    localStorage.removeItem(ROLE_STORAGE_KEY);
    navigate('/');
  }

  function editProduct(product) {
    setSelectedProductId(product.id);
    setProductForm({ ...product, tags: normalizeTags(product.tags).join(', ') });
    navigate(`/${role}/products`);
  }

  function editFaq(item) {
    setSelectedFaqId(item.id);
    setFaqForm({ question: item.question, answer: item.answer });
    navigate(`/${role}/faq`);
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="app-shell">
      {role && location.pathname !== '/' && (
        <header className="topbar">
          <div className="brand">
            <div className="brand-icon"><ShoppingBag size={22} /></div>
            <div>
              <h1>Toko Rasa Nusantara</h1>
              <p>{role === 'admin' ? 'Admin commerce workspace' : 'Belanja UMKM dengan AI support'}</p>
            </div>
          </div>

          <nav className="section-nav" aria-label="Workspace sections">
            {roleSections[role].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={section === item.id ? 'active' : ''}
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/${role}/${item.id}`)}
                >
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
      )}

      <Routes>
        <Route path="/" element={<LoginPage onLogin={login} />} />
        <Route
          path="/customer/*"
          element={
            role === 'customer' ? (
              <CustomerDashboard
                activeSection={section}
                canDelete
                confirmDeleteChatSession={confirmDeleteChatSession}
                createNewChat={createNewChat}
                createOrder={createOrder}
                customerName={customerName}
                faq={faq}
                handleSubmit={handleSubmit}
                input={input}
                isSending={isSending}
                isDeletingSession={isDeletingSession}
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
                setSection={(sectionName) => navigate(`/customer/${sectionName}`)}
                status={status}
                totalStock={totalStock}
                loadHistory={loadHistory}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin/*"
          element={
            role === 'admin' ? (
              <AdminDashboard
                activeSection={section}
                adminNotice={adminNotice}
                canDelete
                confirmDeleteChatSession={confirmDeleteChatSession}
                customerName={customerName}
                editFaq={editFaq}
                editProduct={editProduct}
                faq={faq}
                faqForm={faqForm}
                isTraining={isTraining}
                isDeletingSession={isDeletingSession}
                lastCitations={lastCitations}
                messages={messages}
                productForm={productForm}
                products={products}
                saveFaq={saveFaq}
                saveProduct={saveProduct}
                selectedFaqId={selectedFaqId}
                selectedProductId={selectedProductId}
                sessionId={sessionId}
                sessions={sessions}
                setFaqForm={setFaqForm}
                setProductForm={setProductForm}
                setSelectedFaqId={setSelectedFaqId}
                setSelectedProductId={setSelectedProductId}
                setSection={(sectionName) => navigate(`/admin/${sectionName}`)}
                status={status}
                totalStock={totalStock}
                trainRag={trainRag}
                trainStatus={trainStatus}
                createNewChat={createNewChat}
                loadHistory={loadHistory}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

function LoginPage({ onLogin }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <div className="brand large">
            <div className="brand-icon"><Store size={26} /></div>
            <div>
              <h1>Toko Rasa Nusantara</h1>
              <p>Modern UMKM storefront with AI customer support</p>
            </div>
          </div>
          <span className="eyebrow">Commerce demo</span>
          <h2>Customer storefront, order flow, and RAG-powered support in one app.</h2>
          <p>Pilih mode customer untuk melihat tampilan toko, atau mode admin untuk mengelola katalog dan knowledge base chatbot.</p>
          <div className="trust-row compact">
            <span><ShieldCheck size={16} /> Secure flow</span>
            <span><Sparkles size={16} /> AI assisted</span>
            <span><Truck size={16} /> Delivery ready</span>
          </div>
        </div>
        <div className="role-grid">
          <button type="button" onClick={() => onLogin('customer')}>
            <span className="role-icon"><ShoppingCart size={28} /></span>
            <strong>Customer</strong>
            <span>Browse products, create orders, read FAQ, and chat with support.</span>
            <em>Open storefront <ChevronRight size={15} /></em>
          </button>
          <button type="button" onClick={() => onLogin('admin')}>
            <span className="role-icon"><SlidersHorizontal size={28} /></span>
            <strong>Admin</strong>
            <span>Manage products, FAQ, RAG training, and customer conversations.</span>
            <em>Open dashboard <ChevronRight size={15} /></em>
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
          title="Belanja produk lokal dengan bantuan AI yang selalu siap."
          subtitle="Cari produk, cek stok, buat pesanan, dan tanyakan apa pun ke AI customer service tanpa meninggalkan toko."
          cards={[
            ['Produk', props.products.length, 'Item katalog siap dipesan.'],
            ['FAQ', props.faq.length, 'Jawaban pengiriman dan pembayaran.'],
            ['Total Stok', props.totalStock, 'Unit tersedia di seluruh katalog.'],
            ['Stok Rendah', props.lowStockCount, 'Item yang hampir habis.'],
          ]}
          primaryAction="Mulai AI Chat"
          secondaryAction="Lihat Produk"
          onPrimary={() => props.setSection('chat')}
          onSecondary={() => props.setSection('products')}
        />
      )}
      {props.activeSection === 'products' && <ProductCatalog products={props.products} onOrder={() => props.setSection('orders')} onChat={() => props.setSection('chat')} />}
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
          title="Kelola katalog dan knowledge base sebelum AI menjawab customer."
          subtitle="Update data produk dan FAQ di SQLite, review percakapan, lalu rebuild RAG index agar chatbot menjawab dari data terbaru."
          cards={[
            ['Produk', props.products.length, 'Product records stored in SQLite.'],
            ['FAQ', props.faq.length, 'Editable customer support answers.'],
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
        <div className="hero-content">
          <span className="eyebrow">{role === 'admin' ? 'Store operations' : 'Local commerce'}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <div className="landing-actions">
            <button className="primary-action" type="button" onClick={onPrimary}>{primaryAction}</button>
            <button className="secondary-action" type="button" onClick={onSecondary}>{secondaryAction}<ChevronRight size={16} /></button>
          </div>
          <div className="trust-row">
            <span><Truck size={16} /> Same-day support</span>
            <span><CreditCard size={16} /> Flexible payment</span>
            <span><ShieldCheck size={16} /> Verified catalog</span>
          </div>
        </div>
        <div className="hero-showcase" aria-hidden="true">
          <div className="floating-card product-preview one">
            <span>Best seller</span>
            <strong>Kopi Susu Gula Aren</strong>
            <p>Fresh local favorite</p>
            <b>Rp18.000</b>
          </div>
          <div className="floating-card ai-preview">
            <Sparkles size={18} />
            <div>
              <strong>AI CS Online</strong>
              <p>Jawab stok, harga, order, dan FAQ.</p>
            </div>
          </div>
          <div className="floating-card product-preview two">
            <span>Promo bundle</span>
            <strong>Sambal Bawang</strong>
            <p>Ready stock</p>
            <b>Rp35.000</b>
          </div>
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

function ProductCatalog({ products, onOrder, onChat }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const categories = useMemo(() => ['All', ...new Set(products.map((product) => product.category).filter(Boolean))], [products]);
  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const combined = `${product.name} ${product.category} ${product.description} ${normalizeTags(product.tags).join(' ')}`.toLowerCase();
      return matchesCategory && (!search || combined.includes(search));
    });
  }, [products, query, category]);

  return (
    <section className="content-section shop-section">
      <div className="shop-header">
        <div>
          <span className="eyebrow">Katalog produk</span>
          <h2>Produk UMKM pilihan</h2>
          <p>Pilih produk, cek stok, lalu lanjutkan ke order atau tanyakan detail ke AI CS.</p>
        </div>
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kopi, sambal, snack..." />
        </div>
      </div>

      <div className="category-pills">
        {categories.map((item) => (
          <button className={category === item ? 'active' : ''} key={item} type="button" onClick={() => setCategory(item)}>
            {item === 'All' ? 'Semua' : item}
          </button>
        ))}
      </div>

      <div className="product-grid ecommerce-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package size={34} />
            <strong>Produk tidak ditemukan</strong>
            <p>Coba kata kunci lain atau pilih kategori berbeda.</p>
          </div>
        ) : filteredProducts.map((product) => <ProductCard key={product.id} product={product} onOrder={onOrder} onChat={onChat} />)}
      </div>
    </section>
  );
}

function ProductCard({ product, onOrder, onChat }) {
  const [label, tone] = stockStatus(product.stock);
  const tags = normalizeTags(product.tags).slice(0, 3);

  return (
    <article className="product-card ecommerce-card">
      <div className={`product-visual ${getCategoryTone(product.category)}`}>
        <div className="discount-badge"><BadgePercent size={14} /> UMKM</div>
        <span>{getProductEmoji(product)}</span>
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span>{product.category || 'Produk'}</span>
          <div className="rating"><Star size={14} fill="currentColor" /> 4.8</div>
        </div>
        <h4>{product.name}</h4>
        <p>{product.description}</p>
        <div className="tag-row">
          {tags.length === 0 ? <small>Produk lokal</small> : tags.map((tag) => <small key={tag}>{tag}</small>)}
        </div>
      </div>
      <footer className="product-footer">
        <div>
          <strong>{formatPrice(product.price)}</strong>
          <small className={`stock-badge ${tone}`}>{label} · {product.stock} stok</small>
        </div>
        <div className="card-actions">
          <button className="secondary-action icon-only" type="button" onClick={onChat} aria-label="Ask AI"><MessageSquare size={17} /></button>
          <button className="primary-action" type="button" onClick={onOrder}><ShoppingCart size={16} /> Order</button>
        </div>
      </footer>
    </article>
  );
}

function OrderSection(props) {
  const selectedProduct = props.products.find((product) => String(product.id) === String(props.orderProductId));
  const quantity = Number(props.orderQuantity || 1);
  const subtotal = selectedProduct ? Number(selectedProduct.price) * quantity : 0;

  return (
    <section className="content-section checkout-section">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Checkout</span>
          <h2>Buat pesanan baru</h2>
          <p>Flow sederhana untuk demo order customer dari storefront.</p>
        </div>
      </div>
      <div className="checkout-grid">
        <div className="form-panel checkout-form">
          <h3>Detail customer</h3>
          <label>Customer name<input value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} /></label>
          <label>Product
            <select value={props.orderProductId} onChange={(event) => props.setOrderProductId(event.target.value)}>
              {props.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label>Quantity<input min="1" type="number" value={props.orderQuantity} onChange={(event) => props.setOrderQuantity(event.target.value)} /></label>
          <div className="payment-options">
            <span><WalletCards size={16} /> Transfer bank</span>
            <span><CreditCard size={16} /> E-wallet</span>
            <span><Truck size={16} /> Delivery</span>
          </div>
          <button className="primary-action full-width" type="button" onClick={props.createOrder}>Create order</button>
          {props.orderNotice && <p className="notice">{props.orderNotice}</p>}
        </div>

        <aside className="order-summary">
          <h3>Order summary</h3>
          {selectedProduct ? (
            <>
              <div className="summary-product">
                <div className={`summary-thumb ${getCategoryTone(selectedProduct.category)}`}>{getProductEmoji(selectedProduct)}</div>
                <div>
                  <strong>{selectedProduct.name}</strong>
                  <span>{selectedProduct.category}</span>
                </div>
              </div>
              <dl>
                <div><dt>Harga</dt><dd>{formatPrice(selectedProduct.price)}</dd></div>
                <div><dt>Quantity</dt><dd>{quantity}</dd></div>
                <div><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
                <div className="total"><dt>Total</dt><dd>{formatPrice(subtotal)}</dd></div>
              </dl>
              <p className="summary-note"><Clock3 size={15} /> Order akan disimpan ke SQLite dan bisa masuk context RAG setelah Train RAG.</p>
            </>
          ) : <p className="muted">Belum ada produk tersedia.</p>}
        </aside>
      </div>
    </section>
  );
}

function FaqList({ faq }) {
  return (
    <section className="content-section narrow faq-section">
      <div className="section-title-row">
        <div>
          <span className="eyebrow">Help center</span>
          <h2>Pertanyaan yang sering diajukan</h2>
          <p>FAQ ini juga menjadi sumber knowledge base untuk AI assistant.</p>
        </div>
      </div>
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
      <div className="history-chat-grid">
        <ChatHistoryList {...props} />
        <aside className="history-detail-panel">
          {props.sessionId ? (
            <>
              <div className="history-detail-header">
                <div>
                  <span className="eyebrow">Conversation detail</span>
                  <h3>{props.customerName || 'Customer chat'}</h3>
                </div>
                <p>{props.status || 'AI assistant'}</p>
              </div>
              <div className="history-detail-messages">
                {props.messages && props.messages.length > 0 ? (
                  props.messages.map((message) => (
                    <article key={message.id || `${message.role}-${Math.random()}`} className={`message-card ${message.role}`}>
                      <div className="message-card-head">
                        <strong>{message.role === 'user' ? 'Customer' : 'AI assistant'}</strong>
                        <span>{message.created_at ? new Date(message.created_at).toLocaleString('id-ID') : ''}</span>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  ))
                ) : (
                  <p className="muted">No messages found for this session.</p>
                )}
              </div>
            </>
          ) : (
            <div className="history-detail-empty">
              <p>Select a chat session to view the full conversation.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function ChatHistoryList(props) {
  return (
    <aside className="history-panel">
      <div className="history-header">
        <div>
          <span className="eyebrow">Support inbox</span>
          <h3>Chat history</h3>
        </div>
        <button type="button" onClick={props.createNewChat} aria-label="Start new chat"><MessageSquarePlus size={18} /></button>
      </div>
      <div className="history-list">
        {props.sessions.length === 0 ? (
          <p>No saved chats yet.</p>
        ) : (
          props.sessions.map((session) => (
            <div className={`history-item-container ${session.session_id === props.sessionId ? 'active' : ''}`} key={session.session_id}>
              <button
                className="history-item"
                type="button"
                onClick={() => props.loadHistory(session.session_id)}
              >
                <span>{session.status === 'handoff' ? 'Admin handoff' : 'AI handled'}</span>
                <strong>{session.customer_name}</strong>
                <small>{session.last_message}</small>
              </button>
              {props.canDelete && props.confirmDeleteChatSession && (
                <button
                  className="delete-session-button"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.confirmDeleteChatSession(session.session_id);
                  }}
                  disabled={props.isDeletingSession}
                  aria-label={`Delete chat session ${session.customer_name}`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
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
        <div className="chat-header-actions">
          <button className="secondary-action" type="button" onClick={props.createNewChat}>
            <MessageSquarePlus size={17} /> New chat
          </button>
          {props.canDelete && props.sessionId && props.confirmDeleteChatSession && (
            <button
              className="secondary-action danger-action"
              type="button"
              onClick={() => props.confirmDeleteChatSession(props.sessionId)}
              disabled={props.isDeletingSession}
            >
              <Trash2 size={16} /> Delete chat
            </button>
          )}
        </div>
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
        {props.isSending && <article className="message assistant"><div className="bubble typing">Mencari konteks produk dan menyusun jawaban...</div></article>}
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
          <div>
            <span className="eyebrow">Inventory</span>
            <h3>{props.selectedProductId ? `Edit ${props.selectedProductId}` : 'New product'}</h3>
          </div>
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
      <ListPanel title="Products" items={props.products} onSelect={props.editProduct} renderMeta={(product) => `${formatPrice(product.price)} · ${product.stock} stock`} />
    </section>
  );
}

function AdminFaqSection(props) {
  return (
    <section className="admin-grid">
      <div className="form-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Knowledge base</span>
            <h3>{props.selectedFaqId ? `Edit ${props.selectedFaqId}` : 'New FAQ'}</h3>
          </div>
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
    <section className="content-section narrow train-section">
      <div className="form-panel">
        <div className="section-title-row compact-title">
          <div>
            <span className="eyebrow">RAG pipeline</span>
            <h3>Train chatbot knowledge</h3>
            <p className="muted">This exports products, FAQ, and orders from SQLite into JSON snapshots, then rebuilds the RAG index.</p>
          </div>
          <div className="rag-icon"><Database size={24} /></div>
        </div>
        <div className="pipeline-steps">
          <span><Boxes size={15} /> SQLite data</span>
          <span>JSON export</span>
          <span>Hybrid retrieval</span>
          <span>AI answer</span>
        </div>
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
      <div className="list-heading">
        <span className="eyebrow">Database records</span>
        <h3>{title}</h3>
      </div>
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

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
