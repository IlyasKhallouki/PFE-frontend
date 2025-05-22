import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Hash, Send, Plus, X } from "lucide-react";
import {
  // api,
  listChannels,
  listUsers,
  listRecipients,
  openDm,
} from "../lib/api";

/* ------------------------------------------------------------------ */
/*  WebSocket chat hook                                               */
/* ------------------------------------------------------------------ */
const WS = "ws://localhost:8080";

function useChat(channelId) {
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!channelId) return;
    const ws = new WebSocket(`${WS}/ws/${channelId}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "history") setMessages(msg.data);
      if (msg.type === "message") setMessages((p) => [...p, msg.data]);
    };
    return () => ws.close();
  }, [channelId]);

  const send = (text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(text);
  };

  return { messages, send };
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                        */
/* ------------------------------------------------------------------ */
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

function Sidebar({ channels, active, onSelect, onCreateDM }) {
  return (
    <aside className="w-64 shrink-0 border-r h-full flex flex-col bg-white">
      <header className="px-4 py-3 flex items-center justify-between border-b">
        <span className="font-bold text-lg">Channels</span>
        <button onClick={onCreateDM} className="p-1 rounded hover:bg-gray-200">
          <Plus size={18} />
        </button>
      </header>
      <nav className="p-2 space-y-1 overflow-y-auto flex-1">
        {channels.map((ch) => (
          <ChannelItem
            key={ch.id}
            ch={ch}
            active={active}
            onSelect={onSelect}
          />
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

  useEffect(
    () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages]
  );

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
          onKeyDown={(e) =>
            e.key === "Enter" && !e.shiftKey && handleSend()
          }
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

/* ------------------  DM Modal ------------------ */
function DMModal({ open, onClose, onCreated }) {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const [sel, setSel] = useState(null);

  /* load only while open */
  useEffect(() => {
    if (!open) return;
    listUsers().then(setUsers);            // all users with email / id
    listRecipients().then(setRecipientIds); // ids ≠ me
  }, [open]);

  const createDM = async () => {
    if (!sel) return;
    const ch = await openDm(sel.id);       // {id,name,is_private}
    if (!ch) return;                       // api() auto‑redirected on 401
    if (ch.repeated) return;
    onCreated(ch);
    onClose();
    nav("/home");
  };

  if (!open) return null;

  /* filter list => display only valid recipients */
  const candidates = users.filter((u) => recipientIds.includes(u.id));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-96 p-6 space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">New direct message</h2>
          <button onClick={onClose} className="hover:text-red-600">
            <X size={18} />
          </button>
        </div>
        <ul className="max-h-60 overflow-y-auto border rounded">
          {candidates.map((u) => (
            <li
              key={u.id}
              onClick={() => setSel(u)}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                sel?.id === u.id ? "bg-indigo-100" : ""
              }`}
            >
              {u.full_name}
            </li>
          ))}
        </ul>
        <button
          disabled={!sel}
          onClick={createDM}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded"
        >
          Start chat
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */
export default function SlackApp() {
  const [channels, setChannels] = useState([]);
  const [active, setActive]     = useState(null);
  const [dmModal, setDmModal]   = useState(false);

  useEffect(() => {
    listChannels().then((chs) => {
      setChannels(chs);
      if (chs.length) setActive(chs[0]);
    });
  }, []);

  const handleDMcreated = (ch) => {
    setChannels((p) => [...p, ch]);
    setActive(ch);
  };

  return (
    <div className="h-screen flex overflow-hidden font-sans text-sm text-gray-900">
      <Sidebar
        channels={channels}
        active={active}
        onSelect={setActive}
        onCreateDM={() => setDmModal(true)}
      />
      {active && <ChatPane channel={active} />}
      <DMModal
        open={dmModal}
        onClose={() => setDmModal(false)}
        onCreated={handleDMcreated}
      />
    </div>
  );
}
