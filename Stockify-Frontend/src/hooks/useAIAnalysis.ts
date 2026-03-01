import { useState, useEffect, useCallback } from 'react';

const HOST = import.meta.env.VITE_HOST_ADDRESS;

export interface AIAnalysisResponse {
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
  positionsAnalysis: {
    symbol: string;
    confidenceScore: number;
    suggestion: 'Hold' | 'Reduce' | 'Exit' | 'Add';
    riskLevel: 'Low' | 'Moderate' | 'High';
    keyInsight: string;
    tags: string[];
  }[];
  overallAdvice: string;
}

export const useAIAnalysis = (userId: string | null | undefined, positions: any[], holdings: any[], enableFetch = true) => {
  const [data, setData] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${HOST}/api/ai/analyze-portfolio`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          userId,
          positions,
          holdings,
          tradeHistory: [] // Can be filled if trade history is available
        }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const result: AIAnalysisResponse = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze portfolio');
    } finally {
      setLoading(false);
    }
  }, [userId, positions, holdings, HOST]);

  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (enableFetch && userId && !hasFetched) {
      setHasFetched(true);
      fetchAnalysis();
    }
  }, [enableFetch, userId, hasFetched, fetchAnalysis]);

  return { data, loading, error, refetch: fetchAnalysis };
};
