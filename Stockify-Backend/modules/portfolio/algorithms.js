export function calculateVWAP(trades) {
    if (!trades || trades.length === 0) return 0;
    
    let totalValue = 0;
    let totalQty = 0;

    for (const t of trades) {
        if (t.side === 'BUY') {
            const qty = Number(t.quantity);
            const price = Number(t.price);
            totalValue += qty * price;
            totalQty += qty;
        }
        // Assuming we only compute VWAP for the buys to determine cost basis.
        // If there are sells, they don't affect the average cost basis of the remaining shares,
        // they just reduce the quantity. Wait, standard VWAP cost basis:
        // Average cost = Total Buy Value / Total Buy Qty.
    }

    if (totalQty === 0) return 0;
    return totalValue / totalQty;
}

export function calculateBullScore(winRate, sharpeRatio, consistencyScore, activityScore) {
    // Bull Score = 0.4 × win_rate + 0.3 × Sharpe + 0.2 × consistency + 0.1 × activity
    // Assuming inputs are normalized (e.g. win_rate 0 to 1, or 0 to 100).
    // Let's assume everything is 0 to 100 for a max score of 100.
    
    // Cap Sharpe component to avoid blowing up the score. E.g., Sharpe of 3 is excellent.
    // If we map Sharpe 0->0, 3->100:
    const normalizedSharpe = Math.min(Math.max((sharpeRatio / 3) * 100, 0), 100);
    
    const bullScore = (0.4 * winRate) + 
                      (0.3 * normalizedSharpe) + 
                      (0.2 * consistencyScore) + 
                      (0.1 * activityScore);
                      
    return Number(bullScore.toFixed(2));
}

export function calculateDynamicCap(baseCap, trades) {
    // Dynamic cap = base_cap × f(weighted_win_rate, 30d/7d/1d windows)
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    
    let w1d_wins = 0, w1d_total = 0;
    let w7d_wins = 0, w7d_total = 0;
    let w30d_wins = 0, w30d_total = 0;

    for (const t of trades) {
        if (t.realized_pnl == null) continue; // Only evaluate closed trades
        const tradeDate = new Date(t.created_at);
        const daysOld = (now - tradeDate) / oneDay;
        const isWin = Number(t.realized_pnl) > 0;

        if (daysOld <= 1) {
            w1d_total++;
            if (isWin) w1d_wins++;
        }
        if (daysOld <= 7) {
            w7d_total++;
            if (isWin) w7d_wins++;
        }
        if (daysOld <= 30) {
            w30d_total++;
            if (isWin) w30d_wins++;
        }
    }

    const rate1d = w1d_total > 0 ? (w1d_wins / w1d_total) : 0.5; // default neutral
    const rate7d = w7d_total > 0 ? (w7d_wins / w7d_total) : 0.5;
    const rate30d = w30d_total > 0 ? (w30d_wins / w30d_total) : 0.5;

    // Time-decay weighted win rate: More recent trades have higher impact
    // Weighting: 1d (50%), 7d (30%), 30d (20%)
    const weightedWinRate = (0.5 * rate1d) + (0.3 * rate7d) + (0.2 * rate30d);
    
    // If win rate is 50%, cap remains base. If win rate drops, cap tightens.
    // Factor: min 0.1 (10% of base), max 2.0 (200% of base)
    let factor = (weightedWinRate / 0.5); 
    factor = Math.max(0.1, Math.min(factor, 2.0));

    return Number((baseCap * factor).toFixed(2));
}

// Allocation algorithms
export function calculateEqualWeightAllocation(symbols, totalCapital) {
    if (!symbols || symbols.length === 0) return {};
    const weight = 1 / symbols.length;
    const allocation = {};
    for (const sym of symbols) {
        allocation[sym] = { weight, allocatedAmount: Number((totalCapital * weight).toFixed(2)) };
    }
    return allocation;
}

// Mock MVO and HRP implementations (full implementations require complex matrix algebra)
// Real implementation would either use Python Pandas/SciPy or a heavy JS math library.
export function calculateMVOAllocation(symbols, historicalPrices, totalCapital) {
    // Mean-Variance Optimization placeholder
    // In practice: requires calculating covariance matrix of returns and running quadratic programming.
    // For now, returning pseudo-MVO inverse-volatility based weights.
    
    // Assuming historicalPrices is an object with { symbol: [prices] }
    const volatilities = {};
    let invVolSum = 0;
    
    for (const sym of symbols) {
        const prices = historicalPrices[sym] || [100, 101, 100]; // mock fallback
        let varSum = 0;
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        prices.forEach(p => varSum += Math.pow(p - mean, 2));
        const variance = varSum / prices.length;
        const vol = Math.sqrt(variance) || 1; 
        
        volatilities[sym] = vol;
        invVolSum += (1 / vol);
    }
    
    const allocation = {};
    for (const sym of symbols) {
        const weight = (1 / volatilities[sym]) / invVolSum;
        allocation[sym] = { weight, allocatedAmount: Number((totalCapital * weight).toFixed(2)) };
    }
    return allocation;
}

export function calculateHRPAllocation(symbols, historicalPrices, totalCapital) {
    // Hierarchical Risk Parity placeholder
    // In practice: distance matrix -> hierarchical clustering -> quasi-diagonalization -> recursive bisection.
    // Returning equal weight for now as placeholder.
    return calculateEqualWeightAllocation(symbols, totalCapital);
}
