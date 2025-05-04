import { useState, useEffect, useRef } from "react";
import { Hash, Send } from "lucide-react";

// --- helpers -------------------------------------------------------------
const API = "http://localhost:8080";
const WS_URL = API.replace(/^http/, "ws");

async function fetchJSON(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

// --- custom hook: live chat ---------------------------------------------
function useChat(channelId) {
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!channelId) return;

    const ws = new WebSocket(`${WS_URL}/ws/${channelId}`);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === "history") setMessages(msg.data);
      if (msg.type === "message")
        setMessages((prev) => [...prev, msg.data]);
    };

    return () => ws.close();
  }, [channelId]);

  function send(text) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
    }
  }

  return { messages, send };
}

// --- UI components -------------------------------------------------------
function ChannelItem({ ch, active, onSelect }) {
  return (
    <div
      onClick={() => onSelect(ch)}
      className={`flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-200 cursor-pointer ${
        active?.id === ch.id ? "bg-gray-300 font-medium" : ""
      }`}
    >
      <Hash size={16} /> {ch.name}
    </div>
  );
}

function Sidebar({ channels, active, onSelect }) {
  return (
    <aside className="w-64 shrink-0 border-r h-full overflow-y-auto bg-white">
      <header className="px-4 py-3 font-bold text-lg border-b">Channels</header>
      <nav className="p-2 space-y-1">
        {channels.map((ch) => (
          <ChannelItem key={ch.id} ch={ch} active={active} onSelect={onSelect} />
        ))}
      </nav>
    </aside>
  );
}

function Message({ msg }) {
  const date = new Date(msg.sent_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex items-start gap-2">
      <div className="h-8 w-8 rounded-full bg-indigo-500 text-white flex items-center justify-center uppercase text-sm">
        {msg.author[0]}
      </div>
      <div>
        <div className="flex gap-2 items-baseline">
          <span className="font-semibold">{msg.author}</span>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <p>{msg.content}</p>
      </div>
    </div>
  );
}

function ChatPane({ channel }) {
  const { messages, send } = useChat(channel.id);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!draft.trim()) return;
    send(draft.trim());
    setDraft("");
  };

  return (
    <section className="flex flex-col flex-1 h-full">
      <header className="p-4 border-b font-semibold flex items-center gap-2">
        <Hash size={18} /> {channel.name}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((m) => (
          <Message key={m.id} msg={m} />
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="p-3 border-t flex gap-2 items-center">
        <input
          className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring"
          placeholder={`Message #${channel.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <button
          onClick={handleSend}
          className="p-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Send size={16} />
        </button>
      </footer>
    </section>
  );
}

// --- main app ------------------------------------------------------------
export default function SlackApp() {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    fetchJSON("/channels").then((chs) => {
      setChannels(chs);
      setActive((prev) => prev || chs[0]);
    });
  }, []);

  return (
    <div className="h-screen flex overflow-hidden font-sans text-sm text-gray-900">
      <Sidebar channels={channels} active={active} onSelect={setActive} />
      {active && <ChatPane channel={active} />}
    </div>
  );
}
