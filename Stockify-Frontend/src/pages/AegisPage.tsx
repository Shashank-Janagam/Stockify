import { useState, useRef, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../auth/AuthProvider";
import { StockChartIndia } from "../components/charts/StocksChartIndia";
import IndicatorCard, { parseIndicators } from "../components/aegis/IndicatorCard";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import "../Styles/Aegis.css";
import aegisLogo from "../assets/logos/aegis.png";

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

/* ─── Types ─── */
interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  time: string;
  symbol?: string | null;    // detected stock symbol
  isStreaming?: boolean;
  statuses?: string[];       // background reasoning trace
}

interface LinePoint { x: number; y: number; }

interface QuoteData {
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  marketState: string;
  longName?: string;
  shortName?: string;
  symbol?: string;
}

interface ConvMeta { id: string; title: string; updatedAt: string; }



/* ─── SVG Icons (inline, no deps) ─── */
const I = {
  Chat: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  Markets: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  Portfolio: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  Watchlist: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
  Research: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Trading: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
  Backtest: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /></svg>,
  Reports: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  Conv: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  Plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Send: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  Paperclip: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  ChevDown: () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>,
  Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
  ThumbUp: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>,
  ThumbDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" /><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>,
  ChartLine: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  ListBullet: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  Shield: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  Activity: (p: any) => <svg width={p.size || "14"} height={p.size || "14"} viewBox="0 0 24 24" fill="none" stroke={p.color || "currentColor"} strokeWidth="2" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  TestTube: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>,
  Loader: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="aegis-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>,
  Moon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  Sun: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
  PanelLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>,
  CheckCircle2: (p: any) => <svg width={p.size || "16"} height={p.size || "16"} viewBox="0 0 24 24" fill="none" stroke={p.color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  ArrowUpRight: (p: any) => <svg width={p.size || "16"} height={p.size || "16"} viewBox="0 0 24 24" fill="none" stroke={p.color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>,
  ArrowDownRight: (p: any) => <svg width={p.size || "16"} height={p.size || "16"} viewBox="0 0 24 24" fill="none" stroke={p.color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 7 17 17 7 17" /></svg>,
  Shield2: (p: any) => <svg width={p.size || "14"} height={p.size || "14"} viewBox="0 0 24 24" fill="none" stroke={p.color || "currentColor"} strokeWidth="2" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
};



/* ─── Inline markdown-lite renderer (text only, no tables) ─── */
function renderMarkdownText(text: string): string {
  let parsed = text;
  
  // Group consecutive bullet points (even with empty lines between) into a card grid
  const bulletBlockRegex = /(?:^[*-]\s+.*(?:\n\s*)*)+/gm;
  
  parsed = parsed.replace(bulletBlockRegex, (match) => {
    const lines = match.split('\n').filter(l => /^[*-]\s+/.test(l.trim()));
    const cardsHtml = lines.map(line => {
      const content = line.trim().replace(/^[*-]\s+/, '').trim();
      const titleMatch = content.match(/^\*\*(.+?)\*\*[:\s-]*([\s\S]*)$/);
      
      if (titleMatch) {
        return `<div class="aegis-md-card"><div class="aegis-md-card-title">${titleMatch[1]}</div><div class="aegis-md-card-desc">${titleMatch[2]}</div></div>`;
      } else {
        // Fallback for list items without bold titles
        const parts = content.split(/:\s(.+)/);
        if (parts.length > 1) {
            return `<div class="aegis-md-card"><div class="aegis-md-card-title">${parts[0]}</div><div class="aegis-md-card-desc">${parts[1]}</div></div>`;
        }
        return `<div class="aegis-md-card"><div class="aegis-md-card-desc">${content}</div></div>`;
      }
    }).join('');
    
    return `<div class="aegis-md-cards-grid">${cardsHtml}</div>\n\n`;
  });

  return parsed
    .replace(/^#{4}\s+(.+)$/gm, '<h4 class="aegis-md-h4">$1</h4>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3 class="aegis-md-h3">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 class="aegis-md-h2">$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1 class="aegis-md-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="aegis-md-code">$1</code>')
    .replace(/^---+$/gm, '<hr class="aegis-md-hr"/>')
    .replace(/\n/g, '<br/>')
    // Clean up unwanted <br/> tags inside and around our grid container
    .replace(/<br\/>\s*<div class="aegis-md-cards-grid">/g, '<div class="aegis-md-cards-grid">')
    .replace(/<\/div>\s*<br\/>/g, '</div>')
    .replace(/<div class="aegis-md-cards-grid"><br\/>/g, '<div class="aegis-md-cards-grid">');
}


/* ─── Parse a markdown table into headers + rows ─── */
function parseMarkdownTable(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  const parse = (line: string) => line.split('|').map(c => c.trim()).filter(Boolean);
  const headers = parse(lines[0]);
  const dataLines = lines.filter(l => !l.match(/^\s*\|[-:\s|]+\|\s*$/));
  if (dataLines.length < 2) return null;
  const rows = dataLines.slice(1).map(parse);
  return { headers, rows };
}

/* ─── Detect if a cell contains a change % value ─── */
function cellStyle(header: string, value: string): React.CSSProperties {
  const h = header.toLowerCase();
  const isChangeCol = /change|chg|%|return|gain|loss|pnl|diff/.test(h);
  if (isChangeCol || /^[+-]?\d/.test(value)) {
    const num = parseFloat(value.replace(/[^-\d.]/g, ''));
    if (!isNaN(num)) {
      const isPos = value.startsWith('+') || num > 0;
      const isNeg = value.startsWith('-') || num < 0;
      if (isPos) return { color: '#059669', fontWeight: 600 };
      if (isNeg) return { color: '#dc2626', fontWeight: 600 };
    }
  }
  // Price columns
  if (/price|ltp|close|open|high|low|value|₹/.test(h)) {
    return { fontWeight: 600, color: 'var(--text-primary)' };
  }
  return {};
}

/* ─── Render inline markdown inside a cell (bold, italic, code) ─── */
function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
}

/* ─── Beautiful Table Component ─── */
function BeautifulTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="aegis-table-wrap">
      <table className="aegis-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {headers.map((h, ci) => {
                const val = row[ci] ?? '';
                const plainVal = val.replace(/\*\*?(.+?)\*\*?/g, '$1'); // strip markdown for style detection
                const style = cellStyle(h, plainVal);
                return <td key={ci} style={style} dangerouslySetInnerHTML={{ __html: inlineMd(val) }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Trade Confirmation Card ─── */
function TradeConfirmCard({ payload }: { payload: any }) {
  const [status, setStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [resultMsg, setResultMsg] = useState('');

  const handleConfirm = async () => {
    setStatus('processing');
    try {
      // Use the correct backend endpoints
      const endpoint = payload.action === 'buy'
        ? '/api/orderExecution/buy'
        : '/api/sellStock/sell';
      const res = await fetch(`${HOST}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: payload.symbol,
          quantity: payload.quantity,
          sl_enabled: payload.stop_loss != null,
          sl_price: payload.stop_loss,
          product_type: payload.product_type || "Delivery",
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setResultMsg(`Successfully placed ${payload.action} order for ${payload.quantity} ${payload.symbol}`);
      } else {
        setStatus('error');
        setResultMsg(data.error || data.message || 'Failed to place order');
      }
    } catch (e: any) {
      setStatus('error');
      setResultMsg(e.message || 'Network error');
    }
  };

  if (status === 'success') {
    return (
      <div className="aegis-trade-card success">
        <div className="aegis-trade-header">
          <I.Shield /> <span>Trade Executed</span>
        </div>
        <div className="aegis-trade-success-msg">✅ {resultMsg}</div>
      </div>
    );
  }

  return (
    <div className="aegis-trade-card">
      <div className="aegis-trade-header">
        <I.Trading /> <span>Order Confirmation</span>
      </div>
      <div className="aegis-trade-details">
        <div className="aegis-trade-row">
          <span className="aegis-trade-label">Action</span>
          <span className={`aegis-trade-val ${payload.action === 'buy' ? 'text-green' : 'text-red'}`}>{payload.action.toUpperCase()}</span>
        </div>
        <div className="aegis-trade-row">
          <span className="aegis-trade-label">Symbol</span>
          <span className="aegis-trade-val">{payload.symbol}</span>
        </div>
        <div className="aegis-trade-row">
          <span className="aegis-trade-label">Quantity</span>
          <span className="aegis-trade-val">{payload.quantity}</span>
        </div>
        {payload.stop_loss && (
          <div className="aegis-trade-row">
            <span className="aegis-trade-label">Stop Loss</span>
            <span className="aegis-trade-val text-red">₹{payload.stop_loss}</span>
          </div>
        )}
      </div>
      {status === 'error' && <div className="aegis-trade-error">⚠️ {resultMsg}</div>}
      <div className="aegis-trade-actions">
        <button className="aegis-trade-btn confirm" onClick={handleConfirm} disabled={status === 'processing'}>
          {status === 'processing' ? 'Executing...' : 'Confirm & Execute'}
        </button>
      </div>
    </div>
  );
}

/* ─── Trade Result Card (Receipt) ─── */
function TradeResultCard({ payload }: { payload: any }) {
  const isBuy = payload.action === 'buy';
  const Icon = isBuy ? I.ArrowUpRight : I.ArrowDownRight;
  const actionColorClass = isBuy ? 'buy' : 'sell';

  return (
    <div className="aegis-receipt-card">
      <I.Shield2 className="aegis-receipt-bg-icon" size={180} />
      
      <div className="aegis-receipt-header">
        <div className="aegis-receipt-title">
          <I.CheckCircle2 color="#10b981" />
          Trade Executed
        </div>
        <div className="aegis-receipt-badge">
          <Icon size={14} />
          {String(payload.action).toUpperCase()}
        </div>
      </div>

      <div className="aegis-receipt-grid">
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">Symbol</span>
          <span className="aegis-receipt-value">{payload.symbol}</span>
        </div>
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">Quantity</span>
          <span className="aegis-receipt-value">{payload.quantity}</span>
        </div>
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">Status</span>
          <span className={`aegis-receipt-value ${actionColorClass}`}>Success</span>
        </div>
      </div>

      <div className="aegis-receipt-footer">
        <span>Order successfully processed by Aegis.</span>
        <span>Action: <strong>{isBuy ? 'PURCHASE' : 'SELL'}</strong></span>
      </div>
    </div>
  );
}

/* ─── Multi Trade Result Card (Basket) ─── */
function MultiTradeResultCard({ payloads }: { payloads: any[] }) {
  const isAllBuy = payloads.every(p => p.action === 'buy');
  const isAllSell = payloads.every(p => p.action === 'sell');
  const Icon = isAllBuy ? I.ArrowUpRight : isAllSell ? I.ArrowDownRight : I.Trading;
  
  return (
    <div style={{
      width: '100%',
      maxWidth: '480px',
      margin: '16px 0',
      background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(148, 163, 184, 0.1)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
      fontFamily: 'Inter, sans-serif',
      position: 'relative'
    }}>
      {/* Decorative Glow */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '150px',
        height: '150px',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        pointerEvents: 'none'
      }} />

      {/* Header */}
      <div style={{
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '8px', borderRadius: '10px' }}>
            <I.CheckCircle2 color="#10b981" size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>Basket Executed</h4>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Portfolio Agent</span>
          </div>
        </div>
        <div style={{
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#60a5fa',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          letterSpacing: '0.5px'
        }}>
          <Icon size={14} />
          {payloads.length} TRADES
        </div>
      </div>

      {/* Trades List */}
      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {payloads.map((payload, idx) => {
          const isBuy = payload.action === 'buy';
          const actionColor = isBuy ? '#10b981' : '#ef4444';
          const actionBg = isBuy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
          
          return (
            <div key={idx} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              background: 'rgba(255, 255, 255, 0.02)', 
              padding: '12px 16px', 
              borderRadius: '12px', 
              border: '1px solid rgba(255,255,255,0.03)',
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ 
                  background: actionBg, 
                  color: actionColor,
                  padding: '4px 10px', 
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase'
                }}>
                  {payload.action}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>{payload.symbol}</span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>NSE Equities</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quantity</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>{payload.quantity}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: '12px',
      }}>
        <span style={{ color: '#94a3b8' }}>Processed via AEGIS Core</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9', fontWeight: 600 }}>
          Status: <span style={{ color: '#10b981' }}>COMPLETED</span>
        </span>
      </div>
    </div>
  );
}

/* ─── Portfolio Allocation Card ─── */
const PIE_COLORS = ['#4ade80', '#60a5fa', '#facc15', '#f87171', '#a78bfa', '#fb923c'];
function PortfolioAllocationCard({ payload, onAction }: { payload: any, onAction: (msg: string) => void }) {
  const data = payload.holdings || [];
  if (data.length === 0) return null;
  const totalValue = payload.total_value || data.reduce((acc: number, item: any) => acc + item.value, 0);
  const todayPnl = payload.today_pnl || 0;
  const todayPnlPct = payload.today_pnl_pct || 0;
  
  return (
    <div className="aegis-portfolio-card">
      <div className="aegis-portfolio-header">
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>Your Portfolio</h3>
        <a href="#" style={{ color: '#10b981', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>View full portfolio</a>
      </div>
      
      <div className="aegis-portfolio-chart-area">
        <div className="aegis-portfolio-pie">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} stroke="none" paddingAngle={2}>
                {data.map((_: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="aegis-portfolio-pie-center">
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Value</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>₹{(totalValue / 1000).toFixed(1)}K</span>
          </div>
        </div>
        
        <div className="aegis-portfolio-legend">
          {data.map((item: any, i: number) => (
            <div key={i} className="aegis-portfolio-legend-item" style={{ cursor: 'pointer' }} onClick={() => onAction("Give me a deep dive on " + (item.symbol || item.name))}>
              <span className="aegis-portfolio-dot" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}></span>
              <span className="aegis-portfolio-name">{item.name || item.symbol}</span>
              <span className="aegis-portfolio-weight">{item.weight || ((item.value / totalValue) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="aegis-portfolio-divider"></div>
      
      <div className="aegis-portfolio-holdings">
        {data.map((item: any, i: number) => {
          const isUp = (item.change_pct || 0) >= 0;
          return (
            <div key={i} className="aegis-portfolio-holding-row" style={{ cursor: 'pointer' }} onClick={() => onAction("Give me a deep dive on " + (item.symbol || item.name))}>
              <div className="aegis-portfolio-holding-icon">
                {item.name ? item.name[0] : item.symbol[0]}
              </div>
              <div className="aegis-portfolio-holding-details">
                <span className="aegis-portfolio-holding-name">{item.name || item.symbol}</span>
                <span className="aegis-portfolio-holding-price">₹{item.price || item.value}</span>
              </div>
              <div className={`aegis-portfolio-holding-change ${isUp ? 'text-green' : 'text-red'}`}>
                {isUp ? '+' : ''}{item.change_pct || 0}%
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="aegis-portfolio-divider" style={{ margin: '12px 0' }}></div>
      
      <div className="aegis-portfolio-footer">
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Today's P&L:</span>
        <span className={todayPnl >= 0 ? 'text-green' : 'text-red'} style={{ marginLeft: '8px', fontWeight: 700 }}>
          ₹{todayPnl} ({todayPnlPct}%)
        </span>
      </div>
    </div>
  );
}

/* ─── Risk Radar Card ─── */
function RiskRadarCard({ payload }: { payload: any }) {
  const m = payload.metrics || {};
  const data = [
    { subject: 'Volatility', A: parseFloat(m.volatility) || 0, fullMark: 30 },
    { subject: 'Beta', A: (parseFloat(m.beta) || 0) * 10, fullMark: 20 },
    { subject: 'Sharpe', A: (parseFloat(m.sharpe) || 0) * 10, fullMark: 30 }
  ];
  return (
    <div className="aegis-receipt-card">
      <div className="aegis-receipt-header" style={{ marginBottom: 0, borderBottom: 'none' }}>
        <div className="aegis-receipt-title">
          <I.Shield2 color="#ef4444" size={20} />
          Risk Profile: {payload.symbol}
        </div>
      </div>
      <div style={{ height: 250, width: '100%' }}>
        <ResponsiveContainer>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
            <Radar name={payload.symbol} dataKey="A" stroke="#ef4444" fill="#ef4444" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Strategy Backtest Card ─── */
function StrategyBacktestCard({ payload }: { payload: any }) {
  const data = payload.pnl_curve || [];
  const metrics = payload.metrics || {};
  const navigate = useNavigate();
  
  return (
    <div className="aegis-receipt-card">
      <div className="aegis-receipt-header" style={{ marginBottom: '16px', borderBottom: 'none' }}>
        <div className="aegis-receipt-title">
          <I.Activity color="#8b5cf6" size={20} />
          Algorithmic Strategy Backtest: {payload.symbol}
        </div>
      </div>
      
      {data.length > 0 && (
        <div style={{ height: 180, width: '100%', marginBottom: '16px' }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={40} />
              <RechartsTooltip 
                contentStyle={{ background: '#121822', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="aegis-receipt-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div className="aegis-receipt-item" style={{ padding: '8px', background: 'var(--bg-sidebar)', borderRadius: '8px' }}>
          <span className="aegis-receipt-label" style={{ fontSize: '11px' }}>Win Rate</span>
          <span className="aegis-receipt-value" style={{ color: '#10b981', fontSize: '14px' }}>{metrics.win_rate || '-'}</span>
        </div>
        <div className="aegis-receipt-item" style={{ padding: '8px', background: 'var(--bg-sidebar)', borderRadius: '8px' }}>
          <span className="aegis-receipt-label" style={{ fontSize: '11px' }}>Total Return</span>
          <span className="aegis-receipt-value" style={{ color: '#3b82f6', fontSize: '14px' }}>{metrics.total_return || '-'}</span>
        </div>
        <div className="aegis-receipt-item" style={{ padding: '8px', background: 'var(--bg-sidebar)', borderRadius: '8px' }}>
          <span className="aegis-receipt-label" style={{ fontSize: '11px' }}>Max Drawdown</span>
          <span className="aegis-receipt-value" style={{ color: '#ef4444', fontSize: '14px' }}>{metrics.max_drawdown || '-'}</span>
        </div>
        <div className="aegis-receipt-item" style={{ padding: '8px', background: 'var(--bg-sidebar)', borderRadius: '8px' }}>
          <span className="aegis-receipt-label" style={{ fontSize: '11px' }}>Sharpe Ratio</span>
          <span className="aegis-receipt-value" style={{ color: '#f59e0b', fontSize: '14px' }}>{metrics.sharpe_ratio || '-'}</span>
        </div>
      </div>

      <div className="aegis-receipt-footer" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button 
          onClick={() => {
            navigate('/algo-backtest', { state: { strategy: payload } });
          }} 
          style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          Open in Studio
        </button>
        <button 
          onClick={async (e) => {
            const btn = e.currentTarget;
            const originalText = btn.innerText;
            btn.innerText = "Saving...";
            try {
              const res = await fetch(`${HOST}/api/paperbull/strategies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  name: payload.name || `Strategy: ${payload.symbol || 'Auto'}`,
                  description: payload.description || "Auto-generated by AEGIS",
                  mode: payload.code ? "code" : "visual",
                  code: payload.code || "class CustomStrategy(Strategy):\n    def next(self):\n        pass",
                  config: payload.config || { 
                    universe: { market: "NSE", top_n: 50 }, 
                    entry: { logic: "AND", conditions: [] }, 
                    exit: { stop_loss: 5, take_profit: 15 },
                    portfolio: { capital: 100000, market: "NSE", symbols: [payload.symbol || "RELIANCE.NS"], interval: "1d", start: "2023-01-01", end: "2024-01-01", warm_up_days: 20 }
                  }
                })
              });
              if (res.ok) {
                btn.innerText = "Saved!";
                btn.style.background = "#10b981";
              } else {
                btn.innerText = "Error Saving";
              }
            } catch (err) {
              btn.innerText = "Error Saving";
            }
            setTimeout(() => { if (btn.innerText === "Saved!" || btn.innerText === "Error Saving") { btn.innerText = originalText; btn.style.background = "#8b5cf6"; } }, 2000);
          }} 
          style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          Save Strategy
        </button>
      </div>
    </div>
  );
}

/* ─── Historical Chart Card ─── */
function HistoricalChartCard({ payload }: { payload: any }) {
  const data = payload.data || [];
  if (data.length === 0) return null;
  return (
    <div className="aegis-receipt-card">
      <div className="aegis-receipt-header" style={{ marginBottom: '16px', borderBottom: 'none' }}>
        <div className="aegis-receipt-title">
          <I.Activity color="#3b82f6" size={20} />
          Price History: {payload.symbol}
        </div>
      </div>
      <div style={{ height: 250, width: '100%' }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <RechartsTooltip 
              contentStyle={{ background: '#121822', border: '1px solid #334155', borderRadius: '8px' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Financial Snapshot Card ─── */
function FinancialSnapshotCard({ payload }: { payload: any }) {
  const m = payload.metrics || {};
  return (
    <div className="aegis-receipt-card">
      <div className="aegis-receipt-header">
        <div className="aegis-receipt-title">
          <I.Activity color="#10b981" size={20} />
          Financial Snapshot: {payload.symbol}
        </div>
      </div>
      <div className="aegis-receipt-grid">
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">Market Cap</span>
          <span className="aegis-receipt-value" style={{ color: '#3b82f6' }}>{m.market_cap || '-'}</span>
        </div>
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">P/E Ratio</span>
          <span className="aegis-receipt-value" style={{ color: '#10b981' }}>{m.pe_ratio || '-'}</span>
        </div>
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">EPS</span>
          <span className="aegis-receipt-value" style={{ color: '#f59e0b' }}>{m.eps || '-'}</span>
        </div>
        <div className="aegis-receipt-item">
          <span className="aegis-receipt-label">Div Yield</span>
          <span className="aegis-receipt-value" style={{ color: '#8b5cf6' }}>{m.dividend_yield ? m.dividend_yield + '%' : '-'}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── News Carousel Card ─── */
function NewsCarouselCard({ payload, onAction }: { payload: any, onAction: (msg: string) => void }) {
  const news = payload.news || [];
  return (
    <div className="aegis-news-carousel-container">
      <div className="aegis-receipt-title" style={{ marginBottom: '12px' }}>
        <I.Activity color="#3b82f6" size={20} />
        Latest Intelligence: {payload.symbol}
      </div>
      <div className="aegis-news-carousel">
        {news.map((item: any, i: number) => {
          const isBull = item.sentiment === 'Bullish';
          const isBear = item.sentiment === 'Bearish';
          const badgeClass = isBull ? 'buy' : isBear ? 'sell' : 'neutral';
          return (
            <div key={i} className="aegis-news-card" style={{ cursor: 'pointer' }} onClick={() => onAction("Analyze this news: " + item.headline)}>
              <div className={`aegis-news-badge ${badgeClass}`}>{item.sentiment}</div>
              <div className="aegis-news-headline">{item.headline}</div>
              <div className="aegis-news-summary">{item.summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Smart Message Renderer ─── */
function SmartMessage({ content, indicators, onAction }: { content: string; indicators: ReturnType<typeof parseIndicators>, onAction: (msg: string) => void }) {
  // If we have indicator data, show the card with properly rendered surrounding text
  if (indicators) {
    return (
      <>
        {indicators.textBefore && (
          <div className="aegis-msg-ai-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdownText(indicators.textBefore) }} />
        )}
        <IndicatorCard data={indicators} />
        {indicators.textAfter && (
          <div className="aegis-msg-ai-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdownText(indicators.textAfter) }} />
        )}
      </>
    );
  }

  // Intercept structured JSON payloads
  let cleanContent = content;
  const parsedPayloads: any[] = [];
  
  const statusRegex = /"status"\s*:\s*"(pending_confirmation|trade_executed|portfolio_allocation|risk_profile|financial_snapshot|news_sentiment|historical_chart|strategy_backtest)"/;
  
  let currentIndex = 0;
  while (currentIndex < cleanContent.length) {
    const startIdx = cleanContent.indexOf('{', currentIndex);
    if (startIdx === -1) break;
    
    let braceCount = 0;
    let endIdx = -1;
    let inString = false;
    let escape = false;
    
    for (let i = startIdx; i < cleanContent.length; i++) {
      const char = cleanContent[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
    }
    
    if (endIdx !== -1) {
      const jsonStr = cleanContent.substring(startIdx, endIdx + 1);
      if (statusRegex.test(jsonStr)) {
        try {
          const payload = JSON.parse(jsonStr);
          parsedPayloads.push(payload);
          cleanContent = (cleanContent.substring(0, startIdx) + cleanContent.substring(endIdx + 1));
          // Clean up dangling backticks
          cleanContent = cleanContent.replace(/```(?:json)?\s*\n*\s*```/g, '').trim();
          currentIndex = 0;
          continue;
        } catch (e) {
          // Just continue if JSON is invalid
        }
      }
    }
    currentIndex = startIdx + 1;
  }

  // Otherwise, split the message into text segments and table segments
  const segments: Array<{ type: 'text' | 'table'; content: string }> = [];
  const lines = cleanContent.split('\n');
  let currentText: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      if (!inTable) {
        if (currentText.length > 0) {
          segments.push({ type: 'text', content: currentText.join('\n') });
          currentText = [];
        }
        inTable = true;
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        segments.push({ type: 'table', content: tableLines.join('\n') });
        tableLines = [];
        inTable = false;
      }
      currentText.push(line);
    }
  }

  if (inTable && tableLines.length > 0) {
    segments.push({ type: 'table', content: tableLines.join('\n') });
  } else if (currentText.length > 0) {
    segments.push({ type: 'text', content: currentText.join('\n') });
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'table') {
          const parsed = parseMarkdownTable(seg.content);
          if (parsed) {
            return <BeautifulTable key={i} headers={parsed.headers} rows={parsed.rows} />;
          }
        }
        return (
          <div key={i} className="aegis-msg-ai-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdownText(seg.content) }} />
        );
      })}
      {/* Grouped Trade Executions */}
      {(() => {
        const executed = parsedPayloads.filter(p => p.status === 'trade_executed');
        if (executed.length > 1) {
          return <MultiTradeResultCard payloads={executed} />;
        }
        return null;
      })()}

      {/* Render Single Trades & Other Payloads */}
      {parsedPayloads.filter(p => p.status !== 'trade_executed' || parsedPayloads.filter(x => x.status === 'trade_executed').length === 1).map((payload, idx) => (
        <div key={`payload-${idx}`}>
          {payload.status === 'pending_confirmation' && <TradeConfirmCard payload={payload} />}
          {payload.status === 'trade_executed' && <TradeResultCard payload={payload} />}
          {payload.status === 'portfolio_allocation' && <PortfolioAllocationCard payload={payload} onAction={onAction} />}
          {payload.status === 'strategy_backtest' && <StrategyBacktestCard payload={payload} />}
          {payload.status === 'risk_profile' && <RiskRadarCard payload={payload} />}
          {payload.status === 'historical_chart' && <HistoricalChartCard payload={payload} />}
          {payload.status === 'financial_snapshot' && <FinancialSnapshotCard payload={payload} />}
          {payload.status === 'news_sentiment' && <NewsCarouselCard payload={payload} onAction={onAction} />}
        </div>
      ))}
    </>
  );
}



/* ─── Stock Chart Card ─── */
function StockChartCard({ symbol }: { symbol: string }) {
  const [lineData, setLineData] = useState<LinePoint[]>([]);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [timeframe, setTimeframe] = useState("1D");
  const [loading, setLoading] = useState(true);
  const tfs = ["1D", "1W", "1M", "3M", "1Y"];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const days = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365 }[timeframe] || 1;
      const interval = timeframe === "1D" ? "1m" : "1d";
      const [qRes, hRes] = await Promise.all([
        fetch(`${HOST}/api/stocks/${encodeURIComponent(symbol)}/quote`),
        fetch(`${HOST}/api/stocks/${encodeURIComponent(symbol)}/history?days=${days}&interval=${interval}`),
      ]);
      if (qRes.ok) setQuote(await qRes.json());
      if (hRes.ok) {
        const candles = await hRes.json();
        if (Array.isArray(candles)) {
          const shifted = timeframe === "1D"
            ? candles.map((c: any) => ({ x: c.x + 5.5 * 3600 * 1000, y: c.c }))
            : candles.map((c: any) => ({ x: c.x, y: c.c }));
          setLineData(shifted);
        }
      }
    } catch (e) {
      console.error("StockChartCard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pct = quote ? quote.regularMarketChangePercent : 0;
  const isPos = pct >= 0;
  const name = quote?.longName || quote?.shortName || symbol;
  const price = quote?.regularMarketPrice?.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <div className="aegis-stock-card">
      {/* Header */}
      <div className="aegis-stock-card-header">
        <div className="aegis-stock-info">
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 10 }}>
            {symbol.replace(".NS", "").replace("^", "").slice(0, 4)}
          </div>
          <div>
            <div className="aegis-stock-name">{name}</div>
            <div className="aegis-stock-exchange">{symbol.replace(".NS", " · NSE").replace("^NSEI", "Nifty 50 · NSE").replace("^BSESN", "Sensex · BSE").replace("^NSEBANK", "Bank Nifty · NSE")}</div>
          </div>
        </div>
        {quote && (
          <div style={{ textAlign: "right" }}>
            <div className="aegis-stock-price">₹{price}</div>
            <div className={isPos ? "aegis-stock-change-pos" : "aegis-stock-change-neg"}>
              {isPos ? "+" : ""}{quote.regularMarketChange?.toFixed(2)} ({isPos ? "+" : ""}{pct?.toFixed(2)}%)
            </div>
            <div className="aegis-stock-as-of">Market: {quote.marketState}</div>
          </div>
        )}
      </div>

      {/* Timeframe selector */}
      <div className="aegis-stock-chart-tf">
        {tfs.map(tf => (
          <button key={tf} className={timeframe === tf ? "active" : ""} onClick={() => setTimeframe(tf)}>{tf}</button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: 110, padding: "8px 10px 4px", position: "relative" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 12 }}>
            Loading chart…
          </div>
        ) : lineData.length > 0 ? (
          <StockChartIndia
            lineData={lineData}
            timeframe={timeframe}
            marketState={quote?.marketState ?? "CLOSED"}
            referencePrice={quote?.regularMarketPreviousClose ?? null}
            percent={String(pct ?? 0)}
            trades={[]}
            pendingSL={[]}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 12 }}>
            No chart data
          </div>
        )}
      </div>
    </div>
  );
}


const HERO_PROMPTS = [
  "What would you like |to explore today?",
  "Which stock |should we analyze next?",
  "Let's backtest |a new trading strategy.",
  "Want to learn about |technical indicators?",
  "How can I help you |understand the market?",
  "Ready to review |your portfolio risk?",
  "Let's dive into |some financial data.",
  "Curious about |candlestick patterns?"
];

function TypewriterQuote({ activeConvId }: { activeConvId: string | null }) {
  const [fullText, setFullText] = useState("");

  useEffect(() => {
    const quote = HERO_PROMPTS[Math.floor(Math.random() * HERO_PROMPTS.length)];
    setFullText(quote);
  }, [activeConvId]);

  // Find split point: pipe marks where accent color starts
  const pipeIdx = fullText.indexOf("|");
  const plainText = fullText.replace("|", "");
  const part1End = pipeIdx >= 0 ? pipeIdx : plainText.length;
  
  const text1 = plainText.slice(0, part1End);
  const text2 = plainText.slice(part1End);

  return (
    <h1 className="aegis-hero-heading">
      <span className="aegis-hero-heading-white">{text1}</span><span className="aegis-hero-heading-gold">{text2}</span>
    </h1>
  );
}



/* ═══════════════════════════════════════════
   MAIN AEGIS PAGE
═══════════════════════════════════════════ */
export default function AegisPage() {
  const { user } = useContext(AuthContext);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    return localStorage.getItem('aegis-active-conv') || null;
  });
  const [serverConvs, setServerConvs] = useState<ConvMeta[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState<boolean>(() => localStorage.getItem('aegis-theme') !== 'light');
  const [isLoadingConv, setIsLoadingConv] = useState(false);
  const [agentMode, setAgentMode] = useState<"fast" | "deep">("deep");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleRequestedRef = useRef<Set<string>>(new Set());

  /* Sync states to localStorage */
  useEffect(() => {
    localStorage.setItem('aegis-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (activeConvId) {
      localStorage.setItem('aegis-active-conv', activeConvId);
    } else {
      localStorage.removeItem('aegis-active-conv');
    }
  }, [activeConvId]);
  
  /* Initial load if activeConvId exists */
  useEffect(() => {
    if (activeConvId && messages.length === 0) {
      loadConversation(activeConvId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  };

  const firstName = user?.displayName?.split(" ")[0] ?? "there";
  const initials = (user?.displayName?.[0] ?? user?.email?.[0] ?? "S").toUpperCase();

  /* Scroll to bottom on new messages */
  useEffect(() => {
    if (messagesEndRef.current && messagesEndRef.current.parentElement) {
      messagesEndRef.current.parentElement.scrollTo({
        top: messagesEndRef.current.parentElement.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages]);

  /* Load conversation list from backend */
  useEffect(() => {
    if (!user) return;
    fetch(`${HOST}/api/ai/aegis/conversations`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setServerConvs)
      .catch(() => { });
  }, [user]);

  /* Save conversation to backend whenever messages change */
  useEffect(() => {
    if (!user || messages.length === 0 || !activeConvId) return;
    const existingTitle = serverConvs.find(c => c.id === activeConvId)?.title;
    const title = existingTitle || messages.find(m => m.role === "user")?.content?.slice(0, 50) || "New chat";

    // Only send isNew=true once per conversation to prevent redundant backend LLM requests during streaming
    const isNew = !existingTitle && !titleRequestedRef.current.has(activeConvId);
    if (isNew) {
      titleRequestedRef.current.add(activeConvId);
    }

    fetch(`${HOST}/api/ai/aegis/conversations`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: activeConvId, title, messages, isNew }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.generatedTitle && data.generatedTitle !== existingTitle) {
          setServerConvs(prev => {
            const exists = prev.find(c => c.id === activeConvId);
            if (exists) {
              return prev.map(c => c.id === activeConvId ? { ...c, title: data.generatedTitle } : c);
            } else {
              return [{ id: activeConvId, title: data.generatedTitle, updatedAt: new Date().toISOString() }, ...prev];
            }
          });
        }
      })
      .catch(() => { });
  }, [messages, activeConvId]);

  /* Load a single conversation */
  const loadConversation = async (id: string) => {
    if (streaming || id === activeConvId) return;
    
    // Immediate UI feedback
    setActiveConvId(id);
    setMessages([]); 
    setIsLoadingConv(true);

    try {
      const res = await fetch(`${HOST}/api/ai/aegis/conversations/${id}`, { credentials: "include" });
      if (!res.ok) return;
      const conv = await res.json();
      
      // Force isStreaming to false for loaded messages so they aren't stuck "thinking"
      const loadedMessages = (conv.messages || []).map((m: any) => ({ 
        ...m, 
        isStreaming: false 
      }));
      setMessages(loadedMessages);
    } catch { 
      /* silent */ 
    } finally {
      setIsLoadingConv(false);
    }
  };

  /* New chat */
  const newChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setActiveConvId(crypto.randomUUID());
    setInput("");
    setStreaming(false);
  };

  /* Send message */
  const handleSend = useCallback(async (forcedText?: string) => {
    const text = (forcedText || input).trim();
    if (!text || streaming) return;

    // Create conv id if needed
    const convId = activeConvId || crypto.randomUUID();
    if (!activeConvId) setActiveConvId(convId);

    const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, time: now };
    const aiMsg: Message = { id: crypto.randomUUID(), role: "ai", content: "", time: now, isStreaming: true };

    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput("");
    setStreaming(true);

    const history = [...messages, userMsg].map(m => ({ id: m.id, role: m.role === "ai" ? "assistant" : m.role, content: m.content }));

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${HOST}/api/ai/aegis/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: history, 
          thread_id: activeConvId,
          uid: user?.uid, // Pass UID for portfolio/trading tools
          mode: agentMode
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: "⚠️ Failed to reach AEGIS. Please try again.", isStreaming: false } : m));
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let firstDataReceived = false;

      // Update AI message by id
      const updateAI = (updater: (prev: string) => string, extra?: Partial<Message>) =>
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: updater(m.content), ...extra } : m));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(trimmed.slice(6));

            if (evt.type === "status") {
              setMessages(prev => prev.map(m => {
                if (m.id === aiMsg.id) {
                  return {
                    ...m,
                    statuses: [...(m.statuses || []), evt.text]
                  };
                }
                return m;
              }));
              firstDataReceived = true;
            } else if (evt.type === "token") {
              setMessages(prev => prev.map(m => {
                if (m.id === aiMsg.id) {
                  return {
                    ...m,
                    content: firstDataReceived ? m.content + evt.text : evt.text
                  };
                }
                return m;
              }));
              firstDataReceived = true;
            } else if (evt.type === "symbol") {
              updateAI(p => p, { symbol: evt.symbol });
            } else if (evt.type === "done") {
              updateAI(p => p, { isStreaming: false });
            } else if (evt.type === "error") {
              updateAI(_ => `⚠️ ${evt.text}`, { isStreaming: false });
            }
          } catch { /* partial */ }
        }
      }

      updateAI(p => p, { isStreaming: false });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: "⚠️ Connection lost. Please try again.", isStreaming: false } : m));
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, activeConvId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const quickActions = [
    { icon: <I.ChartLine />, label: "Analyze a stock" },
    { icon: <I.ListBullet />, label: "Build a watchlist" },
    { icon: <I.Shield />, label: "Check portfolio risk" },
    { icon: <I.Activity />, label: "Market summary" },
    { icon: <I.Backtest />, label: "Backtest a strategy" },
  ];

  /* const allConvs = [
    ...serverConvs.map(c => ({ id: c.id, label: c.title, server: true })),
    ...Object.entries(CONVERSATIONS_STATIC).flatMap(([, items]) => items.map(i => ({ id: i, label: i, server: false }))),
  ]; */

  /* Quick action triggered from child components */
  const onQuickAction = useCallback((text: string) => {
    handleSend(text);
  }, [handleSend]);

  const showHero = messages.length === 0 && !isLoadingConv;

  return (
    <div className={`aegis-shell${isDark ? ' dark' : ''}`}>
      {/* ── LEFT SIDEBAR ── */}
      <aside className={`aegis-sidebar ${isSidebarOpen ? "" : "collapsed"}`}>
        <div className="aegis-brand">
          <div className="aegis-brand-row">
            <div className="aegis-brand-logo" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ cursor: 'pointer' }}>
              <img src={aegisLogo} alt="AEGIS" className="aegis-brand-img" />
              <span className="aegis-brand-name">AEGIS</span>
            </div>
          </div>
        </div>
        <div className="aegis-brand-tagline">Intelligent Insights. Smarter Trades.</div>

        <button className="aegis-new-chat-btn" onClick={newChat}>
          <I.Plus /> <span className="aegis-new-chat-btn-text">New Chat</span>
        </button>

        <button 
          className="aegis-theme-btn" 
          onClick={() => setIsDark(d => !d)}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <I.Sun /> : <I.Moon />} 
          <span className="aegis-theme-btn-text">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>


        <div className="aegis-conv-section">
          {serverConvs.length > 0 && (
            <>
              <div className="aegis-conv-group-label">Saved Conversations</div>
              <div className="aegis-conv-list">
                {serverConvs.map(c => (
                  <div key={c.id} className={`aegis-conv-item${activeConvId === c.id ? " active" : ""}`}
                    onClick={() => loadConversation(c.id)}>
                    <div className="aegis-conv-item-content">
                      <div className="aegis-conv-item-title">
                        <span className="aegis-conv-title-text">{c.title}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </aside>

      {/* ── MAIN CHAT ── */}
      <main className="aegis-main">
        {/* Cinematic background */}
        <div className="aegis-bg-canvas" aria-hidden="true">
          {/* Glowing planet orb — top-left (hidden in light mode via CSS) */}
          <div className="aegis-orb" />
          
          {/* Elegant zoomed-out flowing lines for both themes */}
          <svg className="aegis-elegant-waves" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <g fill="none" strokeLinecap="round">
              <path d="M -200 1100 Q 500 200 900 550 T 1900 -200" stroke="var(--elegant-wave-1, #e0ece4)" strokeWidth="6" className="aegis-wave-path" />
              <path d="M -150 1200 Q 600 300 1000 650 T 2000 -100" stroke="var(--elegant-wave-2, #ebf2ee)" strokeWidth="10" className="aegis-wave-path" />
            </g>
          </svg>
        </div>
        {showHero && (
          <div className="aegis-hero-container">
            <div className="aegis-hero">
              <div className="aegis-hero-logo-wrap">
                <img src={aegisLogo} alt="AEGIS AI" className="aegis-hero-logo" />
              </div>
              <div className="aegis-hero-eyebrow">Good {greet()}, {firstName}</div>
              <TypewriterQuote activeConvId={activeConvId} />
              <p className="aegis-hero-sub">Get real-time insights, research, analysis and more — all in one place.</p>
            </div>
            <div className="aegis-quick-actions">
              {quickActions.map(({ icon, label }) => (
                <button key={label} className="aegis-chip" onClick={() => setInput(label)}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading Indicator (Skeleton) */}
        {isLoadingConv && (
          <div className="aegis-messages" style={{ overflowY: 'hidden' }}>
            {/* Mock User Message */}
            <div className="aegis-msg-user" style={{ opacity: 0.7 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%' }}>
                <div className="aegis-skeleton-bubble" style={{ width: '40%', height: '40px', borderTopRightRadius: 4 }}></div>
              </div>
              <div className="aegis-skeleton-avatar"></div>
            </div>
            
            {/* Mock AI Message */}
            <div className="aegis-msg-ai" style={{ opacity: 0.7, marginTop: '24px' }}>
              <div className="aegis-skeleton-avatar"></div>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '12px', marginTop: '8px' }}>
                <div className="aegis-skeleton-bubble" style={{ width: '85%', height: '18px' }}></div>
                <div className="aegis-skeleton-bubble" style={{ width: '95%', height: '18px' }}></div>
                <div className="aegis-skeleton-bubble" style={{ width: '60%', height: '18px' }}></div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {!showHero && !isLoadingConv && (
          <div className="aegis-messages">
            {messages.map(msg =>
              msg.role === "user" ? (
                <div key={msg.id} className="aegis-msg-user">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div className="aegis-msg-user-bubble">{msg.content}</div>
                    <div className="aegis-msg-user-time">{msg.time}</div>
                  </div>
                  <div className="aegis-msg-user-avatar">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={firstName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      initials
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="aegis-msg-ai">
                  <div className="aegis-msg-ai-avatar">
                    <img src={aegisLogo} alt="Aegis" className="aegis-ai-avatar-img" />
                  </div>
                  <div className="aegis-msg-ai-body">
                    {msg.isStreaming && msg.statuses && msg.statuses.length > 0 && (
                      <div className="aegis-status-pill">
                        <div className="aegis-status-row">
                          <span className="aegis-status-dot">▲</span>
                          <span className="aegis-status-text" key={msg.statuses[msg.statuses.length - 1]}>
                            {msg.statuses[msg.statuses.length - 1]}
                          </span>
                        </div>
                      </div>
                    )}

                    {msg.content ? (
                      <SmartMessage
                        content={msg.content}
                        indicators={!msg.isStreaming ? parseIndicators(msg.content) : null}
                        onAction={onQuickAction}
                      />
                    ) : (
                      !msg.statuses?.length && (
                        <div className="aegis-thinking-candles">
                          <div className="aegis-candle up" />
                          <div className="aegis-candle down" />
                          <div className="aegis-candle up" />
                          <div className="aegis-candle down" />
                        </div>
                      )
                    )}

                    {/* Live chart card when a symbol was detected */}
                    {msg.symbol && !msg.isStreaming && (
                      <StockChartCard symbol={msg.symbol} />
                    )}

                    {!msg.isStreaming && msg.content && (
                      <div className="aegis-msg-ai-actions">
                        <button className="aegis-msg-ai-action-btn" title="Copy"
                          onClick={() => navigator.clipboard.writeText(msg.content)}>
                          <I.Copy />
                        </button>
                        <button className="aegis-msg-ai-action-btn" title="Helpful"><I.ThumbUp /></button>
                        <button className="aegis-msg-ai-action-btn" title="Not helpful"><I.ThumbDown /></button>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Bar */}
        <div className="aegis-input-bar">
          <div className="aegis-input-inner">
            <button className="aegis-input-attach-btn"><I.Paperclip /></button>
            <textarea
              id="aegis-chat-input"
              className="aegis-input-field"
              rows={1}
              placeholder="Ask AEGIS a follow-up question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />

            <div className="aegis-mode-toggle" title="Select Agent Architecture" onClick={() => !streaming && setAgentMode(prev => prev === "deep" ? "fast" : "deep")}>
              <span className={`aegis-toggle-label ${agentMode === "deep" ? "active" : ""}`}>Deep</span>
              <div className={`aegis-toggle-track ${agentMode === "fast" ? "fast" : ""}`}>
                <div className="aegis-toggle-thumb" />
              </div>
              <span className={`aegis-toggle-label ${agentMode === "fast" ? "active" : ""}`}>Fast</span>
            </div>

            <button className="aegis-send-btn" onClick={streaming ? () => abortRef.current?.abort() : () => handleSend()}
              title={streaming ? "Stop" : "Send"}
              style={streaming ? { background: "#dc2626" } : {}}>
              {streaming ? <I.Loader /> : <I.Send />}
            </button>
          </div>
          <div className="aegis-input-disclaimer">
            AEGIS provides educational insights, not financial advice. Always do your own research.
          </div>
        </div>
      </main>


      <style>{`
        /* ── Mode Toggle ── */
        .aegis-mode-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; margin-right: 12px; background: transparent; border: none; padding: 0; }
        .aegis-toggle-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; transition: color 0.2s ease; }
        .aegis-toggle-label.active { color: var(--text-primary); }
        .aegis-toggle-track { width: 36px; height: 20px; border-radius: 20px; background: #3b82f6; position: relative; transition: background 0.3s ease; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); }
        .aegis-toggle-track.fast { background: #10b981; }
        .aegis-toggle-thumb { width: 16px; height: 16px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
        .aegis-toggle-track.fast .aegis-toggle-thumb { transform: translateX(16px); }

        @keyframes aegis-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .aegis-spin { animation: aegis-spin 1s linear infinite; }

        /* ── Status pill ── */
        @keyframes aegis-pill-in {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aegis-sweep {
          0%   { width: 0%; opacity: 1; }
          85%  { width: 90%; opacity: 1; }
          100% { width: 90%; opacity: 0.4; }
        }
        @keyframes aegis-tick-pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }

        .aegis-status-pill {
          display: inline-flex; flex-direction: column; gap: 5px;
          margin-bottom: 10px; animation: aegis-pill-in 0.18s ease both;
        }
        .aegis-status-row { display: flex; align-items: center; gap: 7px; }
        .aegis-status-dot {
          font-size: 9px; font-weight: 800; color: #10b981;
          flex-shrink: 0; animation: aegis-tick-pulse 1.4s ease-in-out infinite; line-height: 1;
        }
        .aegis-status-text {
          font-size: 12px; font-weight: 500;
          color: var(--status-text);
          letter-spacing: 0.01em; font-family: 'Inter', sans-serif;
        }
        .aegis-status-bar-track {
          height: 2px; background: var(--status-track);
          border-radius: 2px; overflow: hidden; width: 140px;
        }
        .aegis-status-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #6366f1);
          border-radius: 2px;
          animation: aegis-sweep 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

      `}</style>
    </div>
  );
}
