import React, { useState, useEffect, useRef, useCallback } from "react";
import { Hash, Send, Plus, X, Users, Lock, Globe, User, MessageSquare, Search, Settings, LogOut } from "lucide-react";

// Enhanced API wrapper with better error handling
const api = async (url, opts = {}) => {
  try {
    const res = await fetch(`http://localhost:8080${url}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });

    if (res.status === 401) {
      window.location.href = "/signin";
      return null;
    }

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }
    
    return data;
  } catch (error) {
    console.error(`API Error: ${url}`, error);
    throw error;
  }
};

// API helpers
const signIn = (body) => api("/auth/login", { method: "POST", body: JSON.stringify(body) });
const listChannels = () => api("/channels");
const listUsers = () => api("/users/");
const listRecipients = () => api("/dms/recipients");
const openDm = (otherId) => api(`/dms/${otherId}`, { method: "POST" });
const searchMessages = (query, channelId) => api(`/messages/search?q=${encodeURIComponent(query)}&channel_id=${channelId}`);

// Enhanced WebSocket hook with reconnection
function useChat(channelId) {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!channelId || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`ws://localhost:8080/ws/${channelId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "history") {
        setMessages(msg.data);
      } else if (msg.type === "message") {
        setMessages((prev) => [...prev, msg.data]);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      
      // Exponential backoff reconnection
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };
  }, [channelId]);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
    }
  }, []);

  return { messages, send, connectionStatus };
}

// Enhanced Message Component with better styling
function Message({ msg, isOwn }) {
  const date = new Date(msg.sent_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex items-start gap-3 p-2 hover:bg-gray-50 rounded ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className={`h-10 w-10 rounded-full flex items-center justify-center uppercase text-sm font-medium ${
        isOwn ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700'
      }`}>
        {msg.author[0]}
      </div>
      <div className={`flex-1 ${isOwn ? 'text-right' : ''}`}>
        <div className="flex gap-2 items-baseline">
          <span className="font-semibold text-sm">{msg.author}</span>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <p className={`mt-1 text-gray-800 ${isOwn ? 'text-right' : ''}`}>{msg.content}</p>
      </div>
    </div>
  );
}

// Channel Item with icons
function ChannelItem({ ch, active, onSelect, unreadCount = 0 }) {
  const isActive = active?.id === ch.id;
  
  return (
    <div
      onClick={() => onSelect(ch)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
      }`}
    >
      {ch.is_private ? (
        <Lock size={16} className={isActive ? "text-blue-600" : "text-gray-500"} />
      ) : (
        <Hash size={16} className={isActive ? "text-blue-600" : "text-gray-500"} />
      )}
      <span className="flex-1 truncate">{ch.name}</span>
      {unreadCount > 0 && (
        <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
          {unreadCount}
        </span>
      )}
    </div>
  );
}

// Enhanced Sidebar with search
function Sidebar({ channels, active, onSelect, onCreateDM, currentUser }) {
  const [searchTerm, setSearchTerm] = useState("");
  
  const filteredChannels = channels.filter(ch => 
    ch.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const publicChannels = filteredChannels.filter(ch => !ch.is_private);
  const dmChannels = filteredChannels.filter(ch => ch.is_private);

  return (
    <aside className="w-72 shrink-0 border-r h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="p-4 border-b bg-white">
        <h1 className="font-bold text-xl text-gray-800">SecureChat</h1>
        <p className="text-sm text-gray-500 mt-1">Local Network Edition</p>
      </header>

      {/* User Info */}
      <div className="px-4 py-3 border-b bg-white flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm">
          {currentUser?.full_name?.[0] || 'U'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{currentUser?.full_name || 'User'}</p>
          <p className="text-xs text-gray-500">{currentUser?.role || 'Member'}</p>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b bg-white">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Channels */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Public Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Channels</span>
          </div>
          <div className="space-y-1">
            {publicChannels.map((ch) => (
              <ChannelItem key={ch.id} ch={ch} active={active} onSelect={onSelect} />
            ))}
          </div>
        </div>

        {/* Direct Messages */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Direct Messages</span>
            <button 
              onClick={onCreateDM} 
              className="p-1 rounded hover:bg-gray-200 transition-colors"
              title="New direct message"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {dmChannels.map((ch) => (
              <ChannelItem key={ch.id} ch={ch} active={active} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t bg-white space-y-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm">
          <Settings size={16} />
          <span>Settings</span>
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm text-red-600">
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

// Enhanced Chat Pane
function ChatPane({ channel, currentUser }) {
  const { messages, send, connectionStatus } = useChat(channel.id);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channel.id]);

  const handleSend = () => {
    if (!draft.trim()) return;
    send(draft.trim());
    setDraft("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="flex flex-col flex-1 h-full bg-white">
      {/* Header */}
      <header className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          {channel.is_private ? <Lock size={18} /> : <Hash size={18} />}
          <h2 className="font-semibold text-lg">{channel.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {connectionStatus === "connected" ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Reconnecting...
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <Message 
                key={msg.id} 
                msg={msg} 
                isOwn={msg.author === currentUser?.full_name}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <footer className="px-6 py-4 border-t">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 min-h-[44px] max-h-32 px-4 py-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={`Message #${channel.name}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || connectionStatus !== "connected"}
            className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </footer>
    </section>
  );
}

// Enhanced DM Modal
function DMModal({ open, onClose, onCreated }) {
  const [users, setUsers] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    
    Promise.all([listUsers(), listRecipients()])
      .then(([usersData, recipientIdsData]) => {
        setUsers(usersData);
        setRecipientIds(recipientIdsData);
      })
      .catch(err => setError(err.message));
  }, [open]);

  const createDM = async () => {
    if (!selected) return;
    
    setLoading(true);
    setError("");
    
    try {
      const channel = await openDm(selected.id);
      if (channel && !channel.repeated) {
        onCreated(channel);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const candidates = users.filter((u) => recipientIds.includes(u.id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">New Direct Message</h2>
          <button 
            onClick={onClose} 
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            {candidates.map((u) => (
              <div
                key={u.id}
                onClick={() => setSelected(u)}
                className={`px-4 py-3 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${
                  selected?.id === u.id 
                    ? "bg-blue-100 text-blue-700" 
                    : "hover:bg-gray-100"
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-sm">
                  {u.full_name[0]}
                </div>
                <div>
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="p-6 border-t">
          <button
            disabled={!selected || loading}
            onClick={createDM}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {loading ? "Creating..." : "Start Conversation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main App Component
export default function EnhancedChatApp() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Load initial data
    listChannels()
      .then((channelsData) => {
        setChannels(channelsData);
        if (channelsData.length > 0) {
          setActiveChannel(channelsData[0]);
        }
      })
      .catch(console.error);

    // Mock current user - replace with actual API call
    setCurrentUser({
      full_name: "John Doe",
      email: "john@company.com",
      role: "Member"
    });
  }, []);

  const handleDMCreated = (channel) => {
    setChannels((prev) => [...prev, channel]);
    setActiveChannel(channel);
  };

  return (
    <div className="h-screen flex overflow-hidden font-sans text-gray-900 bg-gray-100">
      <Sidebar
        channels={channels}
        active={activeChannel}
        onSelect={setActiveChannel}
        onCreateDM={() => setDmModalOpen(true)}
        currentUser={currentUser}
      />
      {activeChannel ? (
        <ChatPane channel={activeChannel} currentUser={currentUser} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageSquare size={64} className="mx-auto mb-4 text-gray-300" />
            <p className="text-xl">Select a channel to start chatting</p>
          </div>
        </div>
      )}
      <DMModal
        open={dmModalOpen}
        onClose={() => setDmModalOpen(false)}
        onCreated={handleDMCreated}
      />
    </div>
  );
}