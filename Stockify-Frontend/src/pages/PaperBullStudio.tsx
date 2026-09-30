// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import '../Styles/PaperBullStudio.css';
import '../Styles/stock.css';
import { AlgoBacktestChart } from '../components/charts/AlgoBacktestChart';
import { RecursiveBuilder } from '../components/NestedBuilder';
import StockLogo from '../components/common/StockLogo';
import SearchOverlay from '../components/layout/SearchOverlay';


function computeSMA(data: {x: number, y: number}[], period: number) {
  let result: {x: number, y: number|null}[] = [];
  for(let i=0; i<data.length; i++) {
     if(i < period - 1) {
       result.push({ x: data[i].x, y: null });
     } else {
       let sum = 0;
       for(let j=0; j<period; j++) sum += data[i-j].y;
       result.push({ x: data[i].x, y: sum / period });
     }
  }
  return result;
}

function computeEMA(data: {x: number, y: number}[], period: number) {
  let result: {x: number, y: number|null}[] = [];
  let k = 2 / (period + 1);
  let ema: number | null = null;
  for(let i=0; i<data.length; i++) {
     if(i < period - 1) {
       result.push({ x: data[i].x, y: null });
     } else if(i === period - 1) {
       let sum = 0;
       for(let j=0; j<period; j++) sum += data[i-j].y;
       ema = sum / period;
       result.push({ x: data[i].x, y: ema });
     } else {
       ema = (data[i].y - ema!) * k + ema!;
       result.push({ x: data[i].x, y: ema });
     }
  }
  return result;
}

function computeRSI(data: {x: number, y: number}[], period: number) {
  let result: {x: number, y: number|null}[] = [];
  let gains = 0, losses = 0;
  for(let i=0; i<data.length; i++) {
     if(i === 0) {
       result.push({ x: data[i].x, y: null });
       continue;
     }
     let diff = data[i].y - data[i-1].y;
     if(i < period) {
        if(diff > 0) gains += diff;
        else losses -= diff;
        result.push({ x: data[i].x, y: null });
     } else if(i === period) {
        if(diff > 0) gains += diff;
        else losses -= diff;
        gains /= period;
        losses /= period;
        let rs = gains / (losses === 0 ? 1 : losses);
        result.push({ x: data[i].x, y: 100 - (100 / (1 + rs)) });
     } else {
        let gain = diff > 0 ? diff : 0;
        let loss = diff < 0 ? -diff : 0;
        gains = (gains * (period - 1) + gain) / period;
        losses = (losses * (period - 1) + loss) / period;
        let rs = gains / (losses === 0 ? 1 : losses);
        result.push({ x: data[i].x, y: 100 - (100 / (1 + rs)) });
     }
  }
  return result;
}

const LiveStudioGraph = ({ symbol, indicatorSeries, onClose, strategyName, userId, buyDsl, sellDsl, allocatedCapital, mode, stopLossPct, stopLossType }: { symbol: string, indicatorSeries: any[], onClose: () => void, strategyName?: string, userId?: string, buyDsl?: string, sellDsl?: string, allocatedCapital?: number, mode?: 'simulate' | 'upstox', stopLossPct: number, stopLossType: string }) => {
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
  const [data, setData] = useState<{x: number, y: number}[]>([]);
  const [indicatorData, setIndicatorData] = useState<{[key: string]: {x: number, y: number}[]}>({});
  
  // Simulated stats for the dashboard
  const [invested, setInvested] = useState(0);
  const [pnl, setPnl] = useState(0);
  const [cash, setCash] = useState(allocatedCapital || 0);
  const [investedQty, setInvestedQty] = useState(0);
  const [position, setPosition] = useState<"NONE"|"LONG"|"SHORT">("NONE");
  const [trades, setTrades] = useState<any[]>([]);
  
  const [ltp, setLtp] = useState(0);
  const [prevLtp, setPrevLtp] = useState(0);
  const [latestIndicators, setLatestIndicators] = useState<any>({});
  const [activeStopLoss, setActiveStopLoss] = useState<number | null>(null);
  const [showLiveLedger, setShowLiveLedger] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{ name: string; exchange: string } | null>(null);

  // Fetch real company name from backend
  useEffect(() => {
    if (!symbol || !HOST) return;
    const encoded = encodeURIComponent(symbol);
    fetch(`${HOST}/api/stocks/${encoded}/quote`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const name = d?.longName || d?.shortName || d?.companyName || d?.name || null;
        const exchange = d?.fullExchangeName || (symbol.endsWith('.BO') ? 'BSE' : 'NSE');
        if (name) setCompanyInfo({ name, exchange });
      })
      .catch(() => {});
  }, [symbol, HOST]);

  const positionRef = useRef<"NONE"|"LONG"|"SHORT">("NONE");
  const investedRef = useRef(0);
  const investedQtyRef = useRef(0);
  const cashRef = useRef(allocatedCapital || 0);
  const ltpRef = useRef(0);
  const highestPriceRef = useRef(0);
  
  const [signals, setSignals] = useState<{BUY: boolean, SELL: boolean}>({BUY: false, SELL: false});
  const [isCompleted, setIsCompleted] = useState(false);
  
  useEffect(() => {
    if (isCompleted) {
        // Use refs for all values — refs are always current unlike stale closure state
        const currentQty = investedQtyRef.current;
        const currentInvestedCost = investedRef.current;
        const currentLtp = ltpRef.current;
        const currentCash = cashRef.current;

        let finalTrades: any[] = [];
        let finalReturnedCapital: number;

        if (positionRef.current === "LONG" && currentQty > 0) {
            // Auto-sell at current LTP
            const sellValue = currentQty * currentLtp;
            const realizedPnl = sellValue - currentInvestedCost;
            finalTrades.push({
                side: "SELL",
                quantity: currentQty,
                pricePerShare: currentLtp,
                createdAtIST: new Date().toISOString(),
                pnl: realizedPnl,
                isAlgo: true
            });
            // Total capital returned = remaining cash + proceeds from selling
            finalReturnedCapital = currentCash + sellValue;
            setPnl(finalReturnedCapital - Number(allocatedCapital || 0));
            setTrades(prev => [...prev, ...finalTrades]);
            setInvested(0);
            setInvestedQty(0);
            setPosition("NONE");
            investedRef.current = 0;
            investedQtyRef.current = 0;
            positionRef.current = "NONE";
            cashRef.current = finalReturnedCapital;
        } else {
            // No open position — just return whatever cash is left
            finalReturnedCapital = currentCash;
        }

        fetch(`${HOST}/api/algo/session/stop`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                returnedCapital: finalReturnedCapital,
                symbol,
                strategyName,
                pnl: finalReturnedCapital - Number(allocatedCapital || 0),
                trades: finalTrades
            })
        }).then(async res => {
            if (res.ok) {
                // Dispatch BEFORE onClose so parent is still mounted and can hear the event
                window.dispatchEvent(new CustomEvent('wallet-refetch', {}));
            }
        }).catch(console.error).finally(() => {
            onClose();
        });
        setIsCompleted(false);
    }
  }, [isCompleted]);

  useEffect(() => {
    let ws: WebSocket;
    let isActive = true;

    try {
      const algoWsUrl = import.meta.env.VITE_ALGO_WS_URL ||
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/live`;
      ws = new WebSocket(algoWsUrl);
      ws.onopen = () => {
        const visualIndicators = indicatorSeries.map(s => s.key);
        const activeMode = mode || 'simulate';
        console.log(`[LiveStudioGraph] Connecting | Symbol: ${symbol} | Mode: ${activeMode.toUpperCase()}`);
        ws.send(JSON.stringify({ 
            action: "subscribe", 
            symbols: [symbol], 
            reset: false, 
            indicators: visualIndicators,
            strategyName: strategyName,
            userId: userId,
            allocatedCapital: allocatedCapital,
            mode: activeMode
        }));
      };
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (
            d.symbol === symbol || 
            d.symbolNS === symbol || 
            (d.symbol && symbol && d.symbol.replace(".NS", "") === symbol.replace(".NS", ""))
          ) {
            const currentLtp = d.ltp || d.price;
            if (currentLtp && isActive) {
               const time = d.candle_minute_ts ? new Date(d.candle_minute_ts).getTime() : Date.now();
               
               setLtp(currentLtp);
               ltpRef.current = currentLtp;

               // Keep the displayed trailing stop synchronized with the live price.
               if (positionRef.current === "LONG" && stopLossType === "trailing") {
                   highestPriceRef.current = Math.max(highestPriceRef.current, currentLtp);
                   setActiveStopLoss(highestPriceRef.current * (1 - Number(stopLossPct) / 100));
               }
               
               setData(prev => {
                  if (prev.length > 0 && prev[prev.length - 1].x === time) {
                      const next = [...prev];
                      next[next.length - 1] = { x: time, y: currentLtp };
                      return next;
                  }
                  const next = [...prev, { x: time, y: currentLtp }];
                  return next.length > 2500 ? next.slice(-2500) : next;
               });
               
               if (d.indicators) {
                   setLatestIndicators(d.indicators);
                   setIndicatorData(prev => {
                       const nextInds = { ...prev };
                       for (const [key, val] of Object.entries(d.indicators)) {
                           if (val !== null) {
                               if (!nextInds[key]) nextInds[key] = [];
                               if (nextInds[key].length > 0 && nextInds[key][nextInds[key].length - 1].x === time) {
                                   nextInds[key][nextInds[key].length - 1] = { x: time, y: val as number };
                               } else {
                                   nextInds[key] = [...nextInds[key], { x: time, y: val as number }];
                               }
                               if (nextInds[key].length > 2500) nextInds[key] = nextInds[key].slice(-2500);
                           }
                       }
                       return nextInds;
                   });
               }

               if (d.trade_executed) {
                   const { side, qty, price, capital_remaining } = d.trade_executed;
                   const currentPos = positionRef.current;
                   const currentInvested = investedRef.current;
                   
                   // Beautiful Toast Notification Simulation
                   const toastColor = side === "BUY" ? "#10b981" : "#ef4444";
                   const toastIcon = side === "BUY" ? "🟩" : "🟥";
                   console.log(`%c${toastIcon} ALGO ${side}: ${qty} Shares of ${symbol} at ₹${price} (Capital Left: ₹${capital_remaining.toFixed(2)})`, `color: ${toastColor}; font-weight: bold; font-size: 14px;`);
                   
                   if (side === "BUY") {
                       const newInvested = price * qty;
                       setInvested(newInvested);
                       investedRef.current = newInvested;
                        setInvestedQty(qty);
                        investedQtyRef.current = qty;
                        setCash(capital_remaining);
                        cashRef.current = capital_remaining;
                       setPosition("LONG");
                       positionRef.current = "LONG";
                       highestPriceRef.current = price;
                       setActiveStopLoss(price * (1 - Number(stopLossPct) / 100));
                       
                       setTrades(prev => [...prev, {
                           side: "BUY",
                           quantity: qty,
                           pricePerShare: price,
                           createdAtIST: time,
                           isAlgo: true
                       }]);
                   } else if (side === "SELL" && currentPos === "LONG") {
                       const realizedPnl = (price * qty - currentInvested);
                       setPnl(prev => prev + realizedPnl);
                       setInvested(0);
                       investedRef.current = 0;
                        setInvestedQty(0);
                        investedQtyRef.current = 0;
                        setCash(capital_remaining);
                        cashRef.current = capital_remaining;
                       setPosition("NONE");
                       positionRef.current = "NONE";
                       highestPriceRef.current = 0;
                       setActiveStopLoss(null);
                       
                       setTrades(prev => [...prev, {
                           side: "SELL",
                           quantity: qty,
                           pricePerShare: price,
                           createdAtIST: time,
                           pnl: realizedPnl,
                           isAlgo: true
                       }]);
                   }
               }
               
               if (d.signals) {
                   setSignals(d.signals);
                   if (positionRef.current === "LONG") {
                       // Very rough unrealized pnl for UI
                       setPnl(prev => prev + (currentLtp - prev) * 0.001);
                   }
               }

                if (d.action === "completed") {
                    console.log("Algo trading stream completed. Triggering auto-sell...");
                    setIsCompleted(true);
                }
            }
          }
        } catch (_) {}
      };
    } catch (e) {
      console.error("Live WS error", e);
    }

    return () => {
      isActive = false;
      if (ws) ws.close();
    };
  }, [symbol, HOST]);

  const liveIndicatorSeries = useMemo(() => {
    const mapped = indicatorSeries.map(series => {
      const isThreshold = series.key.toLowerCase().startsWith('threshold');
      if (isThreshold) {
        const threshMatch = series.key.match(/\d+(\.\d+)?/);
        const threshNum = threshMatch ? parseFloat(threshMatch[0]) : null;
        return {
           ...series,
           values: data.map(d => ({ x: d.x, y: threshNum }))
        };
      }
      
      const keyLow = series.key.toLowerCase();
      let newValues: {x: number, y: number}[] = [];
      
      let backendKey = "";
      const periodMatch = keyLow.match(/\d+/);
      const period = periodMatch ? periodMatch[0] : "14";
      
      if (keyLow.includes('sma')) backendKey = `SMA_${period}`;
      else if (keyLow.includes('ema')) backendKey = `EMA_${period}`;
      else if (keyLow.includes('rsi')) backendKey = `RSI_${period}`;
      
      if (backendKey && indicatorData[backendKey]) {
          newValues = indicatorData[backendKey];
      }
      
      return {
        ...series,
        values: newValues
      };
    });
    
    // Force inject any backend indicators that aren't properly mapped
    Object.keys(indicatorData).forEach(bKey => { // e.g., 'EMA_20'
        const parts = bKey.split('_');
        if (parts.length === 2) {
            const name = parts[0].toLowerCase();
            const period = parts[1];
            
            const exists = mapped.some(m => {
                const low = m.key.toLowerCase();
                return low.includes(name) && low.includes(period);
            });
            
            if (!exists) {
                mapped.push({
                    key: bKey,
                    label: bKey.replace('_', ' '),
                    color: name === 'rsi' ? "#8b5cf6" : "#f59e0b",
                    width: 2,
                    values: indicatorData[bKey]
                });
            }
        }
    });

    return mapped;
  }, [data, indicatorData, indicatorSeries]);

  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
  const pendingStopLoss = activeStopLoss != null && position === "LONG"
    ? [{ id: "live-stop-loss", side: "SELL", stop_trigger_price: activeStopLoss }]
    : [];

  const formatDsl = (dslString?: string) => {
      if (!dslString) return "None";
      try {
          const obj = JSON.parse(dslString);
          if (obj.conditions && obj.conditions.length > 0) {
             const c = obj.conditions[0];
             const formatSide = (sideObj: any, fallbackVal: any) => {
                 if (typeof sideObj === 'object' && sideObj !== null) {
                     let n = sideObj.name || sideObj.indicator || '';
                     if (sideObj.period) n += `(${sideObj.period})`;
                     return n || '[Complex]';
                 }
                 if (typeof fallbackVal === 'object' && fallbackVal !== null) {
                     let n = fallbackVal.name || fallbackVal.indicator || '';
                     if (fallbackVal.period) n += `(${fallbackVal.period})`;
                     return n || '[Complex]';
                 }
                 return fallbackVal !== undefined ? String(fallbackVal) : '';
             };
             
             let left = formatSide(c.left, c.indicator);
             
             let op = c.comparison || c.op;
             if (op === '>') op = '>';
             else if (op === '<') op = '<';
             else if (op === '>=') op = '≥';
             else if (op === '<=') op = '≤';
             
             let right = formatSide(c.right, c.value ?? c.right_value);
             
             return `${left} ${op} ${right}`;
          }
          return "Custom Logic";
      } catch(e) {
          return "Custom Logic";
      }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--s-bg)", zIndex: 9999 }}>
      
      {/* ── Portfolio Header ────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px 0", background: "#f9fafb", flexShrink: 0 }}>
        {/* ── Stock-page style header card ── */}
        {(() => {
          const liveTotalCap = cash + (position === "LONG" ? investedQty * ltp : 0);
          const livePnlVal = liveTotalCap - Number(allocatedCapital || 0);
          const livePnlPct = Number(allocatedCapital) ? (livePnlVal / Number(allocatedCapital)) * 100 : 0;
          const ltpChange = ltp - (prevLtp || ltp);
          const isNeg = livePnlVal < 0;
          const formattedSym = symbol.replace(".NS", "").replace(".BO", "");
          const displayName = companyInfo?.name || formattedSym;
          const exchange = companyInfo?.exchange || (symbol.endsWith('.BO') ? 'BSE' : 'NSE');

          const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
            <div className="stat-item">
              <span className="stat-label">{label}</span>
              <span className="stat-value" style={{ color: color || 'var(--stock-text)', fontVariantNumeric: 'tabular-nums', minWidth: '80px', display: 'inline-block' }}>{value}</span>
            </div>
          );

          return (
            <div className="stock-header" style={{ marginBottom: 0, animation: 'none', borderRadius: '12px' }}>
              {/* ── Top Row ── */}
              <div className="stock-header-top">
                <div className="stock-header-title-area">
                  <div style={{ position: 'relative' }}>
                    <StockLogo
                      symbol={symbol}
                      name={companyInfo?.name}
                      className="stock-logo"
                      fallbackToAvatar={true}
                      style={{ width: '3.5rem', height: '3.5rem' }}
                    />
                    {/* Live pulse dot */}
                    <div style={{ position: 'absolute', bottom: -3, right: -3, width: 12, height: 12 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} />
                      <div style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', background: 'rgba(34,197,94,0.25)', animation: 'pulse 2s infinite' }} />
                    </div>
                  </div>
                  <div className="stock-title-info">
                    <div className="stock-name-row">
                      <h1 className="company-name">{displayName}</h1>
                      <button className="bookmark-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></button>
                    </div>
                    <div className="stock-symbol-row">
                      <span className="symbol-text">{formattedSym}</span>
                      <span className="dot-separator">•</span>
                      <span className="exchange-text"><span className="exchange-icon">⬘</span> {exchange}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons — top right */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowLiveLedger(prev => !prev)}
                    className="action-btn"
                    style={{ fontSize: '12px', padding: '8px 14px' }}
                  >
                    {showLiveLedger ? 'Hide Ledger' : `Trade Ledger (${trades.length})`}
                  </button>
                  <button
                    onClick={async () => {
                      if (isStopping) return;
                      setIsStopping(true);
                      const currentPortfolioValue = cashRef.current + (investedQtyRef.current * ltpRef.current);
                      const finalPnl = currentPortfolioValue - Number(allocatedCapital || 0);
                      try {
                        await fetch(`${HOST}/api/algo/session/stop`, {
                          method: 'POST', credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ returnedCapital: currentPortfolioValue, symbol, strategyName, pnl: finalPnl, trades })
                        });
                        window.dispatchEvent(new CustomEvent('wallet-refetch', {}));
                      } catch(e) { console.error(e); }
                      finally { setIsStopping(false); onClose(); }
                    }}
                    disabled={isStopping}
                    style={{ padding: '8px 20px', background: isStopping ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: 700, fontSize: '13px', cursor: isStopping ? 'wait' : 'pointer', transition: 'all 0.2s' }}
                  >
                    {isStopping ? 'Stopping...' : 'Stop Live'}
                  </button>
                </div>
              </div>

              {/* ── Bottom Row ── */}
              <div className="stock-header-bottom">
                {/* Price area */}
                <div className="stock-price-area">
                  <div className="price-row">
                    <span className="price" style={{ fontVariantNumeric: 'tabular-nums', minWidth: '140px' }}>₹{ltp.toFixed(2)}</span>
                    <span className={`change ${isNeg ? 'negative' : 'positive'}`}>
                      {isNeg ? '▼ ' : '▲ '}{Math.abs(livePnlVal).toFixed(2)} ({Math.abs(livePnlPct).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="timestamp-row">
                    <span className="timestamp">{new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })} IST</span>
                    <span className="dot-separator">•</span>
                    <span className="market-state">Live Session Active</span>
                  </div>
                </div>

                {/* Stats area — right side */}
                <div className="stock-stats-area">
                  <StatItem label="Allocated Cap" value={`₹${Number(allocatedCapital || 0).toLocaleString('en-IN')}`} />
                  <StatItem label="Cash" value={`₹${cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} />
                  <StatItem label="Invested" value={invested > 0 ? `₹${invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '₹0'} />
                  <StatItem label="Trades" value={String(Math.floor(trades.length / 2))} />
                  <StatItem label="P&L" value={`${livePnlVal >= 0 ? '+' : ''}₹${Math.abs(livePnlVal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} color={livePnlVal >= 0 ? 'var(--stock-green)' : 'var(--stock-red)'} />
                  <StatItem label="P&L %" value={`${livePnlPct >= 0 ? '+' : ''}${livePnlPct.toFixed(2)}%`} color={livePnlPct >= 0 ? 'var(--stock-green)' : 'var(--stock-red)'} />
                </div>
              </div>

              {/* ── Indicators & Signals bar ── */}
              {(Object.keys(latestIndicators).length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--stock-border)', marginTop: '4px' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(latestIndicators).filter(([key]) =>
                      indicatorSeries.some(series => {
                        const low = series.key.toLowerCase();
                        const p = (low.match(/\d+/) || ['14'])[0];
                        return (low.includes('sma') && key === `SMA_${p}`) ||
                               (low.includes('ema') && key === `EMA_${p}`) ||
                               (low.includes('rsi') && key === `RSI_${p}`);
                      })
                    ).map(([key, val]) => {
                      const match = liveIndicatorSeries.find(s => {
                        const low = s.key.toLowerCase();
                        const p = (low.match(/\d+/) || ['14'])[0];
                        return s.key === key || (low.includes('sma') && key === `SMA_${p}`) || (low.includes('ema') && key === `EMA_${p}`) || (low.includes('rsi') && key === `RSI_${p}`);
                      });
                      const color = (match && match.color) || '#8b5cf6';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${color}15`, border: `1px solid ${color}35`, borderRadius: 6, padding: '2px 8px' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase' }}>{key}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{(val as number).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: signals.BUY ? 'rgba(5,150,105,0.08)' : '#f3f4f6', color: signals.BUY ? 'var(--stock-green)' : '#9ca3af', border: `1px solid ${signals.BUY ? 'rgba(5,150,105,0.25)' : '#e5e7eb'}` }}>
                      <span style={{ background: signals.BUY ? 'var(--stock-green)' : '#d1d5db', color: '#fff', padding: '1px 5px', borderRadius: 4, fontSize: 8 }}>B</span>
                      {formatDsl(buyDsl)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: signals.SELL ? 'rgba(220,38,38,0.08)' : '#f3f4f6', color: signals.SELL ? 'var(--stock-red)' : '#9ca3af', border: `1px solid ${signals.SELL ? 'rgba(220,38,38,0.25)' : '#e5e7eb'}` }}>
                      <span style={{ background: signals.SELL ? 'var(--stock-red)' : '#d1d5db', color: '#fff', padding: '1px 5px', borderRadius: 4, fontSize: 8 }}>S</span>
                      {formatDsl(sellDsl)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>{/* Maximized Graph below */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", padding: "16px" }}>
        {data.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--s-text-muted)", fontSize: 16 }}>Waiting for first tick from Data Feed...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0 }}>
            {/* Chart Area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "12px", border: "1px solid var(--s-border)", background: "var(--s-card)", minWidth: 0 }}>
              {liveIndicatorSeries.length > 0 && (
                <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--s-border)", fontSize: 14, fontWeight: "bold", color: "var(--s-text)" }}>
                  Active Indicators: <span style={{ color: "var(--s-text-muted)", fontWeight: "normal" }}>{liveIndicatorSeries.map(s => s.label).join(', ')}</span>
                </div>
              )}
              <div style={{ flex: 1, position: "relative" }}>
                <AlgoBacktestChart
                  indicatorSeries={liveIndicatorSeries}
                  lineData={data}
                  timeframe="1D"
                  marketState="REGULAR"
                  percent="0"
                  trades={trades}
                  pendingSL={pendingStopLoss}
                  activeTrade={null}
                  onReplayProgress={() => {}}
                />
              </div>
            </div>

            {/* Trades Side */}
            <div className={`studio-trades-side ${showLiveLedger ? 'open' : 'collapsed'}`}>
              <div className="studio-trades-section">
                <div className="studio-trades-title">Live Trade Ledger <span style={{ color: "var(--s-text-muted)", fontSize: 11 }}>({trades.length} executions)</span></div>
                {trades.length === 0 ? (
                  <div style={{ color: "var(--s-text-muted)", fontSize: 12, padding: "10px 0", marginTop: "16px" }}>Waiting for the first live execution...</div>
                ) : (
                  <div className="studio-trade-timeline">
                    {trades.map((t: any, index: number) => (
                      <div key={`${t.createdAtIST}-${index}`} className="studio-timeline-item">
                        <div className={`studio-timeline-node ${(t.side || "").toLowerCase()}`} />
                        <div className="studio-timeline-content">
                          <div className="studio-tl-header"><span className={`studio-tl-badge ${(t.side || "").toLowerCase()}`}>{t.side}</span><span className="studio-tl-date">{new Date(t.createdAtIST).toLocaleString()}</span></div>
                          <div className="studio-tl-body"><div className="studio-tl-stat"><span className="studio-tl-lbl">Price</span><span className="studio-tl-val">INR {Number(t.pricePerShare).toFixed(2)}</span></div><div className="studio-tl-stat"><span className="studio-tl-lbl">Shares</span><span className="studio-tl-val">{t.quantity}</span></div>{t.pnl != null && <div className="studio-tl-stat"><span className="studio-tl-lbl">P&amp;L</span><span className={`studio-tl-val ${t.pnl >= 0 ? "green" : "red"}`}>{t.pnl >= 0 ? "+" : ""}INR {Number(t.pnl).toFixed(2)}</span></div>}</div>
                          {t.reason && <div className="studio-tl-reason">{t.reason}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function PaperBullStudio() {
  const navigate = useNavigate();

  const [tickers, setTickers] = useState<string[]>(['^BSESN', '^NSEI']);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
  const [startDate, setStartDate] = useState('2023-01-01');
  const [startTime, setStartTime] = useState('09:15');
  const [endDate, setEndDate] = useState('2024-01-01');
  const [endTime, setEndTime] = useState('15:30');
  const [timeframe, setTimeframe] = useState('1D');
  const [capital, setCapital] = useState(100000);
  const [stopLossPct, setStopLossPct] = useState(5.0);
  const [stopLossType, setStopLossType] = useState('fixed');
  const [datePreset, setDatePreset] = useState('1Y');
  const [capitalPreset, setCapitalPreset] = useState('1L');
  const [stockCategory, setStockCategory] = useState('Popular');
  const [loadBenchmarkIndex, setLoadBenchmarkIndex] = useState(true);
  const [dslTab, setDslTab] = useState('visual');
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>('');
  const [replayPnl, setReplayPnl] = useState<number | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<any>(null);
  const [savedStrategies, setSavedStrategies] = useState<any[]>([]);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const [strategyName, setStrategyName] = useState('My Custom Strategy');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{message: string, type: 'success' | 'error' | ''}>({message: '', type: ''});
  const [activeTab, setActiveTab] = useState<'setup' | 'strategy' | 'results'>('setup');
  const [lightMode, setLightMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showTradeLedger, setShowTradeLedger] = useState(false);
  const [liveDeployModes, setLiveDeployModes] = useState<Record<string, boolean>>({});
  
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [algoCapital, setAlgoCapital] = useState<string>('50000');
  const [userBalance, setUserBalance] = useState<number>(0);
  // "simulate" = paper trading sim (ws://localhost:8765)
  // "upstox"   = live Upstox feed  (ws://localhost:4141)
  const [dataMode, setDataMode] = useState<'simulate' | 'upstox'>('simulate');

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch(`${HOST}/api/getBalance/getBalance`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUserBalance(data.cash || 0);
        }
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    };
    fetchBalance();
  }, [HOST]);

  useEffect(() => {
    const refetchBalance = async () => {
      try {
        const res = await fetch(`${HOST}/api/getBalance/getBalance`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUserBalance(data.cash || 0);
        }
      } catch (e) { console.error('Failed to refetch balance', e); }
    };
    window.addEventListener('wallet-refetch', refetchBalance);
    return () => window.removeEventListener('wallet-refetch', refetchBalance);
  }, [HOST]);

  useEffect(() => {
    document.body.classList.add('studio-active');
    if (!lightMode) {
      document.body.classList.add('studio-dark');
    } else {
      document.body.classList.remove('studio-dark');
    }
    return () => {
      document.body.classList.remove('studio-active');
      document.body.classList.remove('studio-dark');
    };
  }, [lightMode]);

  const handleDatePresetChange = (p: string) => {
    setDatePreset(p);
    if (p === 'Custom') return;
    const end = new Date();
    const start = new Date();
    if (p === '1M') start.setMonth(end.getMonth() - 1);
    else if (p === '3M') start.setMonth(end.getMonth() - 3);
    else if (p === '6M') start.setMonth(end.getMonth() - 6);
    else if (p === '1Y') start.setFullYear(end.getFullYear() - 1);
    else if (p === '3Y') start.setFullYear(end.getFullYear() - 3);
    
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  const getCategoryTickers = (cat: string) => {
    switch(cat) {
      case 'Indices':
        return [
          { symbol: '^NSEI', label: 'NIFTY 50' },
          { symbol: '^NSEBANK', label: 'BANKNIFTY' },
          { symbol: '^CNXIT', label: 'NIFTY IT' },
          { symbol: '^BSESN', label: 'SENSEX' }
        ];
      case 'Large Cap':
        return [
          { symbol: 'RELIANCE.NS', label: 'RELIANCE' },
          { symbol: 'TCS.NS', label: 'TCS' },
          { symbol: 'INFY.NS', label: 'INFY' },
          { symbol: 'HDFCBANK.NS', label: 'HDFC' },
          { symbol: 'ICICIBANK.NS', label: 'ICICIBANK' },
          { symbol: 'TATAMOTORS.NS', label: 'TATAMOTORS' }
        ];
      case 'Mid Cap':
        return [
          { symbol: 'PERSISTENT.NS', label: 'PERSISTENT' },
          { symbol: 'COFORGE.NS', label: 'COFORGE' },
          { symbol: 'MPHASIS.NS', label: 'MPHASIS' },
          { symbol: 'KPITTECH.NS', label: 'KPITTECH' },
          { symbol: 'TRENT.NS', label: 'TRENT' }
        ];
      case 'Small Cap':
        return [
          { symbol: 'SUZLON.NS', label: 'SUZLON' },
          { symbol: 'POKARNA.NS', label: 'POKARNA' },
          { symbol: 'CYIENT.NS', label: 'CYIENT' }
        ];
      case 'Sector ETFs':
        return [
          { symbol: 'NIFTYBEES.NS', label: 'NIFTYBEES' },
          { symbol: 'BANKBEES.NS', label: 'BANKBEES' },
          { symbol: 'GOLDBEES.NS', label: 'GOLDBEES' },
          { symbol: 'ITBEES.NS', label: 'ITBEES' }
        ];
      default: // Popular
        return [
          { symbol: '^NSEI', label: 'NIFTY 50' },
          { symbol: '^NSEBANK', label: 'BANKNIFTY' },
          { symbol: 'RELIANCE.NS', label: 'RELIANCE' },
          { symbol: 'TCS.NS', label: 'TCS' },
          { symbol: 'INFY.NS', label: 'INFY' },
          { symbol: 'HDFCBANK.NS', label: 'HDFC' }
        ];
    }
  };
  const [loadedStrategyId, setLoadedStrategyId] = useState<string | null>(null);
  const [saveAsMode, setSaveAsMode] = useState<boolean>(false);
  const [buyDsl, setBuyDsl] = useState(`{
  "operator": "AND",
  "conditions": [
    {
      "indicator": "EMA",
      "params": { "period": 20 },
      "comparison": ">",
      "value": {
        "indicator": "EMA",
        "params": { "period": 50 }
      }
    },
    {
      "indicator": "RSI",
      "params": { "period": 14 },
      "comparison": ">",
      "value": 40
    }
  ]
}`);
  const [sellDsl, setSellDsl] = useState(`{
  "operator": "OR",
  "conditions": [
    {
      "indicator": "EMA",
      "params": { "period": 20 },
      "comparison": "<",
      "value": {
        "indicator": "EMA",
        "params": { "period": 50 }
      }
    },
    {
      "indicator": "RSI",
      "params": { "period": 14 },
      "comparison": ">",
      "value": 75
    }
  ]
}`);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (results?.stock_reports) {
      const activeReport = results.stock_reports.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports[0];
      if (activeReport?.trade_log?.length > 0) {
        const firstTrade = activeReport.trade_log[0];
        setHoveredTrade({
          x: new Date(firstTrade.date).getTime(),
          y: firstTrade.price,
          side: firstTrade.type === 'BUY' ? 'BUY' : 'SELL',
          quantity: firstTrade.shares || 1,
          pnl: firstTrade.pnl,
          reason: firstTrade.reason,
          originalIndex: 0
        });
      } else {
        setHoveredTrade(null);
      }
    }
  }, [results, selectedChartTicker]);

  // Auto-navigate to results tab when results arrive
  useEffect(() => {
    if (results) setActiveTab('results');
  }, [results]);


  const loadTemplate = (name: string) => {
    let b = "";
    let s = "";
    if (name === "RSI_EMA") {
      b = `{\n  "operator": "AND",\n  "conditions": [\n    {\n      "indicator": "RSI",\n      "params": { "period": 14 },\n      "comparison": "<",\n      "value": 30\n    },\n    {\n      "indicator": "EMA",\n      "params": { "period": 20 },\n      "comparison": ">",\n      "value": { "indicator": "EMA", "params": { "period": 50 } }\n    }\n  ]\n}`;
      s = `{\n  "operator": "OR",\n  "conditions": [\n    {\n      "indicator": "RSI",\n      "params": { "period": 14 },\n      "comparison": ">",\n      "value": 70\n    }\n  ]\n}`;
    } else if (name === "MACD_CROSS") {
      b = `{\n  "operator": "AND",\n  "conditions": [\n    {\n      "indicator": "MACD",\n      "params": { "fast": 12, "slow": 26, "signal": 9, "column": "macd" },\n      "comparison": ">",\n      "value": { "indicator": "MACD", "params": { "fast": 12, "slow": 26, "signal": 9, "column": "macd_signal" } }\n    }\n  ]\n}`;
      s = `{\n  "operator": "AND",\n  "conditions": [\n    {\n      "indicator": "MACD",\n      "params": { "fast": 12, "slow": 26, "signal": 9, "column": "macd" },\n      "comparison": "<",\n      "value": { "indicator": "MACD", "params": { "fast": 12, "slow": 26, "signal": 9, "column": "macd_signal" } }\n    }\n  ]\n}`;
    } else if (name === "BOLLINGER") {
      b = `{\n  "operator": "AND",\n  "conditions": [\n    {\n      "indicator": "Close",\n      "params": {},\n      "comparison": "<",\n      "value": { "indicator": "BOLLINGER", "params": { "period": 20, "std_dev": 2.0, "column": "lower" } }\n    }\n  ]\n}`;
      s = `{\n  "operator": "AND",\n  "conditions": [\n    {\n      "indicator": "Close",\n      "params": {},\n      "comparison": ">",\n      "value": { "indicator": "BOLLINGER", "params": { "period": 20, "std_dev": 2.0, "column": "upper" } }\n    }\n  ]\n}`;
    }
    setBuyDsl(b);
    setSellDsl(s);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText("// BUY LOGIC\n" + buyDsl + "\n\n// SELL LOGIC\n" + sellDsl);
    alert("Strategy JSON copied to clipboard!");
  };

  const handleBuyDslChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBuyDsl(e.target.value);
  };
  const handleSellDslChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSellDsl(e.target.value);
  };



  useEffect(() => {
    fetch(`${HOST}/api/paperbull/strategies`, {credentials: 'include'})
      .then(res => res.json())
      .then(data => {
          if (Array.isArray(data)) setSavedStrategies(data);
      })
      .catch(console.error);
  }, [HOST]);

  const handleSaveStrategyPrompt = (asNew: boolean = false) => {
    setSaveStatus({message: '', type: ''});
    if (!asNew && loadedStrategyId) {
      // Direct save
      executeSaveStrategy(strategyName, false);
    } else {
      setSaveAsMode(asNew);
      setShowSaveModal(true);
    }
  };

  const executeSaveStrategy = async (nameToSave: string, asNew: boolean) => {
    if (!nameToSave.trim()) {
      setSaveStatus({message: 'Please enter a strategy name.', type: 'error'});
      return;
    }
    
    // Check if duplicate name (only when creating new)
    if (asNew && savedStrategies.some(s => s.name.toLowerCase() === nameToSave.trim().toLowerCase())) {
        setSaveStatus({message: 'A strategy with this name already exists. Please choose another name.', type: 'error'});
        return;
    }
    
    setIsSavingStrategy(true);
    setSaveStatus({message: '', type: ''});
    try {
      const payload = {
        name: nameToSave.trim(),
        buyDsl,
        sellDsl,
        startDate,
        startTime,
        endDate,
        endTime,
        timeframe,
        capital,
        tickers,
        stopLossPct,
        stopLossType
      };
      
      const isUpdate = !asNew && loadedStrategyId;
      const endpoint = isUpdate 
        ? `${HOST}/api/paperbull/strategy/${loadedStrategyId}`
        : `${HOST}/api/paperbull/strategy`;
        
      const res = await fetch(endpoint, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({message: isUpdate ? 'Strategy updated successfully!' : 'Strategy saved successfully!', type: 'success'});
        if (!isUpdate && data.id) {
            setLoadedStrategyId(data.id);
            setStrategyName(nameToSave.trim());
        }
        const stratsRes = await fetch(`${HOST}/api/paperbull/strategies`, {credentials: 'include'});
        const stratsData = await stratsRes.json();
        if (Array.isArray(stratsData)) setSavedStrategies(stratsData);
        setTimeout(() => {
            setShowSaveModal(false);
            if (isUpdate) setSaveStatus({message: '', type: ''});
        }, 1500);
      } else {
        setSaveStatus({message: 'Failed to save strategy: ' + data.message, type: 'error'});
      }
    } catch (err) {
      console.error(err);
      setSaveStatus({message: 'Failed to save strategy', type: 'error'});
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const loadSavedStrategy = (strat: any) => {
    setLoadedStrategyId(strat._id || null);
    setStrategyName(strat.name || 'Loaded Strategy');
    if (strat.buyDsl) { setBuyDsl(strat.buyDsl); }
    if (strat.sellDsl) { setSellDsl(strat.sellDsl); }
    if (strat.startDate) setStartDate(strat.startDate);
    if (strat.startTime) setStartTime(strat.startTime);
    if (strat.endDate) setEndDate(strat.endDate);
    if (strat.endTime) setEndTime(strat.endTime);
    if (strat.timeframe) setTimeframe(strat.timeframe);
    if (strat.capital) setCapital(strat.capital);
    if (strat.tickers) setTickers(strat.tickers);
  };

  useEffect(() => {
    const q = searchInput.trim();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${HOST}/api/search/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          setSuggestions(data.results.slice(0, 6));
        } else if (Array.isArray(data)) {
          setSuggestions(data.slice(0, 6));
        } else {
          setSuggestions([]);
        }
        setShowSuggestions(true);
      } catch (err) {
        console.error(err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, HOST]);

  const handleToggleTicker = (sym: string) => {
    let cleanSym = sym.trim().toUpperCase();
    const indexAliases: Record<string, string> = {
      "NIFTY 50": "^NSEI",
      "NIFTY": "^NSEI",
      "SENSEX": "^BSESN",
      "BANK NIFTY": "^NSEBANK",
      "BANKNIFTY": "^NSEBANK",
      "NIFTY IT": "^CNXIT",
      "FINNIFTY": "^CNXFIN"
    };
    if (indexAliases[cleanSym]) {
      cleanSym = indexAliases[cleanSym];
    } else if (!cleanSym.endsWith('.NS') && !cleanSym.endsWith('.BO') && !cleanSym.startsWith('^')) {
      cleanSym = `${cleanSym}.NS`;
    }

    if (tickers.includes(cleanSym)) {
      setTickers(prev => prev.filter(t => t !== cleanSym));
    } else {
      setTickers(prev => [...prev, cleanSym]);
    }
  };

  const handleSelectSuggestion = (sym: string) => {
    handleToggleTicker(sym);
    setSearchInput('');
    setShowSuggestions(false);
  };

  const INDICES: Record<string, string> = {
    "NIFTY 50": "^NSEI",
    "BANK NIFTY": "^NSEBANK",
    "NIFTY IT": "^CNXIT",
    "SENSEX": "^BSESN"
  };

  const handleLoadIndex = (indexName: string) => {
    const indexSymbol = INDICES[indexName];
    if (indexSymbol) {
      if (tickers.includes(indexSymbol)) {
        setTickers(prev => prev.filter(t => t !== indexSymbol));
      } else {
        setTickers(prev => [...prev, indexSymbol]);
      }
    }
  };

  const handleAddTicker = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      handleToggleTicker(searchInput.trim());
      setSearchInput('');
    }
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    setTickers(tickers.filter(t => t !== tickerToRemove));
  };



  const handleRunOnChart = async () => {
    setIsRunning(true);
    try {
      let parsedBuy = {};
      let parsedSell = {};
      try {
        parsedBuy = JSON.parse(buyDsl);
        parsedSell = JSON.parse(sellDsl);
      } catch (err) {
        alert("Invalid JSON in DSL editor!");
        setIsRunning(false);
        return;
      }

      const payload = {
        ticker: tickers.join(','),
        start_date: startDate,
        end_date: endDate,
        buy_strategy: parsedBuy,
        sell_strategy: parsedSell,
        initial_capital: Number(capital),
        stop_loss_pct: stopLossPct / 100.0,
        stop_loss_type: stopLossType,
        timeframe: timeframe
      };

      const res = await fetch('http://localhost:8000/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setResults(data);
      if (data && data.stock_reports && data.stock_reports.length > 0) {
        setSelectedChartTicker(data.stock_reports[0].ticker);
      }
    } catch (error) {
      console.error("Failed to run evaluation:", error);
    } finally {
      setIsRunning(false);
    }
  };


  const renderConfigCards = () => (
    <div className="tailwind-scope w-full">
      <style>
        {`
          :where(.tailwind-scope *), :where(.tailwind-scope ::before), :where(.tailwind-scope ::after) {
            box-sizing: border-box;
            border-style: solid;
            border-width: 0;
          }
          :where(.tailwind-scope button) {
            background-color: transparent;
            background-image: none;
            padding: 0;
            line-height: inherit;
            color: inherit;
            cursor: pointer;
          }
        `}
      </style>
    <main className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2 w-full">
      {/* CARD 1: Backtest Parameters */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4 w-full">
        
        {/* Card Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
              <i className="fa-solid fa-chart-simple text-sm"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">1. Backtest Parameters</h2>
              <p className="text-xs text-slate-500">Configure dates, capital, and benchmark index</p>
            </div>
          </div>
          <div className="relative group z-50">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-semibold hover:bg-slate-50 transition-colors">
              <i className="fa-solid fa-layer-group text-slate-400"></i> Load Preset <i className="fa-solid fa-chevron-down text-[8px] text-slate-400"></i>
            </button>
            <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all py-2">
              <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Quick Templates</div>
              <button onClick={() => loadTemplate('RSI_EMA')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">ðŸ“ˆ RSI + EMA</button>
              <button onClick={() => loadTemplate('MACD_CROSS')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">ðŸ“Š MACD Crossover</button>
              <button onClick={() => loadTemplate('BOLLINGER')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">ðŸŒŠ Bollinger Bands</button>
              
              {savedStrategies.length > 0 && (
                <>
                  <div className="border-t border-slate-100 my-2"></div>
                  <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Your Saved Strategies</div>
                  {savedStrategies.map(strat => (
                    <button key={strat._id} onClick={() => loadSavedStrategy(strat)} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors flex justify-between items-center">
                      <span className="truncate max-w-[140px]">{strat.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Date & Time Schedule */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-800">
              <i className="fa-regular fa-calendar text-slate-400"></i> Date & Time Schedule
              <i className="fa-solid fa-circle-info text-slate-300 text-[10px]"></i>
            </h3>
            <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
              {['1M', '3M', '6M', '1Y', '3Y', 'Custom'].map(p => (
                <span key={p} className={datePreset === p ? "bg-brand-600 text-white rounded-md px-2 py-0.5 shadow-sm cursor-pointer" : "hover:text-slate-900 cursor-pointer px-1"} onClick={() => handleDatePresetChange(p)}>{p}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
            {/* Start */}
            <div className="flex-1 w-full">
              <label className="text-[9px] font-bold text-brand-600 uppercase tracking-wider mb-1 block">Start <span className="text-slate-400 font-normal">Date & Time</span></label>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs font-semibold w-full focus:outline-none bg-transparent" />
                </div>
                <div className="flex-1 flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-xs font-semibold w-full focus:outline-none bg-transparent" />
                </div>
              </div>
            </div>

            <div className="hidden sm:block text-slate-300 mt-2"><i className="fa-solid fa-arrow-right text-xs"></i></div>

            {/* End */}
            <div className="flex-1 w-full">
              <label className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1 block">End <span className="text-slate-400 font-normal">Date & Time</span></label>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs font-semibold w-full focus:outline-none bg-transparent" />
                </div>
                <div className="flex-1 flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-xs font-semibold text-slate-400 w-full focus:outline-none bg-transparent" />
                </div>
              </div>
            </div>
          </div>

          {/* Bar Resolution */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">Bar Resolution:</span>
            <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
              {['1m', '5m', '15m', '1h', '1D', '1W'].map(tf => (
                <span key={tf} className={timeframe === tf ? "bg-brand-600 text-white rounded-md px-3 py-1 shadow-sm cursor-pointer" : "hover:text-slate-900 cursor-pointer px-2"} onClick={() => setTimeframe(tf)}>{tf}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Initial Capital */}
        <div className="space-y-1 pt-1">
          <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-800">
            <i className="fa-solid fa-wallet text-slate-400"></i> Initial Capital
            <i className="fa-solid fa-circle-info text-slate-300 text-[10px]"></i>
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-1/2">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 font-semibold text-sm">â‚¹</span>
              <input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))} className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-500">
              {[
                { label: '10K', val: 10000 },
                { label: '50K', val: 50000 },
                { label: '1L', val: 100000 },
                { label: '5L', val: 500000 },
                { label: '10L', val: 1000000 }
              ].map(cp => (
                <span key={cp.label} className={capitalPreset === cp.label ? "bg-brand-600 text-white px-2 py-1 rounded-md shadow-sm cursor-pointer transition" : "hover:bg-slate-100 px-2 py-1 rounded-md border border-transparent cursor-pointer transition"} onClick={() => { setCapital(cp.val); setCapitalPreset(cp.label); }}>{cp.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Load Index */}
        <div className="space-y-2 pt-1 border-t border-slate-100 mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-800">
              <i className="fa-solid fa-chart-line text-slate-400"></i> Load Index <span className="text-slate-400 font-normal text-[10px]">(Optional)</span>
            </h3>
            <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600 cursor-pointer">
              <input type="checkbox" checked={loadBenchmarkIndex} onChange={(e) => setLoadBenchmarkIndex(e.target.checked)} className="w-3 h-3 text-brand-600 rounded border-slate-300 focus:ring-brand-500 accent-brand-600" />
              Benchmark
            </label>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { name: 'NIFTY 50', symbol: '^NSEI', sub: 'NSE' },
              { name: 'BANK NIFTY', symbol: '^NSEBANK', sub: 'NSE' },
              { name: 'NIFTY IT', symbol: '^CNXIT', sub: 'NSE' },
              { name: 'SENSEX', symbol: '^BSESN', sub: 'BSE' }
            ].map(idx => {
              const isSelected = tickers.includes(idx.symbol);
              return (
                <button key={idx.symbol} onClick={() => handleLoadIndex(idx.name)} className={`flex flex-col items-start p-3 border rounded-xl transition-colors relative shadow-sm ${isSelected ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  {isSelected && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand-600 text-white rounded-full flex items-center justify-center text-[8px] border border-white">
                      <i className="fa-solid fa-check"></i>
                    </div>
                  )}
                  <div className="flex items-center gap-2 w-full">
                    <StockLogo symbol={idx.symbol} fallbackToAvatar style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    <div className="text-left">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[80px]">{idx.name}</p>
                      <p className="text-[10px] text-slate-400">{idx.sub}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* CARD 2: Stock Selection */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-4 w-full h-full">
        
        {/* Card Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
              <i className="fa-solid fa-magnifying-glass text-sm"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">2. Stock Selection</h2>
              <p className="text-xs text-slate-500">Search or pick assets to backtest against strategy</p>
            </div>
          </div>
          <button onClick={() => setTickers([])} className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded transition-colors">
            <i className="fa-solid fa-trash-can text-[10px]"></i> Clear All
          </button>
        </div>

        {/* Search Area Wrapper */}
        <div className="flex flex-col gap-3 flex-1">
          
          {/* Search Input */}
          <div className="relative w-full">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400"></i>
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleAddTicker} placeholder="Search stocks, indices, or ETFs..." className="w-full pl-10 pr-24 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors placeholder-slate-400" />
            <button onClick={() => handleToggleTicker(searchInput)} className="absolute right-1 top-1 bottom-1 px-4 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition flex items-center gap-1.5">
              Search <i className="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-48 overflow-y-auto">
                {suggestions.map((s: any, idx: number) => (
                  <div key={idx} onClick={() => handleSelectSuggestion(s.symbol || s.ticker)} className="px-3 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <StockLogo symbol={s.symbol || s.ticker} fallbackToAvatar style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                      <span className="font-semibold text-slate-800 text-sm">{s.symbol || s.ticker}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[150px] text-right">{s.name || s.shortname}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
            {['Popular', 'Indices', 'Large Cap', 'Mid Cap', 'Small Cap', 'Sector ETFs'].map(cat => (
              <button key={cat} onClick={() => setStockCategory(cat)} className={`px-3 py-1 font-semibold text-[10px] rounded-md whitespace-nowrap ${stockCategory === cat ? 'bg-brand-50 text-brand-600' : 'text-slate-500 font-medium hover:bg-slate-50'}`}>{cat}</button>
            ))}
          </div>

          {/* Quick Picks */}
          <div className="flex flex-wrap gap-1.5">
            {getCategoryTickers(stockCategory).map(item => {
              const isSelected = tickers.includes(item.symbol);
              return (
                <button key={item.symbol} onClick={() => handleToggleTicker(item.symbol)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isSelected ? 'bg-brand-50 text-brand-600 border border-brand-200 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}>
                  <StockLogo symbol={item.symbol} fallbackToAvatar style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
                  {item.label}
                  {isSelected && <i className="fa-solid fa-check text-[10px] ml-1"></i>}
                </button>
              );
            })}
          </div>

          {/* Selected Box */}
          <div className="mt-2 border border-slate-200 bg-slate-50/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500">Selected ({tickers.length})</span>
              <button className="text-xs font-semibold text-brand-600 flex items-center gap-1 hover:text-brand-700">
                <i className="fa-solid fa-bolt text-[10px]"></i> Add from Watchlist
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tickers.map(t => (
                <div key={t} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm pr-2">
                  <StockLogo symbol={t} fallbackToAvatar style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
                  <span className="text-xs font-bold text-slate-800">{t.replace('^', '')}</span>
                  <button onClick={() => handleRemoveTicker(t)} className="ml-1 w-4 h-4 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Action Button */}
        <div className="mt-auto pt-6">
          <button onClick={() => setShowBuilderModal(true)} className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-brand-600 to-blue-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <i className="fa-solid fa-gear"></i>
              <span className="font-bold tracking-wide">Configure Strategy</span>
            </div>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-arrow-right text-xs"></i>
            </div>
          </button>
        </div>
      </section>

    </main>
    </div>
  );


  return (
    <div className="studio-layout">

      {/* === SIDEBAR === */}
      <aside className={`studio-sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
        <div className="studio-brand" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          <div>
            <div className="studio-brand-name">ALGO TRADING</div>
            <div className="studio-brand-sub">Backtest with confidence.</div>
          </div>
        </div>

        <button className="studio-new-btn" onClick={() => { setResults(null); setActiveTab('setup'); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          <span className="btn-text">New backtest</span>
        </button>

        <div className="studio-saved-section">
          <div className="studio-saved-label">SAVED SETUPS</div>
          {savedStrategies.map(strat => (
            <button key={strat._id} className={`studio-saved-item ${strategyName === strat.name ? 'active' : ''}`}
              onClick={() => { loadSavedStrategy(strat); setActiveTab('setup'); }}>
              {strat.name}
            </button>
          ))}
          {savedStrategies.length === 0 && (
            <div style={{ fontSize: '10px', color: 'var(--s-text-faint)', padding: '6px 8px' }}>No saved setups yet</div>
          )}
        </div>
      </aside>

      {/* === MAIN === */}
      <div className="studio-main">

        {/* Tab Bar */}
        <div className="studio-tab-bar">
          <div className="studio-tabs">
            <button className={`studio-tab-btn ${activeTab === 'setup' ? 'active' : ''}`} onClick={() => setActiveTab('setup')}>Setup</button>
            <button className={`studio-tab-btn ${activeTab === 'strategy' ? 'active' : ''}`} onClick={() => setActiveTab('strategy')}>Strategy</button>
            <button className={`studio-tab-btn ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>Results</button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {activeTab === 'results' && results && (
              <button className="pb-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setActiveTab('setup')}>&lt;- Edit Setup</button>
            )}
            {activeTab === 'strategy' && (
              <>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginRight: '8px' }}>
                  <button className="studio-save-btn" onClick={() => handleSaveStrategyPrompt(false)} disabled={isSavingStrategy} style={{ padding: '6px 10px', fontSize: '11px' }}>
                    <i className={`fa-solid ${isSavingStrategy && !saveAsMode ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i> {isSavingStrategy && !saveAsMode ? 'Saving...' : 'Save'}
                  </button>
                  <button className="studio-save-btn" onClick={() => handleSaveStrategyPrompt(true)} disabled={isSavingStrategy} style={{ padding: '6px 10px', fontSize: '11px' }}>
                    <i className={`fa-solid ${isSavingStrategy && saveAsMode ? 'fa-spinner fa-spin' : 'fa-copy'}`}></i> {isSavingStrategy && saveAsMode ? 'Saving...' : 'Save As New'}
                  </button>
                  {!showSaveModal && saveStatus.message && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: saveStatus.type === 'success' ? '#10b981' : '#ef4444' }}>
                      {saveStatus.message}
                    </span>
                  )}
                </div>
                <button className="studio-cta-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleRunOnChart} disabled={isRunning}>
                  {isRunning ? 'Running...' : 'Run backtest ->'}
                </button>
              </>
            )}
            {activeTab === 'setup' && (
              <button className="studio-cta-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setActiveTab('strategy')}>Configure strategy -&gt;</button>
            )}
          </div>
        </div>

        {/* Scrollable page */}
        <div className="studio-page">

          {/* Right contextual panel */}
          <div className="studio-right-panel">
            {activeTab === 'setup' && (<>
              <button className="studio-right-action" onClick={() => savedStrategies[0] && loadSavedStrategy(savedStrategies[0])}><span className="studio-right-action-icon">&lt;-</span>Use last setup</button>
              <button className="studio-right-action" onClick={() => { handleDatePresetChange('1Y'); setTickers(['^NSEI']); }}><span className="studio-right-action-icon">#</span>1Y NIFTY 50 default</button>
              <button className="studio-right-action" onClick={() => setIsSearchOverlayOpen(true)}><span className="studio-right-action-icon">@</span>Custom range &amp; capital</button>
              <button className="studio-right-action" onClick={() => setShowConfigModal(true)}><span className="studio-right-action-icon">+</span>Import saved strategy</button>
            </>)}
            {activeTab === 'strategy' && (<>
              <button className="studio-right-action" onClick={() => loadTemplate('RSI_EMA')}><span className="studio-right-action-icon">^</span>RSI + EMA template</button>
              <button className="studio-right-action" onClick={() => loadTemplate('MACD_CROSS')}><span className="studio-right-action-icon">#</span>MACD crossover</button>
              <button className="studio-right-action" onClick={() => loadTemplate('BOLLINGER')}><span className="studio-right-action-icon">*</span>Bollinger bands</button>
              {savedStrategies[0] && <button className="studio-right-action" onClick={() => loadSavedStrategy(savedStrategies[0])}><span className="studio-right-action-icon">+</span>Saved: {savedStrategies[0].name}</button>}
            </>)}

          </div>

          {/* == SETUP TAB == */}
          {activeTab === 'setup' && (<>
            <div className="studio-hero">
              <div className="studio-hero-eyebrow">New Backtest</div>
              <h1 className="studio-hero-title">Configure a <span>backtest</span> in seconds.</h1>
              <p className="studio-hero-sub">Pick a window, capital, benchmark and the assets you want to test.</p>
            </div>

            <div className="studio-form-card">
              <div className="studio-form-2col">
                <div className="studio-form-group">
                  <div className="studio-form-label">Range</div>
                  <div className="studio-pill-row">
                    {['1M','3M','6M','1Y','3Y','Custom'].map(p => (
                      <button key={p} className={`studio-pill ${datePreset === p ? 'active' : ''}`} onClick={() => handleDatePresetChange(p)}>{p}</button>
                    ))}
                  </div>
                </div>
                <div className="studio-form-group">
                  <div className="studio-form-label">Bar resolution</div>
                  <div className="studio-pill-row">
                    {['1m','5m','15m','1h','1D','1W'].map(tf => (
                      <button key={tf} className={`studio-pill ${timeframe === tf ? 'active' : ''}`} onClick={() => setTimeframe(tf)}>{tf}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="studio-form-3col">
                <div className="studio-form-group">
                  <div className="studio-form-label">Start</div>
                  <div className="studio-date-box">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <span className="studio-date-dot">.</span>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: '86px' }} />
                  </div>
                </div>
                <div className="studio-date-arrow">-&gt;</div>
                <div className="studio-form-group">
                  <div className="studio-form-label">End</div>
                  <div className="studio-date-box">
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <span className="studio-date-dot">.</span>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: '86px' }} />
                  </div>
                </div>
                <div className="studio-form-group">
                  <div className="studio-form-label">Initial capital</div>
                  <div className="studio-capital-box">
                    <span className="studio-capital-sym">INR</span>
                    <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))} />
                  </div>
                </div>
              </div>

              {/* Benchmark & Assets */}
              <div>
                <div className="studio-assets-header">
                  <span className="studio-assets-title">Benchmark &amp; assets</span>
                </div>
                <div className="studio-search-wrap">
                  <i className="fa-solid fa-magnifying-glass studio-search-icon"></i>
                  <input type="text" placeholder="Search stocks, indices, or ETFs..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleAddTicker} />
                  <button className="studio-search-btn" onClick={() => handleToggleTicker(searchInput)}>Search</button>
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="studio-search-suggestions">
                      {suggestions.map((s: any, idx: number) => (
                        <div key={idx} className="studio-search-suggestion-item" onClick={() => handleSelectSuggestion(s.symbol || s.ticker)}>
                          <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                            <StockLogo symbol={s.symbol || s.ticker} fallbackToAvatar style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0 }} />
                            <span style={{fontSize:'12px', fontWeight:600, color:'var(--s-text)'}}>{s.symbol || s.ticker}</span>
                          </div>
                          <span style={{fontSize:'10px', color:'var(--s-text-muted)', textAlign:'right', maxWidth:'150px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{s.name || s.shortname}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="studio-index-grid">
                  {[
                    { name: 'NIFTY 50', symbol: '^NSEI', sub: 'NSE' },
                    { name: 'BANK NIFTY', symbol: '^NSEBANK', sub: 'NSE' },
                    { name: 'NIFTY IT', symbol: '^CNXIT', sub: 'NSE' },
                    { name: 'SENSEX', symbol: '^BSESN', sub: 'BSE' }
                  ].map(idx => {
                    const isSel = tickers.includes(idx.symbol);
                    return (
                      <button key={idx.symbol} className={`studio-index-card ${isSel ? 'active' : ''}`} onClick={() => handleLoadIndex(idx.name)}>
                        {isSel && <div className="studio-index-card-dot" />}
                        <StockLogo symbol={idx.symbol} fallbackToAvatar style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0 }} />
                        <div>
                          <div className="studio-index-name">{idx.name}</div>
                          <div className="studio-index-sub">{idx.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="studio-quick-picks">
                  {getCategoryTickers('Popular').map(item => {
                    const isSel = tickers.includes(item.symbol);
                    return (
                      <button key={item.symbol} className={`studio-quick-pick ${isSel ? 'active' : ''}`} onClick={() => handleToggleTicker(item.symbol)}>
                        {item.label}{isSel ? ' [x]' : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="studio-selected-row">
                  <div className="studio-selected-count">Selected ({tickers.length})</div>
                  <div className="studio-chips-wrap">
                    {tickers.map(t => (
                      <div key={t} className="studio-chip">
                        <StockLogo symbol={t} fallbackToAvatar style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                        {t.replace('^','').replace('.NS','').replace('.BO','')}
                        <button className="studio-chip-close" onClick={() => handleRemoveTicker(t)}>x</button>
                      </div>
                    ))}
                    {tickers.length === 0 && <span style={{ fontSize: '11px', color: 'var(--s-text-faint)' }}>No assets selected yet</span>}
                  </div>
                </div>
              </div>


            </div>
          </>)}

          {/* == STRATEGY TAB == */}
          {activeTab === 'strategy' && (<>
            <div className="studio-hero">
              <div className="studio-hero-eyebrow">Strategy Logic</div>
              <h1 className="studio-hero-title">Teach it <span>when to buy</span> and sell.</h1>
              <p className="studio-hero-sub">Compose conditions from indicators, or edit the DSL directly.</p>
            </div>

            <div className="studio-form-card">
              <div className="studio-view-toggle">
                <button className={`studio-toggle-btn ${dslTab === 'visual' ? 'active' : ''}`} onClick={() => setDslTab('visual')}>Visual builder</button>
                <button className={`studio-toggle-btn ${dslTab === 'json' ? 'active' : ''}`} onClick={() => setDslTab('json')}>DSL (JSON)</button>
              </div>

              <div className="studio-strategy-meta">
                <div className="studio-form-group" style={{ flex: 1 }}>
                  <div className="studio-form-label">Strategy name</div>
                  <input className="studio-strategy-name-input" value={strategyName} onChange={e => setStrategyName(e.target.value)} placeholder="My Custom Strategy" />
                </div>
                <div className="studio-form-group">
                  <div className="studio-form-label">Timeframe</div>
                  <div className="studio-pill-row">
                    {[{label:'1 Day',val:'1D'},{label:'1 Hour',val:'1h'},{label:'15m',val:'15m'}].map(tf => (
                      <button key={tf.val} className={`studio-pill ${timeframe === tf.val ? 'active' : ''}`} onClick={() => setTimeframe(tf.val)}>{tf.label}</button>
                    ))}
                  </div>
                </div>
                <div className="studio-form-group">
                  <div className="studio-form-label">Stop-Loss (%)</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="studio-strategy-name-input" style={{ width: '90px' }} value={stopLossType} onChange={e => setStopLossType(e.target.value)}>
                      <option value="fixed">Fixed</option>
                      <option value="trailing">Trailing</option>
                    </select>
                    <input type="number" className="studio-strategy-name-input" style={{ width: '70px', textAlign: 'center' }} value={stopLossPct} onChange={e => setStopLossPct(parseFloat(e.target.value) || 0)} min={0.1} max={100} step={0.1} />
                  </div>
                </div>
              </div>

              {dslTab === 'visual' ? (<>
                <div className="studio-condition-group">
                  <div className="studio-condition-header">
                    <span className="studio-condition-label-buy">BUY</span>
                    <span style={{ color: 'var(--s-text-muted)', fontSize: '11px' }}>- AND group</span>
                  </div>
                  <RecursiveBuilder dslString={buyDsl} onChange={setBuyDsl} />
                </div>
                <div className="studio-condition-group">
                  <div className="studio-condition-header">
                    <span className="studio-condition-label-sell">SELL</span>
                    <span style={{ color: 'var(--s-text-muted)', fontSize: '11px' }}>- OR group</span>
                  </div>
                  <RecursiveBuilder dslString={sellDsl} onChange={setSellDsl} />
                </div>
              </>) : (
                <div className="studio-dsl-grid">
                  <div><div className="studio-dsl-label green">BUY Logic</div><textarea className="studio-dsl-textarea" value={buyDsl} onChange={handleBuyDslChange} /></div>
                  <div><div className="studio-dsl-label red">SELL Logic</div><textarea className="studio-dsl-textarea" value={sellDsl} onChange={handleSellDslChange} /></div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '10px', color: 'var(--s-text-muted)', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.5px' }}>QUICK TEMPLATES</div>
                <div className="studio-templates-row">
                  {[
                    { key: 'RSI_EMA', name: 'RSI + EMA', desc: 'Mean reversion & trend' },
                    { key: 'MACD_CROSS', name: 'MACD crossover', desc: 'MACD vs signal' },
                    { key: 'BOLLINGER', name: 'Bollinger bands', desc: 'Breakout / reversion' },
                    ...(savedStrategies[0] ? [{ key: 'saved_0', name: savedStrategies[0].name, desc: 'Saved: edit & reuse' }] : [])
                  ].map(t => (
                    <button key={t.key} className="studio-template-card" onClick={() => t.key === 'saved_0' ? loadSavedStrategy(savedStrategies[0]) : loadTemplate(t.key)}>
                      <div className="studio-template-name">{t.name}</div>
                      <div className="studio-template-desc">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>


            </div>
          </>)}

          {/* == RESULTS TAB == */}
          {activeTab === 'results' && (
            !results ? (
              <div className="studio-empty-results">
                <div className="studio-empty-icon">[!]</div>
                <div className="studio-empty-title">No results yet</div>
                <div className="studio-empty-sub">Configure your setup and strategy, then run a backtest to see your performance report here.</div>
                <button className="studio-cta-btn" style={{ marginTop: '8px' }} onClick={() => setActiveTab('setup')}>Start Setup -&gt;</button>
              </div>
            ) : (
              <div className="studio-results">
                {/* Unified Performance Summaries */}
                {(() => {
                  const activeReport = results.stock_reports?.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports?.[0];
                  return (
                    <div className="studio-unified-perf-card">
                      <div className="studio-unified-perf-split">
                        {/* Left: Overall Portfolio */}
                        <div className="studio-unified-perf-half">
                          <div className="studio-unified-perf-header">Overall Portfolio Summary</div>
                          <div className="studio-unified-perf-grid">
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total return</span>
                              <span className={`studio-u-stat-val ${results?.portfolio_summary?.roi >= 0 ? 'green' : 'red'}`}>
                                {results?.portfolio_summary ? (results.portfolio_summary.roi > 0 ? '+' : '') + results.portfolio_summary.roi + '%' : '---'}
                              </span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Final value</span>
                              <span className="studio-u-stat-val">{results?.portfolio_summary ? 'INR ' + results.portfolio_summary.final_capital.toLocaleString() : '---'}</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Max drawdown</span>
                              <span className="studio-u-stat-val red">-12.3%</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Win rate</span>
                              <span className="studio-u-stat-val">58.1%</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total trades</span>
                              <span className="studio-u-stat-val">{results?.portfolio_summary ? results.portfolio_summary.trades : '---'}</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total P&amp;L</span>
                              <span className={`studio-u-stat-val ${(results?.portfolio_summary?.total_pnl ?? 0) >= 0 ? 'green' : 'red'}`}>
                                {results?.portfolio_summary ? (results.portfolio_summary.total_pnl >= 0 ? '+' : '') + 'INR ' + results.portfolio_summary.total_pnl.toLocaleString() : '---'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="studio-unified-perf-divider" />

                        {/* Right: Individual Stock (Selected) */}
                        <div className="studio-unified-perf-half">
                          <div className="studio-unified-perf-header">Individual Summary: {activeReport?.ticker?.replace('.NS','').replace('.BO','').replace('^','') || 'N/A'}</div>
                          <div className="studio-unified-perf-grid">
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total return</span>
                              <span className={`studio-u-stat-val ${(activeReport?.summary?.roi ?? 0) >= 0 ? 'green' : 'red'}`}>
                                {activeReport?.summary ? (activeReport.summary.roi > 0 ? '+' : '') + (activeReport.summary.roi || 0) + '%' : '---'}
                              </span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Final value</span>
                              <span className="studio-u-stat-val">{activeReport?.summary ? 'INR ' + (activeReport.summary.final_capital || 0).toLocaleString() : '---'}</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Max drawdown</span>
                              <span className="studio-u-stat-val red">-10.1%</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Win rate</span>
                              <span className="studio-u-stat-val">{activeReport?.summary?.win_rate ? activeReport.summary.win_rate + '%' : '55.4%'}</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total trades</span>
                              <span className="studio-u-stat-val">{activeReport?.summary ? (activeReport.summary.trades || 0) : '---'}</span>
                            </div>
                            <div className="studio-u-stat">
                              <span className="studio-u-stat-lbl">Total P&amp;L</span>
                              <span className={`studio-u-stat-val ${(replayPnl !== null ? replayPnl : activeReport?.summary?.total_pnl ?? 0) >= 0 ? 'green' : 'red'}`}>
                                {replayPnl !== null ? (replayPnl >= 0 ? '+' : '') + 'INR ' + replayPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (activeReport?.summary ? (activeReport.summary.total_pnl >= 0 ? '+' : '') + 'INR ' + (activeReport.summary.total_pnl || 0).toLocaleString() : '---')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Chart and Trades Split */}
                <div className="studio-split-view">
                  {/* Left Column: Chart */}
                  <div className="studio-chart-side">
                    <div className="studio-equity-section">
                      {results.stock_reports && results.stock_reports.length > 1 && (
                        <div className="studio-chart-ticker-tabs">
                          {results.stock_reports.map((r: any) => (
                            <button key={r.ticker} className={`studio-chart-ticker-btn ${selectedChartTicker === r.ticker ? 'active' : ''}`} onClick={() => setSelectedChartTicker(r.ticker)}>
                              <StockLogo symbol={r.ticker} fallbackToAvatar style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                              {r.ticker.replace('.NS','').replace('.BO','').replace('^','')}
                            </button>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const activeReport = results.stock_reports?.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports?.[0];
                        const indicatorKeySet = new Set<string>();
                        (activeReport?.price_history || []).forEach((d: any) => { Object.keys(d).forEach(k => { if (k !== 'date' && k !== 'price') indicatorKeySet.add(k); }); });
                        const indKeys = Array.from(indicatorKeySet);
                        const lblParts = indKeys.slice(0,3).map(k => k.replace(/^indicator_/i,'').replace(/period(\d+)/i,'($1)').replace(/_/g,' ').trim());
                        return (
                          <div className="studio-equity-title" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingRight:'12px' }}>
                            <div>
                              Equity curve
                              {activeReport?.ticker && <span className="studio-equity-subtitle"> vs {activeReport.ticker}{lblParts.length > 0 ? ': ' + lblParts.join(', ') : ''}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button className="studio-cta-btn" style={{ background: liveDeployModes[activeReport?.ticker] ? '#ef4444' : '#10b981', borderColor: liveDeployModes[activeReport?.ticker] ? '#dc2626' : '#059669', padding: '6px 12px', fontSize: '11px', gap: '4px', minHeight: '26px' }} onClick={() => { if(liveDeployModes[activeReport?.ticker]) { setLiveDeployModes(p => ({...p, [activeReport!.ticker]: false})); } else { setShowDeployModal(true); } }} disabled={isRunning}>{liveDeployModes[activeReport?.ticker] ? '⏹ Stop Live' : '🚀 Deploy'}</button>
                              <button className="studio-cta-btn" style={{ padding: '6px 12px', fontSize: '11px', gap: '4px', minHeight: '26px' }} onClick={handleRunOnChart} disabled={isRunning}>{isRunning ? 'Running...' : '@ Re-run'}</button>
                              <button className="pb-btn" onClick={() => setShowTradeLedger(!showTradeLedger)} style={{ fontSize:'10px', padding:'4px 10px', background: showTradeLedger ? 'var(--s-card-hover)' : 'var(--s-primary-dim)', color: showTradeLedger ? 'var(--s-text)' : 'var(--s-primary)', height: '26px' }}>
                                {showTradeLedger ? 'Hide Trade Ledger' : 'Show Trade Ledger'}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="studio-chart-wrap">
                        <div className="studio-chart-inner">
                          {(() => {
                            const activeReport = results.stock_reports?.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports?.[0];
                            if (!activeReport) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--s-text-muted)' }}>No chart data</div>;
                            
                            const indicatorKeySet = new Set<string>();
                            (activeReport.price_history || []).forEach((d: any) => { Object.keys(d).forEach(k => { if (k !== 'date' && k !== 'price') indicatorKeySet.add(k); }); });
                            const indicatorKeys = Array.from(indicatorKeySet);
                            const hasRsi = indicatorKeys.some(k => k.toLowerCase().includes('rsi'));
                            const hasThresholds = indicatorKeys.some(k => k.toLowerCase().startsWith('threshold'));
                            const extendedKeys = [...indicatorKeys];
                            if (hasRsi && !hasThresholds) extendedKeys.push('Threshold_70', 'Threshold_30');
                            const indicatorSeries = extendedKeys.map((k, i) => {
                              const colors = ['#6366f1','#f59e0b','#06b6d4','#ec4899','#8b5cf6','#14b8a6','#f97316','#3b82f6'];
                              const isThreshold = k.toLowerCase().startsWith('threshold');
                              const threshMatch = k.match(/\d+(\.\d+)?/);
                              const threshNum = threshMatch ? parseFloat(threshMatch[0]) : null;
                              let color = colors[i % colors.length];
                              if (isThreshold && threshNum != null) color = threshNum >= 50 ? '#ef4444' : '#10b981';
                              const formattedLabel = isThreshold && threshNum != null
                                ? `Threshold (${threshNum})`
                                : k.replace(/^indicator_/i,'').replace(/period(\d+)/i,'($1)').replace(/_/g,' ').trim();
                              return {
                                key: k, label: formattedLabel, color, width: isThreshold ? 1.5 : 2,
                                values: activeReport.price_history.map((d: any) => ({
                                  x: new Date(d.date).getTime(),
                                  y: d[k] !== undefined && d[k] !== null ? d[k] : (isThreshold && threshNum != null ? threshNum : null)
                                })).filter((d: any) => d.y !== undefined && d.y !== null)
                              };
                            });
                            
                            if (liveDeployModes[activeReport?.ticker]) return <LiveStudioGraph 
                              symbol={activeReport.ticker} 
                              indicatorSeries={indicatorSeries} 
                              onClose={() => setLiveDeployModes(p => ({...p, [activeReport!.ticker]: false}))} 
                              strategyName={strategyName}
                              userId={savedStrategies[0]?.userId}
                              buyDsl={buyDsl}
                              sellDsl={sellDsl}
                              allocatedCapital={Number(algoCapital)}
                              mode={dataMode}
                              stopLossPct={stopLossPct}
                              stopLossType={stopLossType}
                            />;
                            
                            return (
                              <AlgoBacktestChart
                                indicatorSeries={indicatorSeries}
                                lineData={activeReport.price_history.map((d: any) => ({ x: new Date(d.date).getTime(), y: d.price }))}
                                timeframe="ALL"
                                marketState="CLOSED"
                                percent={activeReport.summary.roi.toString()}
                                trades={activeReport.trade_log.map((t: any) => ({
                                  side: t.type === 'BUY' ? 'BUY' : 'SELL',
                                  quantity: t.shares || 1,
                                  pricePerShare: t.price,
                                  createdAtIST: new Date(t.date).getTime(),
                                  pnl: t.pnl,
                                  reason: t.reason
                                }))}
                                activeTrade={hoveredTrade}
                                onReplayProgress={setReplayPnl}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Trade History */}
                  <div className={`studio-trades-side ${showTradeLedger ? 'open' : 'collapsed'}`}>
                    {(() => {
                      const activeReport = results.stock_reports?.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports?.[0];
                      if (!activeReport?.trade_log?.length) return (
                        <div className="studio-trades-section">
                          <div className="studio-trades-title">Trade Ledger</div>
                          <div style={{ color:'var(--s-text-muted)', fontSize:'12px', marginTop:'16px' }}>No trades taken.</div>
                        </div>
                      );
                      return (
                        <div className="studio-trades-section">
                          <div className="studio-trades-title">Trade Ledger</div>
                          <div className="studio-trade-timeline">
                            {activeReport.trade_log.map((t: any, index: number) => (
                              <div key={index} className="studio-timeline-item"
                                onMouseEnter={() => setHoveredTrade({ x: new Date(t.date).getTime(), y: t.price, side: t.type === 'BUY' ? 'BUY' : 'SELL', quantity: t.shares || 1, pnl: t.pnl, reason: t.reason, originalIndex: index })}
                                onMouseLeave={() => setHoveredTrade(null)}>
                                <div className={`studio-timeline-node ${t.type.toLowerCase()}`} />
                                <div className="studio-timeline-content">
                                  <div className="studio-tl-header">
                                    <span className={`studio-tl-badge ${t.type.toLowerCase()}`}>{t.type}</span>
                                    <span className="studio-tl-date">{new Date(t.date).toLocaleString('en-US', { timeZone:'UTC', month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                                  </div>
                                  <div className="studio-tl-body">
                                    <div className="studio-tl-stat">
                                      <span className="studio-tl-lbl">Price</span>
                                      <span className="studio-tl-val">INR {Number(t.price).toFixed(2)}</span>
                                    </div>
                                    <div className="studio-tl-stat">
                                      <span className="studio-tl-lbl">Shares</span>
                                      <span className="studio-tl-val">{t.shares || 1}</span>
                                    </div>
                                    {t.pnl != null && (
                                      <div className="studio-tl-stat">
                                        <span className="studio-tl-lbl">P&amp;L</span>
                                        <span className={`studio-tl-val ${t.pnl >= 0 ? 'green' : 'red'}`}>{t.pnl >= 0 ? '+' : ''}INR {Number(t.pnl).toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                  {t.reason && <div className="studio-tl-reason">{t.reason}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>


              </div>
            )
          )}

        </div>{/* end studio-page */}


        <div className="studio-footer-disclaimer">Backtests are simulated on historical data and do not guarantee future performance.</div>

      </div>{/* end studio-main */}

      {/* === MODALS === */}

      {showBuilderModal && (
        <div className="pb-modal-overlay" onClick={() => setShowBuilderModal(false)}>
          <div className="pb-modal" onClick={e => e.stopPropagation()}>
            <div className="pb-modal-header">
              <div>
                <h2 style={{ fontWeight:700, fontSize:'18px', color:'#0f172a' }}>Strategy Logic Builder</h2>
                <p style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>Define when to buy and sell using indicators</p>
              </div>
              <button className="pb-modal-close-btn" onClick={() => setShowBuilderModal(false)}>x</button>
            </div>
            <div className="pb-modal-body">
              <div className="pb-modal-col-left">
                <div className="pb-dsl-tabs">
                  <div className={`pb-dsl-tab ${dslTab === 'json' ? 'active' : ''}`} onClick={() => setDslTab('json')}>JSON DSL Editor</div>
                  <div className={`pb-dsl-tab ${dslTab === 'visual' ? 'active' : ''}`} onClick={() => setDslTab('visual')}>Visual Builder</div>
                </div>
                {dslTab === 'json' ? (<>
                  <div className="pb-step">
                    <div className="pb-step-header"><div className="pb-step-num">B</div><h3 style={{ fontWeight:700, fontSize:'15px', color:'#10b981' }}>BUY Logic</h3></div>
                    <textarea className="pb-json-editor" style={{ width:'100%', height:'180px', resize:'vertical' }} value={buyDsl} onChange={handleBuyDslChange} spellCheck={false} />
                  </div>
                  <div className="pb-step">
                    <div className="pb-step-header"><div className="pb-step-num" style={{ background:'#ef4444' }}>S</div><h3 style={{ fontWeight:700, fontSize:'15px', color:'#ef4444' }}>SELL Logic</h3></div>
                    <textarea className="pb-json-editor" style={{ width:'100%', height:'180px', resize:'vertical' }} value={sellDsl} onChange={handleSellDslChange} spellCheck={false} />
                  </div>
                </>) : (<>
                  <div className="pb-step">
                    <div className="pb-step-header"><div className="pb-step-num">B</div><h3 style={{ fontWeight:700, fontSize:'15px', color:'#10b981' }}>BUY Conditions</h3></div>
                    <RecursiveBuilder dslString={buyDsl} onChange={setBuyDsl} />
                  </div>
                  <div className="pb-step">
                    <div className="pb-step-header"><div className="pb-step-num" style={{ background:'#ef4444' }}>S</div><h3 style={{ fontWeight:700, fontSize:'15px', color:'#ef4444' }}>SELL Conditions</h3></div>
                    <RecursiveBuilder dslString={sellDsl} onChange={setSellDsl} />
                  </div>
                </>)}
              </div>
              <div className="pb-modal-col-right">
                <h3 style={{ fontWeight:700, fontSize:'14px', marginBottom:'12px', color:'#334155' }}>Quick Templates</h3>
                {[{key:'RSI_EMA',name:'RSI + EMA',desc:'Mean reversion with trend filter'},{key:'MACD_CROSS',name:'MACD Crossover',desc:'Classic signal line crossover'},{key:'BOLLINGER',name:'Bollinger Bands',desc:'Breakout & reversion strategy'}].map(t => (
                  <button key={t.key} onClick={() => loadTemplate(t.key)} style={{ display:'block', width:'100%', textAlign:'left', padding:'12px', borderRadius:'10px', border:'1px solid #e2e8f0', background:'#fff', marginBottom:'8px', cursor:'pointer', transition:'all 0.15s' }}>
                    <div style={{ fontWeight:600, fontSize:'13px', color:'#4f46e5', marginBottom:'2px' }}>{t.name}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>{t.desc}</div>
                  </button>
                ))}
                {savedStrategies.length > 0 && (<>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#94a3b8', letterSpacing:'1px', textTransform:'uppercase', margin:'14px 0 8px' }}>Your Saved</div>
                  {savedStrategies.map(s => (
                    <button key={s._id} onClick={() => { loadSavedStrategy(s); setShowBuilderModal(false); }} style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 12px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'#f8fafc', marginBottom:'6px', cursor:'pointer', fontSize:'12px', fontWeight:600, color:'#334155' }}>{s.name}</button>
                  ))}
                </>)}
              </div>
            </div>
            <div className="pb-modal-footer">
              <button className="pb-btn" onClick={copyToClipboard}>[Copy] Copy JSON</button>
              <div style={{ display:'flex', gap:'8px' }}>
                <button className="studio-save-btn" onClick={() => handleSaveStrategyPrompt(false)}><i className="fa-solid fa-floppy-disk"></i> Save</button>
                <button className="studio-save-btn" onClick={() => handleSaveStrategyPrompt(true)}><i className="fa-solid fa-copy"></i> Save As New</button>
                <button className="studio-cta-btn" onClick={() => { setShowBuilderModal(false); handleRunOnChart(); }} disabled={isRunning}>
                  {isRunning ? 'Running...' : 'Run Backtest'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="pb-modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="pb-config-popup-card" onClick={e => e.stopPropagation()}>
            <div className="pb-config-popup-header">
              <span style={{ fontWeight:700, fontSize:'16px' }}>Setup Parameters</span>
              <button className="pb-modal-close-btn" onClick={() => setShowConfigModal(false)}>x</button>
            </div>
            <div className="pb-config-popup-body">{renderConfigCards()}</div>
            <div className="pb-config-popup-footer">
              <button className="pb-btn" onClick={() => setShowConfigModal(false)}>Close</button>
              <button className="pb-btn primary" onClick={() => { setShowConfigModal(false); setShowBuilderModal(true); }}>Configure Strategy -&gt;</button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="pb-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div style={{ background:'#fff', borderRadius:'16px', padding:'28px', width:'400px', maxWidth:'95vw', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight:700, fontSize:'16px', color:'#0f172a', marginBottom:'6px' }}>Save Strategy</h3>
            <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'18px' }}>Give your strategy a name to save and reuse it later.</p>
            <input className="pb-input" style={{ width:'100%', marginBottom:'12px', padding:'10px 12px', fontSize:'13px' }} placeholder="Strategy name..." value={strategyName} onChange={e => setStrategyName(e.target.value)} onKeyDown={e => e.key === 'Enter' && executeSaveStrategy(strategyName)} autoFocus />
            {saveStatus.message && <p style={{ fontSize:'12px', fontWeight:600, color: saveStatus.type === 'success' ? '#10b981' : '#ef4444', marginBottom:'12px' }}>{saveStatus.message}</p>}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
              <button className="pb-btn" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="pb-btn primary" onClick={() => executeSaveStrategy(strategyName, saveAsMode)} disabled={isSavingStrategy}>{isSavingStrategy ? 'Saving...' : 'Save Strategy'}</button>
            </div>
          </div>
        </div>
      )}

      {showDeployModal && (() => {
        const isValid = Number(algoCapital) > 0 && Number(algoCapital) <= userBalance;
        const balanceAfter = userBalance - Number(algoCapital);

        const parseDslLabel = (dsl: string) => {
          try {
            const p = JSON.parse(dsl);
            const c = p.conditions?.[0];
            if (!c) return 'Custom Logic';
            const left = c.indicator || c.left?.name || 'Ind';
            const params = c.params?.period ? `(${c.params.period})` : '';
            const op = c.comparison || c.op || '';
            const right = typeof c.value === 'object' && c.value !== null
              ? `${c.value.indicator || ''}(${c.value.params?.period || ''})`
              : (c.value ?? c.right_value ?? '');
            return `${left}${params} ${op} ${right}`;
          } catch { return 'Custom Logic'; }
        };

        const getIndicators = () => {
          try {
            const inds = new Set<string>();
            for (const dsl of [buyDsl, sellDsl]) {
              if (!dsl) continue;
              const p = JSON.parse(dsl);
              (p.conditions || []).forEach((c: any) => {
                if (c.indicator) { const per = c.params?.period; inds.add(c.indicator + (per ? `(${per})` : '')); }
                if (c.left?.name) inds.add(c.left.name);
                if (typeof c.value === 'object' && c.value?.indicator) inds.add(c.value.indicator);
              });
            }
            return Array.from(inds);
          } catch { return []; }
        };

        const inds = getIndicators();

        return (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
            onClick={() => setShowDeployModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 460,
                maxWidth: '95vw',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(15,23,42,0.12)',
                fontFamily: 'inherit',
              }}
            >
              {/* Slim accent stripe */}
              <div style={{ height: 3, background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #06b6d4 100%)' }} />

              {/* Header */}
              <div style={{ padding: '20px 24px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
                      ● LIVE DEPLOYMENT
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.4px' }}>
                      {(selectedChartTicker || tickers[0] || 'Select Stock').replace('.NS', '')}
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>.NS</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{strategyName || 'Custom Strategy'}</div>
                  </div>
                  <button
                    onClick={() => setShowDeployModal(false)}
                    style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: '32px', textAlign: 'center', flexShrink: 0 }}
                  >×</button>
                </div>

                {/* Indicator pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
                  {inds.length > 0 ? inds.map((ind, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 8px' }}>{ind}</span>
                  )) : (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>No indicators</span>
                  )}
                </div>
              </div>

              {/* Conditions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ padding: '12px 24px', borderRight: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Buy Signal</div>
                  <div style={{ fontSize: 12, color: '#334155', fontFamily: "'JetBrains Mono', 'Courier New', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parseDslLabel(buyDsl)}
                  </div>
                </div>
                <div style={{ padding: '12px 24px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Sell Signal</div>
                  <div style={{ fontSize: 12, color: '#334155', fontFamily: "'JetBrains Mono', 'Courier New', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parseDslLabel(sellDsl)}
                  </div>
                </div>
              </div>

              {/* Balance row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ padding: '14px 24px', borderRight: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>Available</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    ₹{userBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div style={{ padding: '14px 24px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 4 }}>After Deploy</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: isValid ? '#d97706' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                    {isValid ? `₹${balanceAfter.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                  </div>
                </div>
              </div>

              {/* Data Source Mode Toggle */}
              <div style={{ padding: '14px 24px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Data Source</div>
                <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderRadius: 8, padding: 3, border: '1px solid #e2e8f0' }}>
                  <button
                    id="mode-toggle-simulate"
                    onClick={() => setDataMode('simulate')}
                    style={{
                      flex: 1, padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: dataMode === 'simulate' ? '#ffffff' : 'transparent',
                      color: dataMode === 'simulate' ? '#3b82f6' : '#64748b',
                      boxShadow: dataMode === 'simulate' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    🎮 Simulate
                  </button>
                  <button
                    id="mode-toggle-upstox"
                    onClick={() => setDataMode('upstox')}
                    style={{
                      flex: 1, padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: dataMode === 'upstox' ? '#ffffff' : 'transparent',
                      color: dataMode === 'upstox' ? '#10b981' : '#64748b',
                      boxShadow: dataMode === 'upstox' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    📡 Upstox Live
                  </button>
                </div>
                {dataMode === 'upstox' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#10b981', fontWeight: 500 }}>
                    ✓ Connects to real-time Upstox feed (port 4141). Make sure websocket.js is running.
                  </div>
                )}
                {dataMode === 'simulate' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#3b82f6', fontWeight: 500 }}>
                    ✓ Connects to paper trading simulator (port 8765).
                  </div>
                )}
              </div>

              {/* Capital input */}
              <div style={{ padding: '16px 24px 20px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: 8 }}>
                  Algo Capital (₹)
                </label>
                <input
                  type="number"
                  autoFocus
                  value={algoCapital}
                  onChange={e => setAlgoCapital(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#0f172a',
                    background: '#f8fafc',
                    border: `1px solid ${Number(algoCapital) > userBalance ? '#dc2626' : '#cbd5e1'}`,
                    borderRadius: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                {Number(algoCapital) > userBalance && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626', fontWeight: 500 }}>
                    ⚠ Exceeds available balance
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => setShowDeployModal(false)}
                    style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!isValid || isDeploying}
                    onClick={async () => {
                      if (isDeploying) return;
                      setIsDeploying(true);
                      try {
                        const res = await fetch(`${HOST}/api/algo/session/start`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ capital: Number(algoCapital), symbol: selectedChartTicker || tickers[0] })
                        });
                        if (res.ok) {
                          setUserBalance(prev => prev - Number(algoCapital));
                          setShowDeployModal(false);
                          setLiveDeployModes(p => ({...p, [selectedChartTicker || tickers[0]]: true}));
                        } else {
                          const data = await res.json();
                          alert(data.error || "Failed to allocate capital.");
                        }
                      } catch(e) { console.error("Error starting session", e); }
                      finally { setIsDeploying(false); }
                    }}
                    style={{
                      flex: 2,
                      padding: '10px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      background: isValid ? 'linear-gradient(90deg, #2563eb 0%, #4f46e5 100%)' : '#e2e8f0',
                      border: 'none',
                      borderRadius: 8,
                      cursor: isValid && !isDeploying ? 'pointer' : 'not-allowed',
                      opacity: isValid && !isDeploying ? 1 : 0.5,
                      transition: 'all 0.15s',
                    }}
                  >
                    {isDeploying ? "Deploying..." : "🚀 Confirm Deploy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {isSearchOverlayOpen && (
        <SearchOverlay
          onClose={() => setIsSearchOverlayOpen(false)}
          onSelectTicker={(symbol: string) => { handleToggleTicker(symbol); setIsSearchOverlayOpen(false); }}
        />
      )}

    </div>
  );
}












