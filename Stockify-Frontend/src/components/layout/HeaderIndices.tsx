import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../../context/WebSocketContext";
import "../../Styles/headerIndices.css";

type IndexQuote = {
  symbol: string;
  label: string;
  price: number | null;
  change: number;
  percent: number;
};

// Skeleton placeholder while data loads
function IndexSkeleton() {
  return (
    <div className="hi-bar hi-bar--skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="hi-item hi-item--skeleton">
          <span className="hi-sk hi-sk--name" />
          <span className="hi-sk hi-sk--price" />
          <span className="hi-sk hi-sk--change" />
        </div>
      ))}
    </div>
  );
}

function IndexItem({ idx, onClick }: { idx: IndexQuote; onClick: () => void }) {
  const positive = idx.percent >= 0;
  const colorClass = positive ? "hi-pos" : "hi-neg";

  return (
    <div className="hi-item" onClick={onClick}>
      <span className="hi-label">{idx.label}</span>
      <span className="hi-price">
        {idx.price !== null
          ? idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })
          : "—"}
      </span>
      <span className={`hi-change ${colorClass}`}>
        {positive ? "+" : ""}
        {idx.change.toFixed(2)}&nbsp;
        <span className="hi-pct">
          ({positive ? "+" : ""}
          {idx.percent.toFixed(2)}%)
        </span>
      </span>
    </div>
  );
}

export default function HeaderIndices() {
  const navigate = useNavigate();
  const { subscribe, unsubscribe, lastMessage } = useWebSocket();
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    subscribe("INDICES_LIVE");
    return () => unsubscribe("INDICES_LIVE");
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "INDICES_UPDATE") {
      setIndices(lastMessage.data ?? []);
      setReady(true);
    }
  }, [lastMessage]);

  if (!ready) return <IndexSkeleton />;

  const slugify = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  return (
    <div className="hi-bar" aria-label="Live market indices">
      <div className="hi-track">
        {indices.map((idx) => (
          <IndexItem
            key={idx.symbol}
            idx={idx}
            onClick={() => navigate(`/stocks/${idx.symbol}/${slugify(idx.label)}`)}
          />
        ))}
        {/* Duplicate list for a seamless train marquee loop */}
        {indices.map((idx) => (
          <IndexItem
            key={idx.symbol + "_dup"}
            idx={idx}
            onClick={() => navigate(`/stocks/${idx.symbol}/${slugify(idx.label)}`)}
          />
        ))}
      </div>
    </div>
  );
}
