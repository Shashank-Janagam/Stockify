export default function ChartTypeToggle({
  value,
  onChange
}: {
  value: "line" | "candle";
  onChange: (v: "line" | "candle") => void;
}) {
  return (
    <div className="chart-toggle">
      <button
        className={value === "line" ? "active" : ""}
        onClick={() => onChange("line")}
      >
        Line
      </button>

      <button
        className={value === "candle" ? "active" : ""}
        onClick={() => onChange("candle")}
      >
        Candle
      </button>
    </div>
  );
}
