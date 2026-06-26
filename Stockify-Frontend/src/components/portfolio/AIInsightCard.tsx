import React from 'react';
import RiskMeter from './RiskMeter';

interface AIInsightCardProps {
  portfolioRiskScore: number;
  riskCategory: string;
  emotionalFlags: {
    revengeTrading: boolean;
    fomo: boolean;
    panicSelling: boolean;
    overtrading: boolean;
  };
  behavioralMetrics?: {
    winRate: number;
    avgHoldTime: string;
    disciplineScore: number;
  };
  overallAdvice: string;
  loading?: boolean;
}

const AIInsightCard: React.FC<AIInsightCardProps> = ({
  portfolioRiskScore,
  riskCategory,
  emotionalFlags,
  behavioralMetrics,
  overallAdvice,
  loading = false,
}) => {
  if (loading) {
    return (
      <div style={{ 
        backgroundColor: 'rgba(17, 24, 39, 0.9)', 
        borderRadius: '20px', 
        padding: '28px', 
        marginBottom: '24px', 
        border: '1px solid rgba(59, 130, 246, 0.2)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '260px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Futuristic Scanning Laser */}
        <div style={{ 
          position: 'absolute', 
          top: 0, left: '-100%', width: '50%', height: '100%', 
          background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent)',
          animation: 'aiScan 2.5s infinite linear',
          zIndex: 1
        }} />

        {/* Header Skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', animation: 'aiPulseOpacity 2s infinite ease-in-out' }} />
          <div style={{ height: '14px', width: '220px', background: 'linear-gradient(90deg, #1f2937, #374151, #1f2937)', backgroundSize: '200% 100%', borderRadius: '4px', animation: 'aiShimmer 2s infinite linear' }} />
          <div style={{ marginLeft: 'auto', width: '100px', height: '20px', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '20px', border: '1px solid rgba(96, 165, 250, 0.1)' }} />
        </div>

        {/* Risk Meter Skeleton */}
        <div style={{ marginTop: '10px' }}>
           <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '40%', background: 'linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.4), transparent)', position: 'absolute', left: '-40%', animation: 'aiShimmer 1.5s infinite linear' }} />
           </div>
           <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <div style={{ height: '10px', width: '60px', backgroundColor: '#1f2937', borderRadius: '4px' }} />
              <div style={{ height: '10px', width: '80px', backgroundColor: '#1f2937', borderRadius: '4px' }} />
           </div>
        </div>

        {/* Metrics Grid Skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
           <div style={{ height: '54px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }} />
           <div style={{ height: '54px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }} />
        </div>

        {/* Advice Box Skeleton */}
        <div style={{ height: '60px', width: '100%', background: 'rgba(59, 130, 246, 0.03)', borderLeft: '3px solid rgba(59, 130, 246, 0.2)', borderRadius: '0 8px 8px 0', borderTop: '1px solid rgba(59,130,246,0.05)' }} />
      </div>
    );
  }

  // Create minimal 1-2 sentence string
  const minimalAdvice = overallAdvice ? overallAdvice.split(/[.]/).filter(s => s.trim().length > 0).slice(0, 1).join('. ') + '.' : '';

  return (
    <div style={{ 
      backgroundColor: 'rgba(17, 24, 39, 0.95)', 
      borderRadius: '20px', 
      padding: '28px', 
      marginBottom: '24px', 
      border: '1px solid rgba(59, 130, 246, 0.3)',
      boxShadow: '0 15px 35px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(59, 130, 246, 0.05)',
      position: 'relative',
      overflow: 'hidden',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Background Grid Pattern */}
      <div style={{ 
          position: 'absolute', 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundImage: 'radial-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px)', 
          backgroundSize: '20px 20px', 
          opacity: 0.4,
          pointerEvents: 'none'
      }} />

      {/* Futuristic Glow Corner */}
      <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '10px' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '32px', 
          height: '32px', 
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          borderRadius: '8px',
          border: '1px solid rgba(59, 130, 246, 0.2)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 4px rgba(96, 165, 250, 0.4))' }}>
            {/* Outer dotted ring */}
            <circle cx="12" cy="12" r="10" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="2 2" strokeOpacity="0.5">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="10s" repeatCount="indefinite" />
            </circle>
            
            {/* Middle hex frame */}
            <path d="M12 4L19 8V16L12 20L5 16V8L12 4Z" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.8">
              <animate attributeName="stroke-opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
            </path>
            
            {/* Inner Pulsing Core */}
            <circle cx="12" cy="12" r="3" fill="#60a5fa">
              <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
            </circle>
            
            {/* Crosshair accents */}
            <path d="M12 7V9M12 15V17M7 12H9M15 12H17" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.6" />
          </svg>
        </div>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: 800, 
          letterSpacing: '0.15em', 
          textTransform: 'uppercase',
          margin: 0,
          background: 'linear-gradient(90deg, #f9fafb 0%, #93c5fd 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
        }}>
          Behavioral Intelligence Report
        </h3>
        <span style={{ 
          marginLeft: 'auto', 
          backgroundColor: 'rgba(59, 130, 246, 0.05)', 
          color: '#60a5fa', 
          padding: '4px 10px', 
          borderRadius: '20px', 
          fontSize: '10px', 
          fontWeight: 800, 
          border: '1px solid rgba(96, 165, 250, 0.2)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          PaperBull Aegis AI
        </span>
      </div>

      <RiskMeter score={portfolioRiskScore} category={riskCategory} />

      {/* Behavioral Metrics Grid */}
      {behavioralMetrics && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>Win Rate</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: behavioralMetrics.winRate > 50 ? '#10b981' : '#f87171' }}>
                      {behavioralMetrics.winRate.toFixed(1)}%
                  </div>
              </div>
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>Discipline</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: behavioralMetrics.disciplineScore > 70 ? '#60a5fa' : '#fb923c' }}>
                      {behavioralMetrics.disciplineScore}/100
                  </div>
              </div>
          </div>
      )}

      {/* Behavioral Health Badges */}
      <h4 style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', marginTop: '16px' }}>Behavioral Health</h4>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ padding: '6px 12px', backgroundColor: emotionalFlags.fomo ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)', border: emotionalFlags.fomo ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '11px', color: emotionalFlags.fomo ? '#fca5a5' : '#d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emotionalFlags.fomo ? '#ef4444' : '#10b981' }}></div>
            FOMO
        </div>
        <div style={{ padding: '6px 12px', backgroundColor: emotionalFlags.panicSelling ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)', border: emotionalFlags.panicSelling ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '11px', color: emotionalFlags.panicSelling ? '#fca5a5' : '#d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emotionalFlags.panicSelling ? '#ef4444' : '#10b981' }}></div>
            Panic Sell
        </div>
        <div style={{ padding: '6px 12px', backgroundColor: emotionalFlags.revengeTrading ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)', border: emotionalFlags.revengeTrading ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '11px', color: emotionalFlags.revengeTrading ? '#fca5a5' : '#d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emotionalFlags.revengeTrading ? '#ef4444' : '#10b981' }}></div>
            Revenge
        </div>
        <div style={{ padding: '6px 12px', backgroundColor: emotionalFlags.overtrading ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)', border: emotionalFlags.overtrading ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '11px', color: emotionalFlags.overtrading ? '#fca5a5' : '#d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: emotionalFlags.overtrading ? '#ef4444' : '#10b981' }}></div>
            Overtrading
        </div>
      </div>

      {/* Minimal Tactical Text Component */}
      {minimalAdvice && (
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderLeft: '3px solid #3b82f6', padding: '12px 14px', borderRadius: '0 8px 8px 0', borderTop: '1px solid rgba(59,130,246,0.1)', borderBottom: '1px solid rgba(59,130,246,0.1)', borderRight: '1px solid rgba(59,130,246,0.1)' }}>
            <div style={{ fontSize: '11px', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontWeight: 'bold' }}>Tactical Stance</div>
            <p style={{ color: '#e5e7eb', fontSize: '13.5px', margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
                {minimalAdvice}
            </p>
          </div>
      )}

      <style>
        {`
          @keyframes aiScan {
            0% { left: -100%; }
            100% { left: 100%; }
          }
          @keyframes aiShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes aiPulseOpacity {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.95); }
          }
        `}
      </style>
    </div>
  );
};

export default AIInsightCard;
