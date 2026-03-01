import React from 'react';

interface AIConfidenceBadgeProps {
  score: number;
  riskLevel: 'Low' | 'Moderate' | 'High';
  suggestion: 'Hold' | 'Reduce' | 'Exit' | 'Add';
}

const AIConfidenceBadge: React.FC<AIConfidenceBadgeProps> = ({ score, riskLevel, suggestion }) => {
  const getSuggestionConfig = (sugg: string) => {
    switch (sugg) {
      case 'Add': return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' }; // Green
      case 'Hold': return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }; // Blue
      case 'Reduce': return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' }; // Orange
      case 'Exit': return { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' }; // Red
      default: return { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' };
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return '#10b981';
      case 'Moderate': return '#f59e0b';
      case 'High': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const suggConfig = getSuggestionConfig(suggestion);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          backgroundColor: suggConfig.bg, 
          color: suggConfig.color,
          padding: '2px 8px',
          borderRadius: '12px',
          fontWeight: 'bold',
          border: `1px solid ${suggConfig.color}`
        }}
      >
        {suggestion}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#9ca3af', fontSize: '12px' }}>AI Confidence:</span>
        <div style={{ display: 'flex', flexDirection: 'column', width: '50px' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{score}%</span>
          <div style={{ height: '4px', width: '100%', backgroundColor: '#374151', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, backgroundColor: suggConfig.color, transition: 'width 1s ease-in-out' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: '#9ca3af', fontSize: '12px' }}>Risk:</span>
        <span style={{ color: getRiskColor(riskLevel), fontWeight: 'bold' }}>{riskLevel}</span>
      </div>
    </div>
  );
};

export default AIConfidenceBadge;
