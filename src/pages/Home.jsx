import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Hash, Send, Plus, X, Lock, MessageSquare, Search, LogOut } from "lucide-react";
import { listChannels, listUsers, listRecipients, openDm } from "../lib/api";

/* ------------------------------------------------------------------ */
/*  API helper to get current user                                    */
/* ------------------------------------------------------------------ */
const getCurrentUser = () => {
  return fetch("http://localhost:8080/auth/me", {
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  }).then(res => {
    if (res.status === 401) {
      window.location.href = "/signin";
      return null;
    }
    return res.json();
  });
};

function useSmartReplies(channelId, wsRef) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const requestSuggestions = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    setIsLoading(true);
    try {
      wsRef.current.send(JSON.stringify({
        type: "get_smart_replies"
      }));
    } catch (error) {
      console.error("Error requesting smart replies:", error);
      setIsLoading(false);
    }
  }, [wsRef]);

  const hideSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setSuggestions([]);
  }, []);

  // Reset smart replies when channel changes
  useEffect(() => {
    setShowSuggestions(false);
    setSuggestions([]);
    setIsLoading(false);
  }, [channelId]);

  return {
    suggestions,
    isLoading,
    showSuggestions,
    requestSuggestions,
    hideSuggestions,
    setSuggestions,
    setIsLoading,
    setShowSuggestions
  };
}

const WS = "ws://localhost:8080";

function useChat(channelId) {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Smart replies integration
  const smartReplies = useSmartReplies(channelId, wsRef);
  const smartRepliesRef = useRef(smartReplies);
  
  useEffect(() => {
    smartRepliesRef.current = smartReplies;
  }, [smartReplies]);

  const connect = useCallback(() => {
    if (!channelId || wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS}/ws/${channelId}`);
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
        // Auto-request smart replies after receiving a message (with debounce)
        setTimeout(() => {
          if (smartRepliesRef.current.showSuggestions) {
            smartRepliesRef.current.requestSuggestions();
          }
        }, 500);
      } else if (msg.type === "smart_replies") {
        // Handle smart reply suggestions
        smartRepliesRef.current.setSuggestions(msg.data.suggestions || []);
        smartRepliesRef.current.setIsLoading(false);
        smartRepliesRef.current.setShowSuggestions(true);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setConnectionStatus("error");
      // Don't trigger reconnect here, let onclose handle it
    };

    ws.onclose = (event) => {
      setConnectionStatus("disconnected");
      smartRepliesRef.current.hideSuggestions();
      
      // Only reconnect if this is the current channel's WebSocket
      if (ws === wsRef.current && reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      }
    };
  }, [channelId]);

  useEffect(() => {
    // Clear messages when channel changes
    setMessages([]);
    
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

  const send = useCallback((text, currentUser) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Hide suggestions when sending a message
      smartReplies.hideSuggestions();
      
      // Immediately add user message to local state for instant feedback
      const userMessage = {
        id: `temp-${Date.now()}`,
        author: currentUser?.full_name || "You",
        author_id: currentUser?.id || 0,
        content: text,
        sent_at: new Date().toISOString(),
        isTemporary: true
      };
      
      setMessages((prev) => [...prev, userMessage]);
      
      // Send to server
      wsRef.current.send(text);
    }
  }, [smartReplies]);

  return { 
    messages, 
    send, 
    connectionStatus,
    smartReplies 
  };
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                        */
/* ------------------------------------------------------------------ */
function ChannelItem({ ch, active, onSelect }) {
  const isActive = active?.id === ch.id;
  
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(ch);
  };
  
  return (
    <div
      onClick={handleClick}
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
    </div>
  );
}

function Sidebar({ channels, active, onSelect, onCreateDM, currentUser, onSignOut }) {
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
          <p className="text-sm font-medium">{currentUser?.full_name || 'Loading...'}</p>
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

      {/* Footer - Only Sign Out */}
      <div className="p-3 border-t bg-white">
        <button 
          onClick={onSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm text-red-600"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function SmartReplySuggestions({ suggestions, onSelect, onClose, isLoading }) {
  if (!suggestions.length && !isLoading) return null;

  return (
    <div className="border-t bg-gray-50 px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Smart Replies</span>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          ✕
        </button>
      </div>
      
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
          <span>Generating suggestions...</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(suggestion)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-full text-sm hover:bg-gray-100 hover:border-gray-400 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ msg, isOwn }) {
  const date = new Date(msg.sent_at).toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar only for others' messages */}
      {!isOwn && (
        <div className="h-10 w-10 rounded-full flex items-center justify-center uppercase text-sm font-medium bg-gray-300 text-gray-700 flex-shrink-0">
          {msg.author[0]}
        </div>
      )}

      {/* Message content */}
      <div className={`flex-1 ${isOwn ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
        <div className="flex gap-2 items-baseline mb-1">
          <span className="font-semibold text-sm">{msg.author}</span>
          <span className="text-xs text-gray-500">{date}</span>
        </div>
        <div className={`p-3 rounded-lg inline-block max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl ${
          isOwn 
            ? 'bg-blue-500 text-white rounded-br-sm' 
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        } ${msg.isTemporary ? 'opacity-70' : ''}`}>
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
      </div>
    </div>
  );
}

function ChatPane({ channel, currentUser }) {
  const { messages, send, connectionStatus, smartReplies } = useChat(channel.id);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channel.id]);

  // Clean up temporary messages when real messages arrive from server
  const cleanedMessages = messages.reduce((acc, msg) => {
    if (!msg.isTemporary) {
      const tempIndex = acc.findIndex(m => 
        m.isTemporary && 
        m.content === msg.content && 
        m.author_id === msg.author_id
      );
      if (tempIndex !== -1) {
        acc.splice(tempIndex, 1);
      }
    }
    acc.push(msg);
    return acc;
  }, []);

  const handleSend = () => {
    if (!draft.trim()) return;
    send(draft.trim(), currentUser);
    setDraft("");
  };

  const handleSmartReplySelect = (suggestion) => {
    setDraft(suggestion);
    smartReplies.hideSuggestions();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      smartReplies.hideSuggestions();
    }
  };

  const handleInputFocus = () => {
    // Request smart replies when user focuses on input (if there are recent messages)
    if (cleanedMessages.length > 0 && !smartReplies.showSuggestions) {
      smartReplies.requestSuggestions();
    }
  };

  const handleInputChange = (e) => {
    setDraft(e.target.value);
    // Hide suggestions when user starts typing
    if (e.target.value.length > 0 && smartReplies.showSuggestions) {
      smartReplies.hideSuggestions();
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
        {cleanedMessages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {cleanedMessages.map((msg) => (
              <Message 
                key={msg.id} 
                msg={msg} 
                isOwn={msg.author_id === currentUser?.id}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Smart Reply Suggestions */}
      {smartReplies.showSuggestions && (
        <SmartReplySuggestions
          suggestions={smartReplies.suggestions}
          onSelect={handleSmartReplySelect}
          onClose={smartReplies.hideSuggestions}
          isLoading={smartReplies.isLoading}
        />
      )}

      {/* Input */}
      <footer className="px-6 py-4 border-t">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              className="w-full min-h-[44px] max-h-32 px-4 py-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`Message #${channel.name}`}
              value={draft}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              rows={1}
            />
            {/* Smart Reply Toggle Button */}
            {!smartReplies.showSuggestions && cleanedMessages.length > 0 && (
              <button
                onClick={smartReplies.requestSuggestions}
                className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                title="Get smart reply suggestions"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  <path d="M8 10h.01"/>
                  <path d="M12 10h.01"/>
                  <path d="M16 10h.01"/>
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!draft.trim() || connectionStatus !== "connected"}
            className="px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        
        {/* Quick Smart Reply Access */}
        {!smartReplies.showSuggestions && cleanedMessages.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={smartReplies.requestSuggestions}
              className="text-xs text-gray-500 hover:text-blue-500 transition-colors"
            >
              💡 Get smart replies
            </button>
          </div>
        )}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    
    setError("");
    listRecipients()
      .then(res => {
        if (res && res.recipients) {
          setUsers(res.recipients);
        } else {
          setError("Failed to load users");
        }
      })
      .catch(err => {
        console.error("Error loading recipients:", err);
        setError("Failed to load users");
      });
  }, [open]);

  const handleUserToggle = (user) => {
    if (recipientIds.includes(user.id)) {
      setRecipientIds(recipientIds.filter(id => id !== user.id));
    } else {
      setRecipientIds([...recipientIds, user.id]);
    }
  };

  const handleCreate = async () => {
    if (recipientIds.length === 0) {
      setError("Please select at least one user");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await openDm(recipientIds);
      if (response && response.id) {
        onCreated(response);
        onClose();
        setRecipientIds([]);
      } else {
        setError("Failed to create conversation");
      }
    } catch (err) {
      console.error("Error creating DM:", err);
      setError(err.message || "Failed to create conversation");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">New Direct Message</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select users to message:
            </label>
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              {users.length > 0 ? (
                users.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={recipientIds.includes(user.id)}
                      onChange={() => handleUserToggle(user)}
                      className="mr-3"
                    />
                    <div>
                      <div className="font-medium">{user.full_name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </label>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">
                  No users available
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || recipientIds.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating..." : "Start Conversation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */
export default function EnhancedChatApp() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [dmModal, setDmModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    // Load channels
    listChannels().then((chs) => {
      setChannels(chs);
      if (chs.length) setActive(chs[0]);
    }).catch(console.error);

    // Load current user
    getCurrentUser().then(user => {
      if (user) {
        setCurrentUser(user);
      }
    }).catch(console.error);
  }, []);

  const handleDMcreated = (ch) => {
    setChannels((p) => [...p, ch]);
    setActive(ch);
  };

  const handleSignOut = async () => {
    try {
      const res = await fetch('http://localhost:8080/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (res.ok) {
        navigate('/signin');
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleChannelSelect = useCallback((channel) => {
    setActive(channel);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden font-sans text-gray-900 bg-gray-100">
      <Sidebar
        channels={channels}
        active={active}
        onSelect={handleChannelSelect}
        onCreateDM={() => setDmModal(true)}
        currentUser={currentUser}
        onSignOut={handleSignOut}
      />
      {active ? (
        <ChatPane channel={active} currentUser={currentUser} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <MessageSquare size={64} className="mx-auto mb-4 text-gray-300" />
            <p className="text-xl">Select a channel to start chatting</p>
          </div>
        </div>
      )}
      <DMModal
        open={dmModal}
        onClose={() => setDmModal(false)}
        onCreated={handleDMcreated}
      />
    </div>
  );
}