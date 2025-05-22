import { useEffect, useState, useRef } from "react";
import { connect } from "../ws";

export default function Chat({ channel }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef();

  useEffect(() => {
    const ws = connect(channel.id, (msg) => {
      if (msg.type === "history") setMessages(msg.data);
      if (msg.type === "message") setMessages((p) => [...p, msg.data]);
    });
    return () => ws.close();
  }, [channel.id]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));

  const send = () => {
    if (!draft) return;
    // send via WS – grabbing socket from closure in useEffect
    const ws = new WebSocket(`ws://localhost:8080/ws/${channel.id}`);
    ws.onopen = () => {
      ws.send(draft);
      setDraft("");
    };
  };

  return (
    <section className="col-span-9 flex flex-col h-full">
      <header className="p-4 shadow bg-white">{channel.name}</header>
      <main className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {messages.map((m) => (
          <div key={m.id} className="bg-white p-2 rounded shadow">
            <strong>{m.author}</strong>: {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </main>
      <footer className="p-4 bg-white flex gap-2">
        <input
          className="border flex-1 p-2 rounded"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send} className="bg-blue-600 text-white px-4 rounded">
          Send
        </button>
      </footer>
    </section>
  );
}