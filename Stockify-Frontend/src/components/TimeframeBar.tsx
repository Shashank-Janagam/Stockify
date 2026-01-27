const frames = ["1D", "1W", "1M", "3M", "6M", "1Y", "All"];

export default function TimeframeBar({
  active,
  onChange
}: {
  active: string;
  onChange: (f: string) => void;
}) {
  return (
    <div className="timeframe-bar">
      {frames.map(f => (
        <button
          key={f}
          className={active === f ? "active" : ""}
          onClick={() => onChange(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
