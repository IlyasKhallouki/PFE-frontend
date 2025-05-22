export function connect(channelId, onMessage) {
    const ws = new WebSocket(`ws://localhost:8080/ws/${channelId}`);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    return ws;
  }