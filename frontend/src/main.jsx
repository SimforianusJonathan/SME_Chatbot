import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bot, CheckCircle2, Clock3, Headphones, MessageSquarePlus, Send, ShoppingBag, UserRound } from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SESSION_STORAGE_KEY = 'umkm-support-session-id';
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
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_STORAGE_KEY));
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('AI assistant');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const savedSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
    loadSessions();
    if (!savedSessionId) return;

    loadHistory(savedSessionId);
  }, []);

  const lastCitations = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.citations?.length);
    return last?.citations || [];
  }, [messages]);

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
          customer_name: 'Demo Customer',
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      setSessionId(data.session_id);
      localStorage.setItem(SESSION_STORAGE_KEY, data.session_id);
      setStatus(data.escalated ? 'Escalated to admin' : `AI assistant (${data.mode})`);
      loadSessions();
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

  async function loadSessions() {
    try {
      const response = await fetch(`${API_URL}/chat/sessions`);
      if (!response.ok) return;
      const data = await response.json();
      setSessions(data);
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
                  onClick={() => loadHistory(session.session_id)}
                >
                  <span>{session.customer_name}</span>
                  <strong>{session.last_message}</strong>
                  <small>{session.status === 'handoff' ? 'Admin handoff' : 'AI handled'}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="citations">
          <h2>Retrieved context</h2>
          {lastCitations.length === 0 ? (
            <p>Belum ada konteks yang ditampilkan.</p>
          ) : (
            lastCitations.map((citation) => (
              <div className="citation" key={`${citation.source}-${citation.title}`}>
                <span>{citation.source}</span>
                <strong>{citation.title}</strong>
              </div>
            ))
          )}
        </section>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div className="customer">
            <div className="customer-avatar"><UserRound size={22} /></div>
            <div>
              <h2>Demo Customer</h2>
              <p><CheckCircle2 size={14} /> Online via web chat simulator</p>
            </div>
          </div>
          <div className="handoff-indicator">
            <Headphones size={16} />
            <span>{status.includes('Escalated') ? 'Admin needed' : 'AI handling'}</span>
          </div>
        </header>

        <div className="messages">
          {messages.map((message, index) => (
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
          {isSending && (
            <article className="message assistant">
              <div className="bubble typing">Mencari konteks dan menyusun jawaban...</div>
            </article>
          )}
        </div>

        <div className="quick-prompts">
          {quickPrompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => sendMessage(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Tulis pesan customer..."
            aria-label="Tulis pesan"
          />
          <button type="submit" disabled={isSending} aria-label="Kirim pesan">
            <Send size={20} />
          </button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
