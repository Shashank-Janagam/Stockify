
/*
  IndicatorCard — Fully Dynamic Technical Indicator Visualizer
  ─────────────────────────────────────────────────────────────
  Parses ANY markdown table from Aegis AI responses and renders
  the appropriate visual component based on the indicator name.
  No hardcoded field list — it adapts to whatever the AI returns.
*/

/* ── Types ── */
export interface ParsedRow {
  label: string;      // e.g. "RSI (14)", "SMA (50)"
  raw: string;        // raw value string from table
  numericValue?: number;
  signal?: number;    // for MACD: signal line value
  trend?: "bullish" | "bearish" | "neutral";
  meta?: string;      // extra text like "Neutral", "Overbought", etc.
}

export interface DynamicIndicatorData {
  title?: string;
  rows: ParsedRow[];
  textBefore?: string;
  textAfter?: string;
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */


/** Strip markdown bold/italic/backtick from label text */
const stripMd = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, '$1')
   .replace(/\*(.+?)\*/g, '$1')
   .replace(/`(.+?)`/g, '$1')
   .replace(/<br\s*\/?>/gi, ' ')
   .trim();

const detectTrend = (label: string, raw: string): "bullish" | "bearish" | "neutral" => {
  const r = raw.toLowerCase();
  if (r.includes("bullish") || r.includes("uptrend") || r.includes("above")) return "bullish";
  if (r.includes("bearish") || r.includes("downtrend") || r.includes("below")) return "bearish";

  // For MACD: if macd > signal it's bullish
  const labelUp = label.toUpperCase();
  if (labelUp.includes("MACD")) {
    const nums = raw.match(/-?[\d]+(?:\.[\d]+)?/g)?.map(Number) ?? [];
    if (nums.length >= 2) return nums[0] > nums[1] ? "bullish" : "bearish";
  }
  return "neutral";
};

const indicatorType = (label: string): "rsi" | "macd" | "bb" | "supertrend" | "badge" | "price" | "generic" => {
  const l = label.toUpperCase();
  if (l.includes("RSI")) return "rsi";
  if (l.includes("MACD")) return "macd";
  if (l.includes("BOLLINGER") || l.includes("BB") || l.includes("UPPER") || l.includes("LOWER")) return "bb";
  if (l.includes("SUPERTREND") || l.includes("SUPER TREND")) return "supertrend";
  if (l.includes("SIGNAL") || l.includes("TREND") || l.includes("STATUS") || l.includes("DIRECTION")) return "badge";
  if (l.includes("PRICE") || l.includes("CLOSE") || l.includes("OPEN") || l.includes("HIGH") || l.includes("LOW")) return "price";
  return "generic";
};

const BULLISH_COLOR = "#10b981";
const BEARISH_COLOR = "#ef4444";
const NEUTRAL_COLOR = "#f59e0b";
const PRIMARY_COLOR = "#6366f1";

/* ─────────────────────────────────────────────
   Visual sub-components
───────────────────────────────────────────── */

function RSIGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const R = 50, cx = 62, cy = 62;
  const startAngle = -180, endAngle = 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const angle = startAngle + (clamped / 100) * (endAngle - startAngle);
  const x = cx + R * Math.cos(toRad(angle));
  const y = cy + R * Math.sin(toRad(angle));
  const trackX = cx + R * Math.cos(toRad(startAngle));
  const trackY = cy + R * Math.sin(toRad(startAngle));
  const endX = cx + R * Math.cos(toRad(endAngle));
  const endY = cy + R * Math.sin(toRad(endAngle));

  const color = clamped <= 30 ? BULLISH_COLOR : clamped >= 70 ? BEARISH_COLOR : NEUTRAL_COLOR;
  const label = clamped <= 30 ? "Oversold" : clamped >= 70 ? "Overbought" : "Neutral";

  return (
    <div className="ic-gauge-wrap" style={{ textAlign: "center", padding: "16px 0" }}>
      <svg viewBox="0 0 124 70" className="ic-gauge-svg" style={{ width: "100%", maxWidth: "180px", overflow: "visible" }}>
        <path d={`M ${trackX} ${trackY} A ${R} ${R} 0 0 1 ${endX} ${endY}`}
          fill="none" stroke="#e2e8f0" strokeWidth="9" strokeLinecap="round"/>
        {/* Color zones */}
        {[
          { from: 0, to: 30, color: BULLISH_COLOR },
          { from: 30, to: 70, color: NEUTRAL_COLOR },
          { from: 70, to: 100, color: BEARISH_COLOR },
        ].map(z => {
          const a1 = startAngle + (z.from / 100) * (endAngle - startAngle);
          const a2 = startAngle + (z.to / 100) * (endAngle - startAngle);
          const x1 = cx + R * Math.cos(toRad(a1)), y1 = cy + R * Math.sin(toRad(a1));
          const x2 = cx + R * Math.cos(toRad(a2)), y2 = cy + R * Math.sin(toRad(a2));
          return (
            <path key={z.from}
              d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
              fill="none" stroke={z.color} strokeWidth="9" strokeLinecap="butt" opacity="0.25"/>
          );
        })}
        {/* Value arc */}
        {clamped > 0 && (
          <path d={`M ${trackX} ${trackY} A ${R} ${R} 0 0 1 ${x} ${y}`}
            fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"/>
        )}
        {/* Needle dot */}
        <circle cx={x} cy={y} r="5" fill={color}/>
        <text x="5" y="68" fontSize="7.5" fill="#94a3b8">0</text>
        <text x="54" y="10" fontSize="7.5" fill="#94a3b8">50</text>
        <text x="107" y="68" fontSize="7.5" fill="#94a3b8">100</text>
      </svg>
      <div className="ic-gauge-value" style={{ color }}>{clamped.toFixed(1)}</div>
      <div className="ic-gauge-label" style={{ color }}>{label}</div>
    </div>
  );
}

function MACDBar({ macd, signal }: { macd: number; signal: number }) {
  const range = Math.max(Math.abs(macd), Math.abs(signal), 0.01) * 2;
  const macdPct = 50 + (macd / range) * 50;
  const sigPct = 50 + (signal / range) * 50;
  const bullish = macd > signal;
  const color = bullish ? BULLISH_COLOR : BEARISH_COLOR;
  const hist = macd - signal;

  return (
    <div className="ic-macd-wrap">
      <div className="ic-macd-track">
        <div className="ic-macd-center"/>
        <div className="ic-macd-fill" style={{
          left: macd < 0 ? `${macdPct}%` : "50%",
          width: `${Math.abs(macdPct - 50)}%`,
          background: color,
        }}/>
        <div className="ic-macd-marker" style={{ left: `${macdPct}%`, background: color }}/>
        <div className="ic-macd-marker ic-macd-signal-marker" style={{ left: `${sigPct}%` }}/>
      </div>
      <div className="ic-macd-labels">
        <span style={{ color }}>MACD {macd > 0 ? "+" : ""}{macd.toFixed(2)}</span>
        <span style={{ color: "#94a3b8" }}>Hist {hist > 0 ? "+" : ""}{hist.toFixed(2)}</span>
        <span style={{ color: "#64748b" }}>Signal {signal > 0 ? "+" : ""}{signal.toFixed(2)}</span>
      </div>
      <div className="ic-macd-interp">
        {bullish
          ? <span style={{ color: BULLISH_COLOR }}>▲ Bullish crossover — momentum building</span>
          : <span style={{ color: BEARISH_COLOR }}>▼ Bearish crossover — momentum fading</span>}
      </div>
    </div>
  );
}

function FillBar({ pct, color = PRIMARY_COLOR }: { pct: number; color?: string }) {
  return (
    <div className="ic-bar-track" style={{ marginTop: 4 }}>
      <div className="ic-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}/>
    </div>
  );
}

function TrendBadge({ text, trend }: { text: string; trend: "bullish" | "bearish" | "neutral" }) {
  const color = trend === "bullish" ? BULLISH_COLOR : trend === "bearish" ? BEARISH_COLOR : NEUTRAL_COLOR;
  const bg = trend === "bullish" ? "rgba(16,185,129,0.1)" : trend === "bearish" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)";
  const icon = trend === "bullish" ? "▲" : trend === "bearish" ? "▼" : "◆";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "5px 13px", borderRadius: 100,
      background: bg, border: `1px solid ${color}22`,
      fontSize: 13, fontWeight: 700, color
    }}>
      {icon} {text}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Individual Row Panel
───────────────────────────────────────────── */
function IndicatorPanel({ row }: { row: ParsedRow }) {
  const cleanLabel = stripMd(row.label);
  const cleanMeta  = row.meta ? row.meta.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*(.+?)\*\*/g, '$1') : undefined;
  const type = indicatorType(row.label);
  const trend = row.trend ?? detectTrend(row.label, row.raw);

  if (type === "rsi" && row.numericValue !== undefined) {
    return (
      <div className="ic-panel">
        <div className="ic-panel-title">{cleanLabel}</div>
        <RSIGauge value={row.numericValue}/>
      </div>
    );
  }

  if (type === "macd" && row.numericValue !== undefined) {
    const signal = row.signal ?? row.numericValue * 0.9;
    return (
      <div className="ic-panel" style={{ gridColumn: "span 2" }}>
        <div className="ic-panel-title">{cleanLabel}</div>
        <MACDBar macd={row.numericValue} signal={signal}/>
      </div>
    );
  }

  if (type === "supertrend") {
    const t = trend === "neutral"
      ? (row.raw.toLowerCase().includes("bull") ? "bullish" : "bearish")
      : trend;
    const text = stripMd(row.raw.replace(/\(.*?\)/g, "").replace(/Direction:?\s*-?\d+/gi, "").trim() || row.raw);
    return (
      <div className="ic-panel">
        <div className="ic-panel-title">{cleanLabel}</div>
        <TrendBadge text={text} trend={t}/>
        <div className="ic-trend-desc">
          {t === "bullish"
            ? "Price is above the SuperTrend line — uptrend confirmed."
            : "Price is below the SuperTrend line — downtrend in play."}
        </div>
      </div>
    );
  }

  if (type === "badge") {
    return (
      <div className="ic-panel">
        <div className="ic-panel-title">{cleanLabel}</div>
        <TrendBadge text={stripMd(row.raw.replace(/\(.*?\)/g, "").trim())} trend={trend}/>
      </div>
    );
  }

  if (type === "price" && row.numericValue !== undefined) {
    return (
      <div className="ic-panel">
        <div className="ic-panel-title">{cleanLabel}</div>
        <div className="ic-big-value">₹{row.numericValue.toFixed(2)}</div>
      </div>
    );
  }

  // Generic numeric panel
  if (row.numericValue !== undefined) {
    const color = trend === "bullish" ? BULLISH_COLOR : trend === "bearish" ? BEARISH_COLOR : PRIMARY_COLOR;
    const pct = Math.abs(row.numericValue) > 0
      ? Math.min(100, (Math.abs(row.numericValue) / (Math.abs(row.numericValue) * 2)) * 100)
      : 50;
    const showRupee = row.label.toUpperCase().match(/EMA|SMA|VWAP|BB|BOLLINGER|ATR/);
    return (
      <div className="ic-panel">
        <div className="ic-panel-title">{cleanLabel}</div>
        <div className="ic-big-value" style={{ color: row.numericValue < 0 ? BEARISH_COLOR : undefined }}>
          {showRupee ? "₹" : ""}{row.numericValue.toFixed(2)}
        </div>
        <FillBar pct={pct} color={color}/>
        {cleanMeta && <div className="ic-atr-desc">{cleanMeta}</div>}
      </div>
    );
  }

  // Text-only fallback panel
  return (
    <div className="ic-panel">
      <div className="ic-panel-title">{cleanLabel}</div>
      <TrendBadge text={stripMd(row.raw)} trend={trend}/>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main IndicatorCard
───────────────────────────────────────────── */
export default function IndicatorCard({ data }: { data: DynamicIndicatorData }) {
  const { title, rows } = data;

  return (
    <div className="ic-card">
      {title && (
        <div className="ic-symbol-badge">📊 {title}</div>
      )}

      <div className="ic-grid">
        {rows.map((row, i) => (
          <IndicatorPanel key={i} row={row}/>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   parseIndicators — NEW dynamic parser
   Parses ANY markdown table from AI text and
   converts every row into a ParsedRow.
───────────────────────────────────────────── */
export function parseIndicators(text: string): DynamicIndicatorData | null {
  // Must contain indicator keywords to trigger
  const keywords = ["RSI", "MACD", "EMA", "ATR", "Supertrend", "SuperTrend", "SMA", "Bollinger", "VWAP", "Indicator", "Period"];
  const hits = keywords.filter(k => text.includes(k));
  if (hits.length < 1) return null;

  // Find all markdown tables in the text
  const lines = text.split("\n");
  let tableStart = -1, tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("|")) {
      if (tableStart === -1) tableStart = i;
      tableEnd = i;
    } else if (tableStart !== -1 && trimmed !== "" && !trimmed.startsWith("|")) {
      break;
    }
  }

  if (tableStart === -1) return null;

  const tableLines = lines.slice(tableStart, tableEnd + 1);
  const dataLines = tableLines.filter(l => !l.match(/^\s*\|[-:\s|]+\|\s*$/)); // skip separator rows

  // Must have header + at least 1 data row
  if (dataLines.length < 2) return null;

  // Parse header to determine column roles
  const headerCols = dataLines[0].split("|").map(c => c.trim()).filter(Boolean);

  // ── Bail out for multi-entity comparison tables ──
  // If the headers include "Symbol"/"Company"/"Stock" (entity columns), and data has multiple
  // rows, this is a cross-stock comparison — let BeautifulTable handle it instead.
  const isComparisonTable =
    headerCols.some(h => /symbol|company|stock|bank|name|entity/i.test(h)) &&
    dataLines.length - 1 >= 3;
  // Also bail if the label column isn't an indicator name but looks like a stock symbol
  const firstDataCols = dataLines.slice(1, 4).map(l => l.split("|").map(c => c.trim()).filter(Boolean)[0] ?? "");
  const looksLikeSymbols = firstDataCols.every(c => /^[A-Z]{2,12}$/.test(c.replace(/\*\*/g, "").trim()));
  if (isComparisonTable || (looksLikeSymbols && dataLines.length - 1 >= 3)) return null;

  const valueColIdx = headerCols.findIndex(h =>
    /value|amount|price|result|data|sma|ema|rsi|macd/i.test(h)
  );
  const labelColIdx = headerCols.findIndex(h =>
    /indicator|period|name|metric/i.test(h)
  );

  const rows: ParsedRow[] = [];

  for (let i = 1; i < dataLines.length; i++) {
    const cols = dataLines[i].split("|").map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;

    const labelIdx = labelColIdx >= 0 ? labelColIdx : 0;
    const valIdx = valueColIdx >= 0 ? valueColIdx : 1;

    const label = cols[labelIdx] ?? "";
    const rawValue = cols[valIdx] ?? "";
    const extraText = cols.slice(valIdx + 1).join(" ").trim();

    if (!label || label === "---" || label.match(/^[-:]+$/)) continue;

    // Parse numeric values (MACD may have multiple nums)
    const allNums = rawValue.match(/-?[\d]+(?:\.[\d]+)?/g)?.map(Number) ?? [];
    const primaryNum = allNums[0];
    let signalNum: number | undefined;

    // Check if signal is in extra text cols
    const sigM = (extraText + " " + rawValue).match(/[Ss]ignal\s*:?\s*(-?[\d.]+)/);
    if (sigM) signalNum = parseFloat(sigM[1]);
    else if (allNums.length >= 2 && label.toUpperCase().includes("MACD")) signalNum = allNums[1];

    // Detect meta text (interpretation)
    const metaText = extraText.replace(/\(.*?\)/g, "").trim() ||
      rawValue.replace(/-?[\d.]+/g, "").replace(/[₹,]/g, "").trim();

    const row: ParsedRow = {
      label,
      raw: rawValue,
      numericValue: primaryNum,
      signal: signalNum,
      trend: detectTrend(label, rawValue + " " + extraText),
      meta: metaText || undefined,
    };

    rows.push(row);
  }

  if (rows.length === 0) return null;

  // Extract title from heading above the table
  const textBefore = lines.slice(0, tableStart).join("\n").trim();
  const textAfter = lines.slice(tableEnd + 1).join("\n").trim();

  // Try to get a nice title from the preceding heading or bold text
  const titleM = textBefore.match(/#{1,4}\s+(.+?)(?:\n|$)/) ||
                 textBefore.match(/\*\*(.+?)\*\*/) ||
                 textBefore.match(/Technical Analysis.*?:\s*(.+?)(?:\n|$)/i);
  const title = titleM ? titleM[1].replace(/\*\*/g, "").trim() : undefined;

  return { title, rows, textBefore: textBefore || undefined, textAfter: textAfter || undefined };
}

/* ─────────────────────────────────────────────
   splitAroundTable — kept for legacy compat
───────────────────────────────────────────── */
export function splitAroundTable(text: string): { before: string; after: string } {
  const lines = text.split("\n");
  let tableStart = -1, tableEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("|")) {
      if (tableStart === -1) tableStart = i;
      tableEnd = i;
    } else if (tableStart !== -1 && trimmed !== "" && !trimmed.startsWith("|")) {
      break;
    }
  }

  if (tableStart === -1) return { before: "", after: text };

  return {
    before: lines.slice(0, tableStart).join("\n").trim(),
    after: lines.slice(tableEnd + 1).join("\n").trim(),
  };
}
