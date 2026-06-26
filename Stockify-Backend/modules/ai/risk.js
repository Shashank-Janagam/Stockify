// Risk Engine for Layer 3 & 4

export function calculateVaR(portfolioValue, confidenceLevel = 0.95, historicalReturns = []) {
    // Value at Risk (VaR) using historical simulation method
    if (historicalReturns.length === 0) return 0;
    
    // Sort returns lowest to highest
    const sortedReturns = [...historicalReturns].sort((a, b) => a - b);
    
    // Find the index corresponding to the confidence level
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    
    // The VaR is the return at that percentile
    const varReturn = sortedReturns[Math.max(0, index)];
    
    // Return absolute monetary Value at Risk
    return Number((portfolioValue * Math.abs(varReturn)).toFixed(2));
}

export function calculateBeta(assetReturns, benchmarkReturns) {
    // Beta = Covariance(Asset, Benchmark) / Variance(Benchmark)
    if (!assetReturns || !benchmarkReturns || assetReturns.length !== benchmarkReturns.length || assetReturns.length === 0) {
        return 1.0; // Default to market beta
    }
    
    const meanAsset = assetReturns.reduce((a, b) => a + b, 0) / assetReturns.length;
    const meanBench = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
    
    let covariance = 0;
    let varianceBench = 0;
    
    for (let i = 0; i < assetReturns.length; i++) {
        const diffAsset = assetReturns[i] - meanAsset;
        const diffBench = benchmarkReturns[i] - meanBench;
        covariance += diffAsset * diffBench;
        varianceBench += diffBench * diffBench;
    }
    
    if (varianceBench === 0) return 1.0;
    return Number((covariance / varianceBench).toFixed(2));
}

export function calculateSharpeRatio(portfolioReturns, riskFreeRate = 0.05) {
    // Sharpe Ratio = (Expected Return - Risk Free Rate) / Standard Deviation of Portfolio Return
    if (!portfolioReturns || portfolioReturns.length === 0) return 0;
    
    // Convert annual risk free rate to daily (approx 252 trading days)
    const dailyRFR = riskFreeRate / 252;
    
    const meanReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    
    let varSum = 0;
    portfolioReturns.forEach(r => varSum += Math.pow(r - meanReturn, 2));
    const stdDev = Math.sqrt(varSum / portfolioReturns.length);
    
    if (stdDev === 0) return 0;
    
    const sharpe = (meanReturn - dailyRFR) / stdDev;
    // Annualize the Sharpe Ratio
    const annualizedSharpe = sharpe * Math.sqrt(252);
    
    return Number(annualizedSharpe.toFixed(2));
}
