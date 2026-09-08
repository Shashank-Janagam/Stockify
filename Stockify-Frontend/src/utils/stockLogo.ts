// src/utils/stockLogo.ts
const AZURE_BLOB_BASE = "https://mystockifyassets.blob.core.windows.net/assets";

// Local asset bundling removed in favor of Azure Blob Storage

/**
 * Known symbols verified in Azure Blob Storage
 */
const KNOWN_AZURE_LOGOS: Record<string, string> = {
  "^NSEI": `${AZURE_BLOB_BASE}/%5ENSEI.webp`,
  "^BSESN": `${AZURE_BLOB_BASE}/%5EBSESN.webp`,
  "^NSEBANK": `${AZURE_BLOB_BASE}/%5ENSEBANK.webp`,
  "^CNXIT": `${AZURE_BLOB_BASE}/%5ECNXIT.webp`,
  "^CNXFIN": `${AZURE_BLOB_BASE}/%5ECNXFIN.webp`,
  TCS: `${AZURE_BLOB_BASE}/TCS.webp`,
  RELIANCE: `${AZURE_BLOB_BASE}/RELIANCE.png`,
  INFY: `${AZURE_BLOB_BASE}/INFY.png`,
  SBIN: `${AZURE_BLOB_BASE}/SBIN.png`,
  HDFCBANK: `${AZURE_BLOB_BASE}/HDFCBANK.png`,
  ITC: `${AZURE_BLOB_BASE}/ITC.png`,
};

/**
 * Curated High-Clarity Corporate Website Domains for Indian Stocks, ETFs, Mutual Funds, and Indices.
 * Used when a local or blob asset is not available ("go out" to verified Google 128px favicon).
 */
export const COMPANY_DOMAINS: Record<string, string> = {
  // --- Indices & Benchmarks ---
  "^NSEI": "https://www.nseindia.com",
  "^BSESN": "https://www.bseindia.com",
  "^NSEBANK": "https://www.nseindia.com",
  "^CNXIT": "https://www.nseindia.com",
  "^CNXFIN": "https://www.nseindia.com",
  "^CRSMID": "https://www.nseindia.com",
  NIFTY: "https://www.nseindia.com",
  BANKNIFTY: "https://www.nseindia.com",
  FINNIFTY: "https://www.nseindia.com",
  SENSEX: "https://www.bseindia.com",

  // --- Top Mutual Funds & ETFs ---
  NIFTYBEES: "https://mf.nipponindiaim.com",
  BANKBEES: "https://mf.nipponindiaim.com",
  GOLDBEES: "https://mf.nipponindiaim.com",
  SILVERBEES: "https://mf.nipponindiaim.com",
  PHARMABEES: "https://mf.nipponindiaim.com",
  AUTOBEES: "https://mf.nipponindiaim.com",
  ITBEES: "https://mf.nipponindiaim.com",
  JUNIORBEES: "https://mf.nipponindiaim.com",
  CPSEETF: "https://mf.nipponindiaim.com",
  LIQUIDBEES: "https://mf.nipponindiaim.com",
  SMALLIETF: "https://www.icicipruamc.com",
  ICICINIFTY: "https://www.icicipruamc.com",
  SETFNIF50: "https://www.sbimf.com",
  NIFTYAXIS: "https://www.axismf.com",
  GOLDAXIS: "https://www.axismf.com",
  BANKNIFTY1: "https://www.kotakmf.com",
  MIDCAP: "https://www.kotakmf.com",
  MON100: "https://www.motilaloswalmf.com",

  // --- Banking & Financials ---
  HDFCBANK: "https://www.hdfcbank.com",
  ICICIBANK: "https://www.icicibank.com",
  SBIN: "https://www.onlinesbi.sbi",
  KOTAKBANK: "https://www.kotak.com",
  AXISBANK: "https://www.axisbank.com",
  INDUSINDBK: "https://www.indusind.com",
  BAJFINANCE: "https://www.bajajfinserv.in",
  BAJAJFINSV: "https://www.bajajfinserv.in",
  JIOFIN: "https://www.jfs.in",
  BANDHANBNK: "https://www.bandhanbank.com",
  FEDERALBNK: "https://www.federalbank.co.in",
  IDFCFIRSTB: "https://www.idfcfirstbank.com",
  PNB: "https://www.pnbindia.in",
  BANKBARODA: "https://www.bankofbaroda.in",
  CANBK: "https://www.canarabank.com",
  HDFCLIFE: "https://www.hdfclife.com",
  SBILIFE: "https://www.sbilife.co.in",
  ICICIPRULI: "https://www.iciciprulife.com",
  ICICIGI: "https://www.icicilombard.com",
  PFC: "https://www.pfcindia.com",
  RECLTD: "https://www.recindia.nic.in",
  IRFC: "https://www.irfc.co.in",
  MUTHOOTFIN: "https://www.muthootfinance.com",
  CHOLAFIN: "https://www.cholamandalam.com",
  SHRIRAMFIN: "https://www.shriramfinance.in",
  YESBANK: "https://www.yesbank.in",

  // --- IT & Tech ---
  TCS: "https://www.tcs.com",
  INFY: "https://www.infosys.com",
  WIPRO: "https://www.wipro.com",
  HCLTECH: "https://www.hcltech.com",
  TECHM: "https://www.techmahindra.com",
  LTIM: "https://www.ltimindtree.com",
  PERSISTENT: "https://www.persistent.com",
  COFORGE: "https://www.coforge.com",
  MPHASIS: "https://www.mphasis.com",
  KPITTECH: "https://www.kpit.com",
  TATAELXSI: "https://www.tataelxsi.com",
  OFSS: "https://www.oracle.com",
  CYIENT: "https://www.cyient.com",
  ZOMATO: "https://www.zomato.com",
  SWIGGY: "https://www.swiggy.com",
  PAYTM: "https://www.paytm.com",
  ONE97: "https://www.paytm.com",
  NYKAA: "https://www.nykaa.com",
  POLICYBZR: "https://www.policybazaar.com",
  PBFINTECH: "https://www.policybazaar.com",
  DELHIVERY: "https://www.delhivery.com",

  // --- Energy, Oil & Power ---
  RELIANCE: "https://www.ril.com",
  ONGC: "https://www.ongcindia.com",
  IOC: "https://www.iocl.com",
  BPCL: "https://www.bharatpetroleum.in",
  HPCL: "https://www.hindustanpetroleum.com",
  GAIL: "https://www.gailonline.com",
  NTPC: "https://www.ntpc.co.in",
  POWERGRID: "https://www.powergrid.in",
  TATAPOWER: "https://www.tatapower.com",
  ADANIGREEN: "https://www.adanigreenenergy.com",
  ADANIPOWER: "https://www.adanipower.com",
  ATGL: "https://www.adanigas.com",
  COALINDIA: "https://www.coalindia.in",
  SUZLON: "https://www.suzlon.com",
  JSWENERGY: "https://www.jsw.in",

  // --- Auto & Auto Ancillary ---
  TATAMOTORS: "https://www.tatamotors.com",
  MARUTI: "https://www.marutisuzuki.com",
  MM: "https://www.mahindra.com",
  "M&M": "https://www.mahindra.com",
  BAJAJ_AUTO: "https://www.bajajauto.com",
  "BAJAJ-AUTO": "https://www.bajajauto.com",
  EICHERMOT: "https://www.eicher.in",
  HEROMOTOCO: "https://www.heromotocorp.com",
  TVSMOTOR: "https://www.tvsmotor.com",
  BHARATFORG: "https://www.bharatforge.com",
  MRF: "https://www.mrftyres.com",
  APOLLOTYRE: "https://www.apollotyres.com",
  BALKRISIND: "https://www.bkt-tires.com",
  MOTHERSON: "https://www.motherson.com",
  BOSCHLTD: "https://www.bosch.in",

  // --- FMCG, Retail & Consumer ---
  HINDUNILVR: "https://www.hul.co.in",
  ITC: "https://www.itcportal.com",
  NESTLEIND: "https://www.nestle.in",
  BRITANNIA: "https://www.britannia.co.in",
  DABUR: "https://www.dabur.com",
  MARICO: "https://www.marico.com",
  GODREJCP: "https://www.godrejcp.com",
  COLPAL: "https://www.colgatepalmolive.co.in",
  VBL: "https://www.varunpepsi.com",
  TATACONSUM: "https://www.tataconsumer.com",
  TRENT: "https://www.trentlimited.com",
  DMART: "https://www.dmartindia.com",
  AVENUE: "https://www.dmartindia.com",
  TITAN: "https://www.titancompany.in",
  ASIANPAINT: "https://www.asianpaints.com",
  BERGEPAINT: "https://www.bergerpaints.com",
  PIDILITIND: "https://www.pidilite.com",
  PAGEIND: "https://www.pageind.com",
  HAVELLS: "https://www.havells.com",
  VOLTAS: "https://www.voltas.com",
  CROMPTON: "https://www.crompton.co.in",
  POLYCAB: "https://www.polycab.com",
  WESTLIFE: "https://www.westlife.co.in",
  GODFRYPHLP: "https://www.godfreyphillips.com",

  // --- Pharma & Healthcare ---
  SUNPHARMA: "https://www.sunpharma.com",
  DRREDDY: "https://www.drreddys.com",
  CIPLA: "https://www.cipla.com",
  APOLLOHOSP: "https://www.apollohospitals.com",
  DIVISLAB: "https://www.divislabs.com",
  LUPIN: "https://www.lupin.com",
  AUROPHARMA: "https://www.aurobindo.com",
  BIOCON: "https://www.biocon.com",
  TORNTCHEM: "https://www.torrentpharma.com",
  ALKEM: "https://www.alkemlabs.com",
  ZYDUSLIFE: "https://www.zyduslife.com",
  MAXHEALTH: "https://www.maxhealthcare.in",
  FORTIS: "https://www.fortishealthcare.com",

  // --- Metals & Mining ---
  TATASTEEL: "https://www.tatasteel.com",
  JSWSTEEL: "https://www.jsw.in",
  HINDALCO: "https://www.hindalco.com",
  VEDL: "https://www.vedantalimited.com",
  NMDC: "https://www.nmdc.co.in",
  SAIL: "https://www.sail.co.in",
  JINDALSTEL: "https://www.jindalsteelpower.com",
  NATIONALUM: "https://www.nalcoindia.com",

  // --- Infrastructure, Defense, Telecom & Real Estate ---
  LT: "https://www.larsentoubro.com",
  ADANIENT: "https://www.adanienterprises.com",
  ADANIPORTS: "https://www.adaniports.com",
  BHARTIARTL: "https://www.airtel.in",
  TATACOMM: "https://www.tatacommunications.com",
  ULTRACEMCO: "https://www.ultratechcement.com",
  GRASIM: "https://www.grasim.com",
  AMBUJACEM: "https://www.ambujacement.com",
  ACC: "https://www.acclimited.com",
  SHREECEM: "https://www.shreecement.com",
  DLF: "https://www.dlf.in",
  GODREJPROP: "https://www.godrejproperties.com",
  LODHA: "https://www.lodhagroup.in",
  OBEROIRLTY: "https://www.oberoirealty.com",
  PRESTIGE: "https://www.prestigeconstructions.com",
  HAL: "https://www.hal-india.co.in",
  BEL: "https://www.bel-india.in",
  BDL: "https://www.bdl-india.in",
  MAZDOCK: "https://www.mazagondock.in",
  COCHINSHIP: "https://www.cochinshipyard.in",
  BHEL: "https://www.bhel.com",
  SIEMENS: "https://www.siemens.co.in",
  ABB: "https://www.abb.com",
  IRCTC: "https://www.irctc.co.in",
  RVNL: "https://www.rvnl.org",
  INDIGO: "https://www.goindigo.in",
  POKARNA: "https://www.pokarna.com",
};

// ── PERSISTENT MEMORY & LOCALSTORAGE CACHE ──
const LOGO_MEMORY_CACHE = new Map<string, string>();

/**
 * Read cached logo from memory or localStorage
 */
export function getCachedLogo(symbol: string): string | null {
  if (!symbol) return null;
  const clean = symbol.replace(/\.(NS|BO)$/, "").replace(/^NSE_EQ\|/, "").trim().toUpperCase();
  
  if (LOGO_MEMORY_CACHE.has(clean)) {
    const memUrl = LOGO_MEMORY_CACHE.get(clean)!;
    if (memUrl.startsWith(AZURE_BLOB_BASE)) return memUrl;
  }
  
  try {
    const stored = localStorage.getItem(`pb_logo_${clean}`);
    if (stored && stored.startsWith(AZURE_BLOB_BASE)) {
      LOGO_MEMORY_CACHE.set(clean, stored);
      return stored;
    } else if (stored) {
      // Invalidate old localhost/google cached URLs
      localStorage.removeItem(`pb_logo_${clean}`);
    }
  } catch (_) {}
  return null;
}

/**
 * Store verified logo URL in memory and localStorage
 */
export function setCachedLogo(symbol: string, url: string): void {
  if (!symbol || !url) return;
  const clean = symbol.replace(/\.(NS|BO)$/, "").replace(/^NSE_EQ\|/, "").trim().toUpperCase();
  LOGO_MEMORY_CACHE.set(clean, url);
  try {
    localStorage.setItem(`pb_logo_${clean}`, url);
  } catch (_) {}
}

/**
 * Returns prioritized fast candidate logo URLs.
 * Order of resolution:
 * 1. Bundled Local Assets (Instant 0ms from src/assets/)
 * 2. Cached working URL from localStorage
 * 3. Verified Azure Blob Asset
 * 4. "Go Out": Verified High-Resolution Google Favicon (128px) via Curated Domains
 * 5. Dynamic Website Domain (if provided from profile)
 * 6. Azure Blob general fallback
 */
export function getStockLogoCandidates(symbol: string, _domainOrName?: string): string[] {
  if (!symbol) return [];
  const clean = symbol
    .replace(".NS", "")
    .replace(".BO", "")
    .replace(/^NSE_EQ\|/, "")
    .replace(/^BSE_EQ\|/, "")
    .trim()
    .toUpperCase();

  const candidates: string[] = [];

  // Local assets check removed.

  // 2. Cached working URL (From previous successful renders)
  const cached = getCachedLogo(clean);
  if (cached && !candidates.includes(cached)) {
    candidates.push(cached);
  }

  // 3. Known Verified Azure Blob Logo
  if (KNOWN_AZURE_LOGOS[clean] || KNOWN_AZURE_LOGOS[symbol]) {
    const azureUrl = KNOWN_AZURE_LOGOS[clean] || KNOWN_AZURE_LOGOS[symbol];
    if (!candidates.includes(azureUrl)) {
      candidates.push(azureUrl);
    }
  }

  // Removed Google favicon and dynamic domain fallbacks per user request.

  // 6. Azure Blob general fallback check
  const defaultAzure = `${AZURE_BLOB_BASE}/${encodeURIComponent(clean)}.png`;
  if (!candidates.includes(defaultAzure)) {
    candidates.push(defaultAzure);
  }

  return candidates;
}

/**
 * Returns primary logo URL for a symbol
 */
export function getStockLogoSrc(symbol: string): string {
  const candidates = getStockLogoCandidates(symbol);
  return candidates[0] || `${AZURE_BLOB_BASE}/default.png`;
}
