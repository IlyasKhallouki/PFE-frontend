export default function ChannelList({ channels, active, onSelect }) {
    return (
      <aside className="col-span-3 bg-gray-100 p-4 overflow-y-auto">
        {channels.map((ch) => (
          <div
            key={ch.id}
            onClick={() => onSelect(ch)}
            className={`p-2 rounded cursor-pointer ${active?.id === ch.id ? "bg-blue-200" : ""}`}
          >
            {ch.name}
          </div>
        ))}
      </aside>
    );
  }