import React, { useEffect, useState } from 'react';

interface AIStockReportData {
  bullish: number;
  bearish: number;
  neutral: number;
  breakout: number;
  correction: number;
  target: number;
  stopLoss: number;
  summary: string;
  intraday: string;
  delivery: string;
  suggestion: string;
  confidence: number;
}

interface AIStockReportProps {
  symbol: string;
}

const AIStockReport: React.FC<AIStockReportProps> = ({ symbol }) => {
  const [report, setReport] = useState<AIStockReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const HOST = import.meta.env.VITE_HOST_ADDRESS;
        const response = await fetch(`${HOST}/api/indiaSEE/${symbol}/ai-report`);
        if (!response.ok) throw new Error('Analysis failed');
        const result = await response.json();
        setReport(result.data);
      } catch (err) {
        setError('Market analysis temporarily unavailable');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) fetchReport();
  }, [symbol]);

  if (error || (!loading && !report)) return null;

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        position: 'fixed',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: loading && !isHovered ? 0.3 : 1
      }}
    >
      {/* Visual Floating Trigger Tab */}
      <div style={{ 
        width: '56px',
        height: '180px',
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        border: '1px solid rgba(226, 232, 240, 1)',
        borderRight: 'none',
        borderRadius: '32px 0 0 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ 
          animation: loading ? 'aiLoading 2s infinite linear' : 'aiPulse 3s infinite ease-in-out',
          color: '#2563eb',
          marginBottom: '20px'
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          </svg>
        </div>
        <div style={{ 
          writingMode: 'vertical-rl', 
          fontSize: '11px', 
          fontWeight: 900, 
          color: '#2563eb', 
          letterSpacing: '0.4em',
          textTransform: 'uppercase'
        }}>
          {loading ? 'ANALYZING' : 'AI SIGNAL'}
        </div>
      </div>

      {/* Slide-out Report Panel */}
      <div style={{ 
        width: isHovered && report ? '480px' : '0px',
        height: '780px',
        backgroundColor: 'rgba(255, 255, 255, 0.99)',
        borderLeft: isHovered && report ? '1px solid rgba(226, 232, 240, 1)' : 'none',
        overflow: 'hidden',
        transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-20px 0 50px rgba(15, 23, 42, 0.08)',
        backdropFilter: 'blur(40px)',
      }}>
        {report && (
          <div style={{ padding: '40px', width: '480px', height: '100%', boxSizing: 'border-box', position: 'relative', overflowY: 'auto' }}>
            
            {/* Header: Action Signal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
              <div>
                 <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 800, letterSpacing: '0.2em' }}>SMART AI // ANALYSIS</div>
                 <h2 style={{ margin: 0, fontSize: '28px', color: '#0f172a', fontWeight: 950, letterSpacing: '-0.02em' }}>{symbol.split('.')[0]}</h2>
              </div>
              <div style={{ 
                 padding: '10px 24px', 
                 borderRadius: '12px', 
                 border: `2px solid ${report.suggestion === 'BUY' ? '#10b981' : report.suggestion === 'SELL' ? '#ef4444' : '#3b82f6'}`,
                 background: report.suggestion === 'BUY' ? 'rgba(16,185,129,0.05)' : report.suggestion === 'SELL' ? 'rgba(239,68,68,0.05)' : 'rgba(59,130,246,0.05)',
                 fontSize: '18px',
                 fontWeight: 950,
                 color: report.suggestion === 'BUY' ? '#10b981' : report.suggestion === 'SELL' ? '#ef4444' : '#3b82f6',
              }}>
                {report.suggestion}
              </div>
            </div>

            {/* Main Probabilities */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '45px' }}>
               <ProbabilityBar label="Chance of Going Up" value={report.bullish} color="#10b981" />
               <ProbabilityBar label="Chance of Going Down" value={report.bearish} color="#ef4444" />
               <ProbabilityBar label="Chance of No Change" value={report.neutral} color="#64748b" />
            </div>

            {/* Event Odds */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '45px' }}>
               <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '22px', borderRadius: '18px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Potential Big Jump</div>
                  <div style={{ fontSize: '26px', fontWeight: 950, color: '#2563eb' }}>{report.breakout}%</div>
               </div>
               <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '22px', borderRadius: '18px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Risk of Big Drop</div>
                  <div style={{ fontSize: '26px', fontWeight: 950, color: '#f97316' }}>{report.correction}%</div>
               </div>
            </div>

            {/* Price Targets */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '45px', borderBottom: '1px solid #e2e8f0', paddingBottom: '30px' }}>
               <TargetBox label="Expected High" value={`₹${report.target}`} color="#0f172a" />
               <TargetBox label="Safety Exit" value={`₹${report.stopLoss}`} color="#dc2626" />
            </div>

            {/* Minimal Insights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <MicroSection label="Quick View" content={report.summary} color="#2563eb" />
               <MicroSection label="Day Trade" content={report.intraday} color="#f59e0b" />
               <MicroSection label="Long Term" content={report.delivery} color="#10b981" />
            </div>

            {/* Footer confidence */}
            <div style={{ marginTop: '50px', borderTop: '1px solid #e2e8f0', paddingTop: '25px', textAlign: 'center' }}>
               <span style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 800 }}>AI Confidence Score: {report.confidence}%</span>
            </div>
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes aiLoading { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes aiPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.03); opacity: 0.8; } }
          div::-webkit-scrollbar { width: 3px; }
          div::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, 0.1); border-radius: 10px; }
        `}
      </style>
    </div>
  );
};

const ProbabilityBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'flex-end' }}>
      <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: 950 }}>{value}%</span>
    </div>
    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '10px', transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}></div>
    </div>
  </div>
);

const TargetBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.1em', fontWeight: 800 }}>{label}</div>
    <div style={{ fontSize: '24px', fontWeight: 950, color }}>{value}</div>
  </div>
);

const MicroSection: React.FC<{ label: string; content: string; color: string }> = ({ label, content, color }) => (
  <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
    <span style={{ 
      fontSize: '8px', 
      background: `${color}08`, 
      color: color, 
      padding: '4px 10px', 
      borderRadius: '6px', 
      textTransform: 'uppercase', 
      fontWeight: 900,
      letterSpacing: '0.1em',
      minWidth: '65px',
      textAlign: 'center',
      border: `1px solid ${color}15`
    }}>{label}</span>
    <p style={{ margin: 0, fontSize: '12.5px', color: '#334155', fontWeight: 500, lineHeight: 1.5 }}>{content}</p>
  </div>
);

export default AIStockReport;
