import { useEffect, useState } from 'react';
import './ReplayHistory.css';

interface ReplaySession {
  id: number;
  symbol: string;
  replayDate: string;
  intervalUsed: string;
  initialCapital: number;
  currentCash: number;
  pnl: number;
  returnPct: number;
  status: string;
  tradeCount: number;
  createdAt: string;
}

interface ReplayHistoryProps {
  symbol: string;
  activeSessionId: number | null;
}

export default function ReplayHistory({ symbol, activeSessionId }: ReplayHistoryProps) {
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [loading, setLoading] = useState(false);
  const HOST = import.meta.env.VITE_HOST_ADDRESS || '';

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    const cleanSymbol = symbol.replace('.NS', '');
    fetch(`${HOST}/api/replay/sessions?symbol=${cleanSymbol}`, {
      credentials: 'include',
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSessions(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol, activeSessionId]); // refresh when a new session completes

  if (loading) return null;
  if (sessions.length === 0) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(n));
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="rh-container">
      <div className="rh-header">
        <span className="rh-title">Past Replays</span>
        <span className="rh-symbol">{symbol.replace('.NS', '')}</span>
      </div>
      <div className="rh-list">
        {sessions.map(s => {
          const isActive = s.id === activeSessionId;
          const positive = s.pnl >= 0;
          return (
            <div key={s.id} className={`rh-card ${isActive ? 'active' : ''}`}>
              <div className="rh-card-left">
                <span className="rh-date">{fmtDate(s.replayDate)} · {s.intervalUsed}</span>
                <div className="rh-capital-row">
                  <span className="rh-init">₹{fmt(s.initialCapital)}</span>
                  <span className="rh-arrow">→</span>
                  <span className="rh-final" style={{ color: positive ? '#16a34a' : '#dc2626' }}>
                    ₹{fmt(s.currentCash)}
                  </span>
                </div>
              </div>
              <div className="rh-card-right">
                <span className={`rh-pnl ${positive ? 'pos' : 'neg'}`}>
                  {positive ? '+' : '-'}₹{fmt(s.pnl)}
                  <em>({positive ? '+' : ''}{s.returnPct.toFixed(1)}%)</em>
                </span>
                <span className="rh-trades">{s.tradeCount} trades</span>
                {isActive && <span className="rh-active-badge">Active</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
