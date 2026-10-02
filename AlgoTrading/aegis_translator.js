/**
 * aegis_translator.js
 * =====================================================================
 * Translates an Aegis Strategy Agent JSON spec into the AlgoTrading
 * JsonStrategy config format that the Python BacktestEngine understands.
 *
 * Aegis Schema:
 *   { name, description, symbol, timeframe, strategy_type,
 *     entry_logic, entry_conditions[], exit_logic, exit_conditions[],
 *     risk_management: { stop_loss_pct, take_profit_pct, trailing_stop_pct, max_position_pct },
 *     assumptions[] }
 *
 * AlgoTrading Schema:
 *   { strategy_name, indicators[], entry_rules:{type,conditions[]},
 *     exit_rules:{type,conditions[]}, risk_management:{stop_loss,take_profit},
 *     position_sizing, portfolio_guardrails }
 */

// ── Operator mapping: Aegis → AlgoTrading comparator type ──────────────────

const OPERATOR_MAP = {
  greater_than:  "GreaterThan",
  less_than:     "LessThan",
  equal_to:      "Equal",
  crosses_above: "CrossAbove",
  crosses_below: "CrossBelow",
  price_above:   "GreaterThan",   // args: ["close", indicator_key]
  price_below:   "LessThan",      // args: ["close", indicator_key]
};

// ── Indicator key generator ─────────────────────────────────────────────────

/**
 * Given an Aegis indicator + params, produce a stable unique key.
 * e.g.  EMA period=20 → "ema_20"
 *       RSI period=14 → "rsi_14"
 *       MACD {}       → "macd"
 *       BB period=20  → "bb_20"
 */
function makeIndicatorKey(indicator, params = {}) {
  const base = indicator.toLowerCase();
  if (params.period) return `${base}_${params.period}`;
  return base;
}

// ── Condition translator ────────────────────────────────────────────────────

/**
 * Translate a single Aegis condition object into an AlgoTrading condition node
 * and register any required indicator in the indicatorMap.
 *
 * @param {Object}  cond         - Aegis condition
 * @param {Map}     indicatorMap - Accumulator: key → { name, key, params }
 * @returns {Object} AlgoTrading condition node { type, args }
 */
function translateCondition(cond, indicatorMap) {
  const { indicator, params = {}, operator, value, reference } = cond;
  const atType = OPERATOR_MAP[operator];

  if (!atType) {
    throw new Error(`[AegisTranslator] Unsupported operator: "${operator}"`);
  }

  // Register the primary indicator
  const indKey = makeIndicatorKey(indicator, params);
  if (!indicatorMap.has(indKey)) {
    indicatorMap.set(indKey, { name: indicator.toUpperCase(), key: indKey, params });
  }

  // --- price_above / price_below: close vs indicator line ---
  if (operator === "price_above" || operator === "price_below") {
    // reference field: { indicator, period } — the line price is compared against
    let refKey;
    if (reference && reference.indicator) {
      const refParams = reference.period ? { period: reference.period } : {};
      refKey = makeIndicatorKey(reference.indicator, refParams);
      if (!indicatorMap.has(refKey)) {
        indicatorMap.set(refKey, {
          name: reference.indicator.toUpperCase(),
          key: refKey,
          params: refParams,
        });
      }
    } else {
      // Fallback: use the primary indicator itself
      refKey = indKey;
    }
    return { type: atType, args: ["close", refKey] };
  }

  // --- crosses_above / crosses_below ---
  if (operator === "crosses_above" || operator === "crosses_below") {
    let secondArg;
    if (reference && reference.indicator) {
      // Indicator vs indicator (e.g., EMA crosses above EMA)
      const refParams = reference.period ? { period: reference.period } : {};
      const refKey = makeIndicatorKey(reference.indicator, refParams);
      if (!indicatorMap.has(refKey)) {
        indicatorMap.set(refKey, {
          name: reference.indicator.toUpperCase(),
          key: refKey,
          params: refParams,
        });
      }
      secondArg = refKey;
    } else if (value === "SIGNAL") {
      // MACD crossing its signal line → use "macd.signal"
      secondArg = `${indKey}.signal`;
    } else if (typeof value === "number") {
      secondArg = value;
    } else {
      secondArg = indKey;
    }
    return { type: atType, args: [indKey, secondArg] };
  }

  // --- Scalar comparisons: greater_than, less_than, equal_to ---
  const scalar = (typeof value === "number") ? value : parseFloat(value);
  if (isNaN(scalar)) {
    throw new Error(
      `[AegisTranslator] Operator "${operator}" requires a numeric "value". Got: ${JSON.stringify(value)}`
    );
  }
  return { type: atType, args: [indKey, scalar] };
}

// ── Risk management translator ──────────────────────────────────────────────

function translateRisk(rm = {}) {
  const result = {};

  if (rm.trailing_stop_pct != null) {
    result.stop_loss = { type: "TRAILING_PCT", value: rm.trailing_stop_pct };
  } else if (rm.stop_loss_pct != null) {
    result.stop_loss = { type: "PCT", value: rm.stop_loss_pct };
  }

  if (rm.take_profit_pct != null) {
    result.take_profit = { type: "PCT", value: rm.take_profit_pct };
  }

  return result;
}

// ── Main translator ─────────────────────────────────────────────────────────

/**
 * translateAegisStrategy
 * Converts an Aegis strategy JSON object into an AlgoTrading strategy_config.
 *
 * @param {Object} aegis  - The raw Aegis strategy JSON
 * @returns {Object}      - AlgoTrading strategy_config ready for JsonStrategy
 */
function translateAegisStrategy(aegis) {
  if (!aegis || typeof aegis !== "object") {
    throw new Error("[AegisTranslator] Input must be a non-null JSON object.");
  }

  const indicatorMap = new Map();

  // Translate entry conditions
  const entryConditions = (aegis.entry_conditions || []).map((c) =>
    translateCondition(c, indicatorMap)
  );

  // Translate exit conditions
  const exitConditions = (aegis.exit_conditions || []).map((c) =>
    translateCondition(c, indicatorMap)
  );

  // Build the AlgoTrading config
  const config = {
    strategy_name: aegis.name || "Aegis Generated Strategy",

    // Indicator declarations (deduplicated, ordered)
    indicators: Array.from(indicatorMap.values()),

    // Entry rule tree
    entry_rules: {
      type: (aegis.entry_logic || "AND").toUpperCase(),
      conditions: entryConditions,
    },

    // Exit rule tree
    exit_rules: {
      type: (aegis.exit_logic || "OR").toUpperCase(),
      conditions: exitConditions,
    },

    // Risk management
    risk_management: translateRisk(aegis.risk_management || {}),

    // Position sizing — sensible defaults, driven by max_position_pct if provided
    position_sizing: {
      mode: "PERCENT_EQUITY",
      percent_equity: (aegis.risk_management || {}).max_position_pct || 10,
    },

    // Portfolio guardrails — safe defaults
    portfolio_guardrails: {
      max_open_positions: 1,
      reentry_cooldown_bars: 2,
    },
  };

  return config;
}

export { translateAegisStrategy };
