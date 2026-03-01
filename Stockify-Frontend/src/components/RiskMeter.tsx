import React from 'react';

interface RiskMeterProps {
  score: number;
  category: string;
}

const RiskMeter: React.FC<RiskMeterProps> = ({ score, category }) => {
  const getScoreColor = (value: number) => {
    if (value < 40) return '#10b981'; // Green for low risk
    if (value < 70) return '#f59e0b'; // Orange for moderate
    return '#ef4444'; // Red for high
  };

  const color = getScoreColor(score);

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ color: '#d1d5db', fontSize: '14px', fontWeight: 500 }}>Portfolio Risk Score</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color, fontWeight: 'bold', fontSize: '18px' }}>{score}</span>
          <span style={{ 
            backgroundColor: 'rgba(255,255,255,0.1)', 
            padding: '2px 8px', 
            borderRadius: '12px', 
            fontSize: '12px',
            color: '#e5e7eb'
          }}>
            {category}
          </span>
        </div>
      </div>
      <div style={{ height: '8px', width: '100%', backgroundColor: '#374151', borderRadius: '4px', overflow: 'hidden' }}>
        <div 
          style={{ 
            height: '100%', 
            width: `${score}%`, 
            backgroundColor: color, 
            transition: 'width 1s ease-in-out',
            boxShadow: `0 0 8px ${color}`
          }} 
        />
      </div>
    </div>
  );
};

export default RiskMeter;
