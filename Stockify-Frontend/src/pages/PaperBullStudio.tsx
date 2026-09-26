import { useState, useEffect } from 'react';

import '../Styles/PaperBullStudio.css';
import { AlgoBacktestChart } from '../components/charts/AlgoBacktestChart';
import { RecursiveBuilder } from '../components/NestedBuilder';
import StockLogo from '../components/common/StockLogo';
import SearchOverlay from '../components/layout/SearchOverlay';


export default function PaperBullStudio() {

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
  const [datePreset, setDatePreset] = useState('1Y');
  const [capitalPreset, setCapitalPreset] = useState('1L');
  const [stockCategory, setStockCategory] = useState('Popular');
  const [loadBenchmarkIndex, setLoadBenchmarkIndex] = useState(true);
  const [dslTab, setDslTab] = useState('json');
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>('');
  const [hoveredTrade, setHoveredTrade] = useState<any>(null);
  const [savedStrategies, setSavedStrategies] = useState<any[]>([]);
  const [isSavingStrategy, setIsSavingStrategy] = useState(false);
  const [strategyName, setStrategyName] = useState('My Custom Strategy');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{message: string, type: 'success' | 'error' | ''}>({message: '', type: ''});

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

  const handleSaveStrategyPrompt = () => {
    setSaveStatus({message: '', type: ''});
    setShowSaveModal(true);
  };

  const executeSaveStrategy = async (nameToSave: string) => {
    if (!nameToSave.trim()) {
      setSaveStatus({message: 'Please enter a strategy name.', type: 'error'});
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
        tickers
      };
      const res = await fetch(`${HOST}/api/paperbull/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({message: 'Strategy saved successfully!', type: 'success'});
        const stratsRes = await fetch(`${HOST}/api/paperbull/strategies`, {credentials: 'include'});
        const stratsData = await stratsRes.json();
        if (Array.isArray(stratsData)) setSavedStrategies(stratsData);
        setTimeout(() => setShowSaveModal(false), 1500);
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
        stop_loss_pct: 0.05,
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
              <button onClick={() => loadTemplate('RSI_EMA')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">📈 RSI + EMA</button>
              <button onClick={() => loadTemplate('MACD_CROSS')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">📊 MACD Crossover</button>
              <button onClick={() => loadTemplate('BOLLINGER')} className="w-full text-left px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 transition-colors">🌊 Bollinger Bands</button>
              
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
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 font-semibold text-sm">₹</span>
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
    <div className="bg-slate-50 text-slate-800 antialiased min-h-screen p-2 md:p-4 w-full flex flex-col">
      {/* Main Content */}
      <div className="w-full max-w-[1400px] mx-auto flex-1 flex flex-col">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Algorithmic Trading Backtest</h1>
                <p className="text-sm text-slate-500 mt-1">Configure your strategy, select assets, and backtest on historical data.</p>
            </div>
            <div className="flex items-center gap-3">
              {!results && (
                <>
                <button onClick={handleSaveStrategyPrompt} disabled={isSavingStrategy} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm">
                    <i className="fa-solid fa-floppy-disk text-slate-400"></i> {isSavingStrategy ? 'Saving...' : 'Save Preset'}
                </button>
                <button onClick={() => setShowBuilderModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm">
                    <i className="fa-solid fa-gear text-slate-400"></i> Strategy DSL
                </button>
                <button onClick={handleRunOnChart} disabled={isRunning} className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm shadow-brand-500/30">
                    <i className="fa-solid fa-play text-xs"></i> {isRunning ? 'Running...' : 'Run Backtest'}
                </button>
                </>
              )}
            </div>
        </header>

        {/* Layout Grid / Results Layout */}
        {!results ? (
          <div style={{ width: '100%', margin: '0 auto', transition: 'all 0.5s ease' }}>
            {renderConfigCards()}
          </div>
        ) : (
          <div className="pb-results-wrapper">
            {/* Sidebar Controls Panel */}
            <div className="pb-results-sidebar-bar">
              <div className="pb-sidebar-bar-header">
                <span className="pb-sidebar-bar-icon">⚡</span>
                <span className="pb-sidebar-bar-title">Backtest Panel</span>
              </div>
              
              <button className="pb-sidebar-action-btn" onClick={() => setShowConfigModal(true)} title="Modify Parameters & Asset Selection">
                <span className="icon">🎛️</span>
                <div className="text-wrap">
                  <span className="text-title">1 & 2. Setup Pop-up</span>
                  <span className="text-sub">{tickers.length} Assets • {datePreset}</span>
                </div>
              </button>

              <button className="pb-sidebar-action-btn" onClick={() => setShowBuilderModal(true)} title="Configure Strategy Conditions">
                <span className="icon">⚙️</span>
                <div className="text-wrap">
                  <span className="text-title">Edit Strategy</span>
                  <span className="text-sub">Conditions & DSL</span>
                </div>
              </button>

              <button className="pb-sidebar-action-btn primary" onClick={handleRunOnChart} disabled={isRunning} title="Re-run Backtest">
                <span className="icon">▶</span>
                <div className="text-wrap">
                  <span className="text-title">{isRunning ? 'Running...' : 'Re-run Backtest'}</span>
                  <span className="text-sub">Update results</span>
                </div>
              </button>

              <div className="pb-sidebar-divider" />

              <button className="pb-sidebar-action-btn secondary" onClick={() => setResults(null)} title="Return to Setup View">
                <span className="icon">↩</span>
                <div className="text-wrap">
                  <span className="text-title">Full Setup View</span>
                  <span className="text-sub">Expand 1 & 2 inline</span>
                </div>
              </button>
            </div>

            {/* Results Grid (Expanded Full Stage) */}
            <div className="pb-grid-2col-results pb-results-full-stage">


          {results && (
            <>
              {/* Column 2: Chart Area */}
              <div className="pb-col pb-col-2" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
            <div className="pb-panel" style={{ flex: 1 }}>
              <div className="pb-panel-header">
                <span>Backtest Performance</span>
                {results && results.stock_reports && results.stock_reports.length > 1 && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    {results.stock_reports.map((r: any) => (
                      <button 
                        key={r.ticker} 
                        onClick={() => setSelectedChartTicker(r.ticker)}
                        className="pb-chip"
                        style={{ background: selectedChartTicker === r.ticker ? 'var(--pb-blue)' : 'var(--pb-bg)', color: selectedChartTicker === r.ticker ? 'white' : 'var(--pb-text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <StockLogo
                          symbol={r.ticker}
                          fallbackToAvatar={true}
                          style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                        />
                        {r.ticker.replace('.NS','').replace('.BO','')} Chart
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="pb-panel-content">
                <div className="pb-chart-stats">
                  <div className="pb-c-stat">
                    <span className="title">Portfolio Total Return</span>
                    <span className={`val ${results?.portfolio_summary?.roi >= 0 ? 'green' : 'red'}`}>
                      {results?.portfolio_summary ? (results.portfolio_summary.roi > 0 ? '+' : '') + results.portfolio_summary.roi + '%' : '---'}
                    </span>
                  </div>
                  <div className="pb-c-stat">
                    <span className="title">Portfolio Final Value</span>
                    <span className="val" style={{ color: 'var(--pb-green)' }}>
                       {results?.portfolio_summary ? '₹' + results.portfolio_summary.final_capital.toLocaleString() : '---'}
                    </span>
                  </div>
                  <div className="pb-c-stat">
                    <span className="title">Max Drawdown</span>
                    <span className="val red">-12.3%</span>
                  </div>
                  <div className="pb-c-stat">
                    <span className="title">Total Portfolio Trades</span>
                    <span className="val">{results?.portfolio_summary ? results.portfolio_summary.trades : '---'}</span>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: '350px', position: 'relative' }}>
                  {results && results.stock_reports && results.stock_reports.length > 0 ? (() => {
                    const activeReport = results.stock_reports.find((r:any) => r.ticker === selectedChartTicker) || results.stock_reports[0];
                    
                    const indicatorKeySet = new Set<string>();
                    (activeReport.price_history || []).forEach((d: any) => {
                      Object.keys(d).forEach(k => {
                        if (k !== 'date' && k !== 'price') {
                          indicatorKeySet.add(k);
                        }
                      });
                    });
                    const indicatorKeys = Array.from(indicatorKeySet);
                    const hasRsi = indicatorKeys.some(k => k.toLowerCase().includes('rsi'));
                    const hasThresholds = indicatorKeys.some(k => k.toLowerCase().startsWith('threshold'));
                    const extendedKeys = [...indicatorKeys];

                    // If RSI indicator exists but no threshold was in strategy conditions, provide standard 70 & 30
                    if (hasRsi && !hasThresholds) {
                      extendedKeys.push('Threshold_70', 'Threshold_30');
                    }

                    const indicatorSeries = extendedKeys.map((k, i) => {
                      const colors = [
                        '#6366f1', // Indigo
                        '#f59e0b', // Amber / Gold
                        '#06b6d4', // Cyan
                        '#ec4899', // Pink
                        '#8b5cf6', // Violet
                        '#14b8a6', // Teal
                        '#f97316', // Bright Orange
                        '#3b82f6'  // Electric Blue
                      ];

                      const isThreshold = k.toLowerCase().startsWith('threshold');
                      const threshMatch = k.match(/\d+(\.\d+)?/);
                      const threshNum = threshMatch ? parseFloat(threshMatch[0]) : null;

                      let color = colors[i % colors.length];
                      if (isThreshold && threshNum != null) {
                        color = threshNum >= 50 ? '#ef4444' : '#10b981';
                      }

                      const formattedLabel = isThreshold && threshNum != null
                        ? `Threshold (${threshNum})`
                        : k
                            .replace(/^indicator_/i, '')
                            .replace(/period(\d+)/i, '($1)')
                            .replace(/_/g, ' ')
                            .trim();

                      return {
                        key: k,
                        label: formattedLabel,
                        color,
                        width: isThreshold ? 1.5 : 2,
                        values: activeReport.price_history.map((d: any) => ({
                          x: new Date(d.date).getTime(),
                          y: d[k] !== undefined && d[k] !== null
                            ? d[k]
                            : (isThreshold && threshNum != null ? threshNum : null)
                        })).filter((d: any) => d.y !== undefined && d.y !== null)
                      };
                    });

                    return (
                      <div style={{ width: "100%", height: "100%", paddingTop: "10px" }}>
                        <AlgoBacktestChart
                          indicatorSeries={indicatorSeries}
                          lineData={activeReport.price_history.map((d: any) => ({
                            x: new Date(d.date).getTime(),
                            y: d.price
                          }))}
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
                        />
                      </div>
                    );
                  })() : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--pb-text-muted)' }}>
                       {isRunning ? 'Backtesting Portfolio...' : (results?.detail || results?.error ? <span style={{color:'var(--pb-red)'}}>{JSON.stringify(results.detail || results.error)}</span> : 'Click "Run Backtest" to begin')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Summary & Log */}
          <div className="pb-col pb-col-3" style={{ animation: 'fadeIn 0.5s ease forwards' }}>
            {(() => {
              const activeReport = results?.stock_reports?.find((r:any) => r.ticker === selectedChartTicker) || results?.stock_reports?.[0];
              
              return (
                <>
            <div className="pb-panel">
              <div className="pb-panel-header">
                {results && results.stock_reports && results.stock_reports.length > 0 
                  ? `${selectedChartTicker || results.stock_reports[0].ticker} Summary` 
                  : 'Strategy Summary'}
              </div>
              <div className="pb-panel-content">
                      <div className="pb-summary-row">
                        <span>Initial Capital</span>
                        <span>₹{activeReport ? activeReport.summary.initial_capital.toLocaleString() : capital.toLocaleString()}</span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Final Value</span>
                        <span>₹{activeReport ? activeReport.summary.final_capital.toLocaleString() : '---'}</span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Return (ROI)</span>
                        <span style={{color: activeReport?.summary?.roi >= 0 ? 'var(--pb-green)' : 'var(--pb-red)'}}>
                          {activeReport ? (activeReport.summary.roi > 0 ? '+' : '') + activeReport.summary.roi + '%' : '---'}
                        </span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Total P&L</span>
                        <span style={{color: activeReport?.summary?.total_pnl >= 0 ? 'var(--pb-green)' : 'var(--pb-red)'}}>
                          {activeReport ? '₹' + activeReport.summary.total_pnl.toLocaleString() : '---'}
                        </span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Max Drawdown</span>
                        <span style={{color: 'var(--pb-red)'}}>-12.3%</span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Win Rate</span>
                        <span style={{color: 'var(--pb-green)'}}>58.1%</span>
                      </div>
                      <div className="pb-summary-row">
                        <span>Total Trades</span>
                        <span>{activeReport ? activeReport.summary.trades : '---'}</span>
                      </div>
              </div>
            </div>
            {/* Trade History List */}
            {activeReport?.trade_log && activeReport.trade_log.length > 0 && (
              <div className="pb-panel" style={{ marginTop: '20px', animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
                <div className="pb-panel-header" style={{ flexShrink: 0 }}>
                  Trade History
                </div>
                <div className="pb-panel-content" style={{ padding: '0', overflowY: 'auto', flex: 1 }}>
                  {activeReport.trade_log.map((t: any, index: number) => (
                    <div key={index} style={{ padding: '15px', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.2s', background: hoveredTrade?.originalIndex === index ? '#f8fafc' : 'white' }}
                         onMouseEnter={() => setHoveredTrade({
                           x: new Date(t.date).getTime(),
                           y: t.price,
                           side: t.type === 'BUY' ? 'BUY' : 'SELL',
                           quantity: t.shares || 1,
                           pnl: t.pnl,
                           reason: t.reason,
                           originalIndex: index
                         })}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '24px', height: '24px', borderRadius: '4px',
                            background: t.type === 'BUY' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: t.type === 'BUY' ? '#10b981' : '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px'
                          }}>
                            {t.type === 'BUY' ? 'B' : (t.type === 'SELL' ? 'S' : 'P')}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--pb-text-main)' }}>
                             ₹{Number(t.price).toFixed(2)}
                          </span>
                        </div>
                        <span style={{ color: 'var(--pb-text-muted)', fontSize: '11px' }}>
                           {new Date(t.date).toLocaleString("en-US", { timeZone: "UTC", month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--pb-text-muted)', marginBottom: '8px' }}>
                         <span>Shares: {t.shares || 1}</span>
                         {t.pnl !== undefined && t.pnl !== 0 && (
                            <span style={{ fontWeight: 600, color: t.pnl > 0 ? '#10b981' : '#ef4444' }}>
                              {t.pnl > 0 ? '+' : ''}₹{Number(t.pnl).toFixed(2)}
                            </span>
                         )}
                      </div>

                      {t.reason && (
                        <div style={{ background: 'white', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#6366f1', fontStyle: 'italic', wordBreak: 'break-word' }}>
                          {t.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
                </>
              );
            })()}
          </div>
            </>
          )}
        </div>
      </div>
      )}
      </div>

      {showBuilderModal && (
        <div className="pb-modal-overlay">
          <div className="pb-modal">
            <div className="pb-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '36px', height: '36px', background: '#eff6ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pb-blue)', fontSize: '20px' }}>📈</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Strategy Builder</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Create buy and sell conditions using indicators and logic.</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div className="pb-dsl-tabs" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
                  <div className={`pb-dsl-tab ${dslTab === 'visual' ? 'active' : ''}`} onClick={() => setDslTab('visual')}>Visual Builder</div>
                  <div className={`pb-dsl-tab ${dslTab === 'json' ? 'active' : ''}`} onClick={() => setDslTab('json')}>DSL (JSON)</div>
                  <div className={`pb-dsl-tab ${dslTab === 'guide' ? 'active' : ''}`} onClick={() => setDslTab('guide')}>📘 DSL Guide</div>
                </div>
                <span style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '20px' }} onClick={() => setShowBuilderModal(false)}>✕</span>
              </div>
            </div>

            <div className="pb-modal-body" style={{ display: dslTab === 'guide' ? 'block' : undefined }}>
              {dslTab === 'guide' ? (
                <div style={{ padding: '20px 40px', color: '#1e293b', overflowY: 'auto', maxHeight: '550px', lineHeight: '1.6' }}>
                   <h3 style={{ marginTop: 0 }}>AlgoTrading Strategy Builder (JSON DSL Guide)</h3>
                   <p>The strategy evaluator uses a highly flexible JSON-based Domain Specific Language (DSL). This allows you to construct complex trading rules by linking different technical indicators.</p>
                   
                   <h4 style={{ marginTop: '30px' }}>1. Core Structure</h4>
                   <p>Every strategy (both BUY and SELL) is wrapped in a Logical Condition block. This dictates how multiple comparison conditions are evaluated together.</p>
                   <pre style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e2e8f0' }}>
{`{
  "operator": "AND", // Can be "AND" or "OR"
  "conditions": [
    // List of comparison rules goes here...
  ]
}`}
                   </pre>

                   <h4 style={{ marginTop: '30px' }}>2. Multi-Column Indicators (MACD, Bollinger Bands)</h4>
                   <p>Some indicators generate multiple data series (e.g., MACD has a MACD line, a Signal line, and a Histogram). To evaluate these, you <b>must</b> specify which <code>column</code> to use inside the <code>params</code> block.</p>

                   <h5 style={{ marginTop: '20px' }}>MACD Crossover Example:</h5>
                   <p>Comparing the <code>macd</code> line against the <code>macd_signal</code> line.</p>
                   <pre style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e2e8f0' }}>
{`{
  "indicator": "MACD",
  "params": {
    "fast": 12,
    "slow": 26,
    "signal": 9,
    "column": "macd"
  },
  "comparison": ">",
  "value": {
    "indicator": "MACD",
    "params": {
      "fast": 12,
      "slow": 26,
      "signal": 9,
      "column": "macd_signal"
    }
  }
}`}
                   </pre>

                   <h4 style={{ marginTop: '30px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>3. Function & Indicator Dictionary</h4>
                   <p style={{ fontSize: '13px' }}>The following technical analysis functions are natively available in the python backtesting engine. When a function returns a "Single Series", you do not need to specify a <code>column</code> parameter.</p>
                   <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#f8fafc', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                     <thead style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                       <tr>
                         <th style={{ padding: '12px 16px' }}>Indicator</th>
                         <th style={{ padding: '12px 16px' }}>Description</th>
                         <th style={{ padding: '12px 16px' }}>Required Params</th>
                         <th style={{ padding: '12px 16px' }}>Returns / Columns</th>
                       </tr>
                     </thead>
                     <tbody>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>Close</td>
                         <td style={{ padding: '12px 16px' }}>The closing price of the asset.</td>
                         <td style={{ padding: '12px 16px' }}><code>{}</code> (Empty)</td>
                         <td style={{ padding: '12px 16px' }}>Single Series</td>
                       </tr>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>SMA</td>
                         <td style={{ padding: '12px 16px' }}>Simple Moving Average.</td>
                         <td style={{ padding: '12px 16px' }}><code>period</code> (int)</td>
                         <td style={{ padding: '12px 16px' }}>Single Series</td>
                       </tr>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>EMA</td>
                         <td style={{ padding: '12px 16px' }}>Exponential Moving Average.</td>
                         <td style={{ padding: '12px 16px' }}><code>period</code> (int)</td>
                         <td style={{ padding: '12px 16px' }}>Single Series</td>
                       </tr>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>RSI</td>
                         <td style={{ padding: '12px 16px' }}>Relative Strength Index. Momentum oscillator.</td>
                         <td style={{ padding: '12px 16px' }}><code>period</code> (int)</td>
                         <td style={{ padding: '12px 16px' }}>Single Series</td>
                       </tr>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>MACD</td>
                         <td style={{ padding: '12px 16px' }}>Moving Average Convergence Divergence.</td>
                         <td style={{ padding: '12px 16px' }}><code>fast</code> (int)<br/><code>slow</code> (int)<br/><code>signal</code> (int)</td>
                         <td style={{ padding: '12px 16px' }}>Requires <code>column</code>:<br/>- <code>macd</code><br/>- <code>macd_signal</code><br/>- <code>macd_hist</code></td>
                       </tr>
                       <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>BOLLINGER</td>
                         <td style={{ padding: '12px 16px' }}>Bollinger Bands. Volatility bands.</td>
                         <td style={{ padding: '12px 16px' }}><code>period</code> (int)<br/><code>std_dev</code> (float)</td>
                         <td style={{ padding: '12px 16px' }}>Requires <code>column</code>:<br/>- <code>upper</code><br/>- <code>lower</code><br/>- <code>mid</code></td>
                       </tr>
                       <tr>
                         <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>OBI</td>
                         <td style={{ padding: '12px 16px' }}>Order Book Imbalance (Bid vs Ask volume).</td>
                         <td style={{ padding: '12px 16px' }}><code>{}</code> (Auto-infers volumes)</td>
                         <td style={{ padding: '12px 16px' }}>Single Series</td>
                       </tr>
                     </tbody>
                   </table>
                </div>
              ) : (
              <>
              <div className="pb-modal-col-left">
                <div className="pb-step">
                  <div className="pb-step-header">
                    <div className="pb-step-num">1</div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Strategy Settings <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '5px' }}>Set basic details</span></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', paddingLeft: '40px' }}>
                    <div className="pb-form-group"><label>Strategy Name</label><input type="text" className="pb-input" style={{ width: '100%' }} value={strategyName} onChange={(e) => setStrategyName(e.target.value)} /></div>
                    <div className="pb-form-group"><label>Timeframe</label><select className="pb-select" style={{ width: '100%' }}><option>1 Day</option><option>1 Hour</option></select></div>
                    <div className="pb-form-group"><label>Position Type</label><select className="pb-select" style={{ width: '100%' }}><option>Long Only</option><option>Long & Short</option></select></div>
                  </div>
                </div>

                <div className="pb-step">
                  <div className="pb-step-header">
                    <div className="pb-step-num" style={{ background: '#10b981' }}>2</div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Build Buy Condition <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '5px' }}>Define when to enter</span></div>
                  </div>
                  <div style={{ paddingLeft: '40px' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 'bold', marginBottom: '8px' }}>BUY Logic</div>
                      <RecursiveBuilder dslString={buyDsl} onChange={setBuyDsl} color="#15803d" />
                    </div>
                  </div>
                </div>

                <div className="pb-step" style={{ marginBottom: 0 }}>
                  <div className="pb-step-header">
                    <div className="pb-step-num" style={{ background: '#ef4444' }}>3</div>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>Build Sell Condition <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '5px' }}>Define when to exit</span></div>
                  </div>
                  <div style={{ paddingLeft: '40px' }}>
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 'bold', marginBottom: '8px' }}>SELL Logic</div>
                      <RecursiveBuilder dslString={sellDsl} onChange={setSellDsl} color="#b91c1c" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pb-modal-col-right">
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Strategy Preview (DSL JSON)</span>
                  <button className="pb-btn" style={{ padding: '4px 8px', fontSize: '11px', background: 'var(--pb-bg)', color: 'var(--pb-text-muted)' }} onClick={copyToClipboard}>📋 Copy</button>
                </div>
                
                {dslTab === 'visual' ? (
                   <div className="pb-json-editor" style={{ marginBottom: '0px' }}>
                      <div style={{ color: '#818cf8', marginBottom: '10px' }}>// BUY LOGIC</div>
                      <pre style={{ margin: 0 }}>{buyDsl}</pre>
                      <div style={{ color: '#f87171', marginTop: '20px', marginBottom: '10px' }}>// SELL LOGIC</div>
                      <pre style={{ margin: 0 }}>{sellDsl}</pre>
                   </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: '12px', color: '#10b981', marginBottom: '5px' }}>BUY Logic</div>
                      <textarea className="pb-json-editor" style={{ margin: 0, resize: 'none', width: '100%' }} value={buyDsl} onChange={handleBuyDslChange} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '5px' }}>SELL Logic</div>
                      <textarea className="pb-json-editor" style={{ margin: 0, resize: 'none', width: '100%' }} value={sellDsl} onChange={handleSellDslChange} />
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    💡 Quick Templates
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }} onClick={() => loadTemplate("RSI_EMA")}>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--pb-blue)', marginBottom: '4px' }}>📈 RSI + EMA</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Mean reversion & trend</div>
                    </div>
                    <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }} onClick={() => loadTemplate("MACD_CROSS")}>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: '#10b981', marginBottom: '4px' }}>📊 MACD Crossover</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>MACD vs Signal line</div>
                    </div>
                    <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }} onClick={() => loadTemplate("BOLLINGER")}>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: '#8b5cf6', marginBottom: '4px' }}>🌊 Bollinger Bands</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>Breakout / Reversion</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    💾 Saved Strategies
                  </div>
                  {savedStrategies.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>No saved strategies found.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {savedStrategies.map(strat => (
                        <div key={strat._id} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }} onClick={() => loadSavedStrategy(strat)}>
                          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--pb-blue)', marginBottom: '4px' }}>{strat.name}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{new Date(strat.createdAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </>
              )}
            </div>

            <div className="pb-modal-footer">
              <button className="pb-btn" style={{ color: '#64748b' }} onClick={() => { setBuyDsl("{}"); setSellDsl("{}"); }}>↺ Reset</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="pb-btn" onClick={handleSaveStrategyPrompt} disabled={isSavingStrategy} style={{ background: '#10b981', color: 'white', border: 'none' }}>{isSavingStrategy ? 'Saving...' : 'Save Strategy'}</button>
                <button className="pb-btn" onClick={() => setShowBuilderModal(false)}>Cancel</button>
                <button className="pb-btn primary" style={{ padding: '8px 24px' }} onClick={() => setShowBuilderModal(false)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="pb-modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="pb-config-popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="pb-config-popup-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="pb-header-icon-box" style={{ background: '#e0e7ff', color: '#4f46e5', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  🎛️
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Backtest Parameters & Stock Selection</h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>Modify dates, initial capital, benchmark index, or selected assets</p>
                </div>
              </div>
              <button className="pb-modal-close-btn" onClick={() => setShowConfigModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="pb-config-popup-body">
              {renderConfigCards()}
            </div>

            <div className="pb-config-popup-footer">
              <button className="pb-btn secondary" onClick={() => setShowConfigModal(false)}>Close</button>
              <button className="pb-configure-btn-main" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => { setShowConfigModal(false); handleRunOnChart(); }}>
                <span>▶ Apply & Re-run Backtest</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <SearchOverlay
        isOpen={isSearchOverlayOpen}
        onClose={() => setIsSearchOverlayOpen(false)}
        onSelectStock={(stock) => handleSelectSuggestion(stock.symbol)}
      />

      {showSaveModal && (
        <div className="pb-modal-overlay">
          <div className="pb-modal" style={{ maxWidth: '400px', margin: '20vh auto', width: '90%', height: 'auto' }}>
            <div className="pb-modal-header" style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>💾 Save Strategy Preset</h3>
               <button onClick={() => setShowSaveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#94a3b8' }}>✕</button>
            </div>
            <div className="pb-modal-body" style={{ padding: '20px', display: 'block' }}>
               <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>Strategy Name</label>
               <input type="text" className="pb-input" style={{ width: '100%', marginBottom: '15px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} value={strategyName} onChange={e => setStrategyName(e.target.value)} placeholder="e.g. My Momentum Strategy" />
               
               {saveStatus.message && (
                  <div style={{ marginBottom: '5px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: saveStatus.type === 'success' ? '#f0fdf4' : '#fef2f2', color: saveStatus.type === 'success' ? '#15803d' : '#b91c1c', border: `1px solid ${saveStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                    {saveStatus.message}
                  </div>
               )}
            </div>
            <div className="pb-modal-footer" style={{ padding: '15px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#f8fafc', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
               <button className="pb-btn" style={{ padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowSaveModal(false)}>Cancel</button>
               <button className="pb-btn primary" style={{ padding: '8px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }} onClick={() => executeSaveStrategy(strategyName)} disabled={isSavingStrategy}>
                 {isSavingStrategy ? 'Saving...' : 'Confirm & Save'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
