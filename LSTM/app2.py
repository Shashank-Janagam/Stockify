"""
Stockify v2 -- XGBoost Ensemble Signal Dashboard  +  Groq LLM Re-Verification
app2.py  |  Streamlit frontend for server2 (FastAPI port 8001)

Run the backend first:
    uvicorn server2:app --reload --port 8001

Then run this:
    streamlit run app2.py
"""

import streamlit as st
import requests
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as mticker
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
API_URL = "http://127.0.0.1:8001"

st.set_page_config(
    page_title="Stockify v2 – XGBoost + AI Signal",
    layout="wide",
    page_icon="📈",
    initial_sidebar_state="collapsed",
)

# ─────────────────────────────────────────────────────────────────────────────
# DESIGN TOKENS
# ─────────────────────────────────────────────────────────────────────────────
BG        = "#0a0e17"
SURFACE   = "#111827"
SURFACE2  = "#1a2235"
BORDER    = "#1f2d45"
BORDER2   = "#2a3f5f"

GREEN       = "#00d68f"
GREEN_DIM   = "#00a36c"
GREEN_GLOW  = "#007a50"
RED         = "#ff4757"
RED_DIM     = "#cc3344"
AMBER       = "#ffd166"
AMBER_LIGHT = "#ffe08a"
BLUE        = "#4facfe"
BLUE_DIM    = "#1e7fcb"
PURPLE      = "#a78bfa"
CYAN        = "#00f5ff"
VIOLET      = "#7c3aed"

MUTED    = "#6b7fa3"
TEXT     = "#e2e8f0"
TEXT_DIM = "#4a5568"

# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL CSS
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

.stApp {{
    background: linear-gradient(135deg, {BG} 0%, #0d1526 50%, {BG} 100%);
    color: {TEXT};
    font-family: 'Inter', sans-serif;
}}
.block-container {{ padding: 1.4rem 2.2rem 5rem !important; max-width: 1600px !important; }}

/* Header */
.s2-header {{
    background: linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(79,172,254,0.06) 100%);
    border: 1px solid {BORDER2};
    border-radius: 16px;
    padding: 24px 32px 20px;
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
}}
.s2-header::before {{
    content: '';
    position: absolute;
    top: -40%;
    right: -10%;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(0,214,143,0.08) 0%, transparent 70%);
    pointer-events: none;
}}
.s2-title {{
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, {GREEN} 0%, {BLUE} 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 6px;
}}
.s2-subtitle {{ font-size: 14px; color: {MUTED}; margin: 0; line-height: 1.5; }}

/* Divider */
.s2-div {{ border: none; border-top: 1px solid {BORDER}; margin: 1.2rem 0; }}

/* Signal badge */
.s2-signal {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    border-radius: 50px;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
}}
.s2-signal.buy  {{ background: rgba(0,214,143,0.12); border: 2px solid {GREEN};
                   color: {GREEN}; box-shadow: 0 0 30px rgba(0,214,143,0.2); }}
.s2-signal.sell {{ background: rgba(255,71,87,0.12);  border: 2px solid {RED};
                   color: {RED};   box-shadow: 0 0 30px rgba(255,71,87,0.2); }}
.s2-signal.hold {{ background: rgba(255,209,102,0.10); border: 2px solid {AMBER};
                   color: {AMBER}; box-shadow: 0 0 30px rgba(255,209,102,0.15); }}
.s2-signal.caution {{ background: rgba(167,139,250,0.12); border: 2px solid {PURPLE};
                      color: {PURPLE}; box-shadow: 0 0 30px rgba(167,139,250,0.2); }}

/* Metric cards */
.s2-metric {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 12px;
    padding: 18px 20px;
    text-align: center;
    transition: border-color .2s, transform .2s;
}}
.s2-metric:hover {{ border-color: {BORDER2}; transform: translateY(-2px); }}
.s2-metric-label {{ font-size: 10px; text-transform: uppercase; letter-spacing: .1em;
                    color: {MUTED}; margin-bottom: 8px; }}
.s2-metric-value {{ font-size: 22px; font-weight: 700; color: {TEXT}; }}
.s2-metric-sub   {{ font-size: 11px; color: {MUTED}; margin-top: 4px; }}

/* Gauge container */
.gauge-wrap {{ text-align: center; padding: 10px 0 4px; }}
.gauge-pct  {{ font-family: 'JetBrains Mono', monospace; font-size: 36px;
               font-weight: 700; margin: 0; }}
.gauge-label {{ font-size: 11px; color: {MUTED}; text-transform: uppercase;
                letter-spacing: .08em; }}

/* Indicator pills */
.ind-row {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }}
.ind-pill {{
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    border: 1px solid;
}}
.ind-bull {{ background: rgba(0,214,143,.1); color: {GREEN}; border-color: rgba(0,214,143,.3); }}
.ind-bear {{ background: rgba(255,71,87,.1);  color: {RED};   border-color: rgba(255,71,87,.3); }}
.ind-neut {{ background: rgba(107,127,163,.1);color: {MUTED}; border-color: rgba(107,127,163,.3); }}
.ind-info {{ background: rgba(79,172,254,.1); color: {BLUE};  border-color: rgba(79,172,254,.3); }}
.ind-ai   {{ background: rgba(167,139,250,.1); color: {PURPLE}; border-color: rgba(167,139,250,.3); }}

/* Section headings */
.s2-section-head {{
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: {MUTED};
    margin: 16px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid {BORDER};
}}

/* ── AI Analysis Panel ─────────────────────────────────────────────────── */
.ai-panel {{
    background: linear-gradient(135deg, rgba(124,58,237,0.07) 0%, rgba(79,172,254,0.05) 100%);
    border: 1px solid rgba(124,58,237,0.35);
    border-radius: 16px;
    padding: 24px 28px;
    margin: 20px 0;
    position: relative;
    overflow: hidden;
}}
.ai-panel::before {{
    content: '';
    position: absolute;
    top: -30%;
    left: -5%;
    width: 250px; height: 250px;
    background: radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%);
    pointer-events: none;
}}
.ai-panel-header {{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
}}
.ai-panel-title {{
    font-size: 16px;
    font-weight: 700;
    color: {PURPLE};
    letter-spacing: 0.02em;
}}
.ai-badge {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 50px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    border: 1px solid;
}}
.ai-badge-model {{
    background: rgba(124,58,237,0.12);
    color: {PURPLE};
    border-color: rgba(124,58,237,0.4);
}}
.ai-verdict-row {{
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 18px;
}}
.ai-verdict {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    border-radius: 50px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 2px;
}}
.ai-verdict.buy    {{ background: rgba(0,214,143,0.12); border: 2px solid {GREEN}; color: {GREEN}; }}
.ai-verdict.sell   {{ background: rgba(255,71,87,0.12); border: 2px solid {RED}; color: {RED}; }}
.ai-verdict.hold   {{ background: rgba(255,209,102,0.10); border: 2px solid {AMBER}; color: {AMBER}; }}
.ai-verdict.caution {{ background: rgba(167,139,250,0.12); border: 2px solid {PURPLE}; color: {PURPLE}; }}

.ai-conf-box {{
    text-align: center;
    padding: 8px 18px;
    border-radius: 10px;
    border: 1px solid {BORDER2};
    background: {SURFACE};
}}
.ai-conf-label {{ font-size: 10px; color: {MUTED}; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }}
.ai-conf-value {{ font-size: 20px; font-weight: 700; }}
.ai-conf-high   {{ color: {GREEN}; }}
.ai-conf-medium {{ color: {AMBER}; }}
.ai-conf-low    {{ color: {RED}; }}

.ai-risk-box {{
    text-align: center;
    padding: 8px 18px;
    border-radius: 10px;
    border: 1px solid {BORDER2};
    background: {SURFACE};
}}
.ai-risk-label {{ font-size: 10px; color: {MUTED}; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }}
.ai-risk-value {{ font-size: 20px; font-weight: 700; }}
.ai-risk-high   {{ color: {RED}; }}
.ai-risk-medium {{ color: {AMBER}; }}
.ai-risk-low    {{ color: {GREEN}; }}

.ai-rationale {{
    background: {SURFACE};
    border-left: 3px solid {PURPLE};
    border-radius: 0 10px 10px 0;
    padding: 14px 18px;
    font-size: 14px;
    color: {TEXT};
    line-height: 1.7;
    margin-bottom: 16px;
}}

.ai-factors {{
    display: flex;
    flex-direction: column;
    gap: 8px;
}}
.ai-factor {{
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(124,58,237,0.05);
    border: 1px solid rgba(124,58,237,0.15);
    border-radius: 8px;
    font-size: 13px;
    color: {TEXT};
    line-height: 1.5;
}}
.ai-factor-icon {{ color: {PURPLE}; font-size: 14px; flex-shrink: 0; margin-top: 1px; }}

.ai-disclaimer {{
    font-size: 11px;
    color: {TEXT_DIM};
    font-style: italic;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid {BORDER};
}}

.ai-unavailable {{
    text-align: center;
    padding: 20px;
    color: {MUTED};
    font-size: 13px;
}}

/* Agreement / Disagreement banner */
.ai-agree {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
}}
.ai-agree.yes {{ background: rgba(0,214,143,0.1); color: {GREEN}; border: 1px solid rgba(0,214,143,0.3); }}
.ai-agree.no  {{ background: rgba(255,71,87,0.1); color: {RED}; border: 1px solid rgba(255,71,87,0.3); }}

/* Streamlit overrides */
h1, h2, h3, h4 {{ color: {TEXT} !important; font-weight: 600 !important; }}

div[data-testid="stTextInput"] > div > div > input {{
    background: {SURFACE2} !important;
    border: 1px solid {BORDER2} !important;
    border-radius: 8px 0 0 8px !important;
    color: {TEXT} !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    padding: 12px 18px !important;
    caret-color: {GREEN} !important;
}}
div[data-testid="stTextInput"] > div > div > input:focus {{
    border-color: {GREEN_DIM} !important;
    box-shadow: 0 0 0 3px rgba(0,214,143,.12) !important;
}}
div[data-testid="stTextInput"] > div > div > input::placeholder {{
    color: {TEXT_DIM} !important;
}}

div[data-testid="metric-container"] {{
    background: {SURFACE} !important;
    border: 1px solid {BORDER} !important;
    border-radius: 12px !important;
    padding: 16px 18px !important;
}}
div[data-testid="metric-container"] label {{
    color: {MUTED} !important; font-size: 10px !important;
    text-transform: uppercase; letter-spacing: .09em;
}}
div[data-testid="metric-container"] [data-testid="stMetricValue"] {{
    color: {TEXT} !important; font-size: 20px !important; font-weight: 700 !important;
}}

.stButton > button[kind="primary"] {{
    background: linear-gradient(135deg, {GREEN_DIM} 0%, {BLUE_DIM} 100%) !important;
    color: #fff !important; border: none !important;
    border-radius: 0 8px 8px 0 !important;
    font-weight: 700 !important; font-size: 13px !important;
    letter-spacing: .08em !important; text-transform: uppercase !important;
    padding: 12px 26px !important;
    transition: opacity .15s !important;
}}
.stButton > button[kind="primary"]:hover {{ opacity: .85 !important; }}

div[data-testid="stExpander"] {{
    background: {SURFACE} !important;
    border: 1px solid {BORDER} !important;
    border-radius: 10px !important;
}}

.stAlert {{ border-radius: 10px !important; }}
div[data-testid="stSpinner"] > div {{ color: {MUTED} !important; }}
</style>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# MATPLOTLIB THEME
# ─────────────────────────────────────────────────────────────────────────────
def _ax(ax, fig, *, w=12, h=4.5):
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(SURFACE)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=MUTED, labelsize=8.5)
    ax.yaxis.label.set_color(MUTED)
    ax.xaxis.label.set_color(MUTED)
    ax.title.set_color(TEXT)
    ax.grid(True, color=BORDER2, linewidth=0.4, linestyle="--", alpha=0.5, zorder=0)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def fmt_inr(v) -> str:
    return f"Rs {v:,.2f}" if isinstance(v, (int, float)) else "--"

def pct_str(v: float) -> str:
    sign = "+" if v >= 0 else ""
    return f"{sign}{v*100:.2f}%"

def verdict_cls(v: str) -> str:
    return v.lower() if v.lower() in ("buy", "sell", "hold", "caution") else "hold"

def verdict_icon(v: str) -> str:
    return {"BUY": "🟢", "SELL": "🔴", "HOLD": "🟡", "CAUTION": "⚠️"}.get(v.upper(), "⬜")

def conf_cls(c: str) -> str:
    return {"HIGH": "ai-conf-high", "MEDIUM": "ai-conf-medium", "LOW": "ai-conf-low"}.get(c.upper(), "ai-conf-medium")

def risk_cls(r: str) -> str:
    return {"HIGH": "ai-risk-high", "MEDIUM": "ai-risk-medium", "LOW": "ai-risk-low"}.get(r.upper(), "ai-risk-medium")


# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(f"""
<div class="s2-header">
    <div class="s2-title">📈 Stockify v2  <span style="font-size:16px; background:linear-gradient(135deg,{PURPLE},{BLUE}); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">+ AI Verification</span></div>
    <p class="s2-subtitle">
        XGBoost + RandomForest + GradientBoosting ensemble &nbsp;|&nbsp;
        80 engineered features &nbsp;|&nbsp; Walk-forward CV &nbsp;|&nbsp;
        <span style="color:{PURPLE}; font-weight:600;">🤖 Groq LLaMA-3.3-70B re-verification</span>
    </p>
</div>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# INPUT
# ─────────────────────────────────────────────────────────────────────────────
col_in, col_btn, col_tip = st.columns([3, 1, 4])
with col_in:
    symbol = st.text_input(
        "symbol", "RELIANCE",
        label_visibility="collapsed",
        placeholder="NSE symbol — RELIANCE, TCS, INFY, HDFCBANK, WIPRO …",
    )
with col_btn:
    run = st.button("Analyse", use_container_width=True, type="primary")
with col_tip:
    st.markdown(f"""
    <div style="padding:8px 0; display:flex; flex-wrap:wrap; gap:6px;">
        {''.join(f'<span style="background:{SURFACE2}; border:1px solid {BORDER2}; border-radius:6px; padding:4px 12px; font-size:12px; color:{MUTED}; cursor:pointer;">{s}</span>'
                 for s in ["RELIANCE","TCS","INFY","HDFCBANK","SBIN","TATAMOTORS","WIPRO","ONGC","TITAN"])}
    </div>
    """, unsafe_allow_html=True)

st.markdown("<hr class='s2-div'>", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# MAIN ANALYSIS
# ─────────────────────────────────────────────────────────────────────────────
if run:
    with st.spinner(f"Training ensemble + AI verification for {symbol.upper()} — first run ~60–90s …"):
        try:
            resp = requests.get(f"{API_URL}/predict/{symbol.strip()}", timeout=300)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError:
            detail = resp.json().get("detail", resp.text)
            st.error(f"API error {resp.status_code}: {detail}")
            st.stop()
        except Exception as exc:
            st.error(
                f"Cannot reach backend: {exc}\n\n"
                "Make sure server2 is running:\n"
                "```\nuvicorn server2:app --reload --port 8001\n```"
            )
            st.stop()

    # ── Unpack ───────────────────────────────────────────────────────────────
    sym           = data["symbol"]
    current_price = data["current_price"]
    signal        = data["signal"]          # BUY | SELL | HOLD
    buy_prob      = data["buy_prob"]
    sell_prob     = data["sell_prob"]
    accuracy      = data["accuracy"]
    indicators    = data["indicators"]
    top_feats     = data["top_features"]    # list of [name, importance]
    history       = data["history"]
    meta          = data["meta"]
    llm           = data.get("llm_analysis", {})

    hist_dates = history["dates"]
    hist_close = history["close"]
    hist_open  = history["open"]
    hist_high  = history["high"]
    hist_low   = history["low"]
    hist_vol   = history["volume"]

    sig_cls  = signal.lower()
    sig_icon = {"BUY": "🟢", "SELL": "🔴", "HOLD": "🟡"}.get(signal, "")
    sig_col  = {"BUY": GREEN, "SELL": RED, "HOLD": AMBER}.get(signal, MUTED)

    # ── Section: Signal hero ─────────────────────────────────────────────────
    st.markdown(f"""
    <p class="s2-section-head">ML Signal — {sym}</p>
    <div style="display:flex; align-items:center; gap:28px; margin-bottom:18px; flex-wrap:wrap;">
        <div class="s2-signal {sig_cls}">{sig_icon} {signal}</div>
        <div>
            <div style="font-size:13px; color:{MUTED}; margin-bottom:2px;">Current Price</div>
            <div style="font-size:28px; font-weight:800; color:{TEXT};">{fmt_inr(current_price)}</div>
        </div>
        <div>
            <div style="font-size:13px; color:{MUTED}; margin-bottom:2px;">ML Confidence</div>
            <div style="font-size:28px; font-weight:800; color:{sig_col};">{buy_prob*100:.1f}%</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── Metrics row ──────────────────────────────────────────────────────────
    m1, m2, m3, m4, m5, m6 = st.columns(6)
    m1.metric("BUY probability",  f"{buy_prob*100:.1f}%")
    m2.metric("SELL probability", f"{sell_prob*100:.1f}%")
    m3.metric("CV accuracy",      f"{accuracy['cv_mean']*100:.1f}%",
              help="Walk-forward cross-validation — honest out-of-sample estimate")
    m4.metric("Train accuracy",   f"{accuracy['train']*100:.1f}%")
    m5.metric("Features used",    str(meta["feature_count"]))
    m6.metric("Data rows",        str(meta["data_rows"]))

    st.markdown("<hr class='s2-div'>", unsafe_allow_html=True)

    # ─────────────────────────────────────────────────────────────────────────
    # 🤖  GROQ LLM AI ANALYSIS PANEL
    # ─────────────────────────────────────────────────────────────────────────
    st.markdown("<p class='s2-section-head'>🤖 AI Second Opinion — Groq LLaMA-3.3-70B</p>",
                unsafe_allow_html=True)

    if llm and llm.get("llm_available", False):
        ai_verdict   = llm.get("verdict", signal)
        ai_conf      = llm.get("confidence", "N/A")
        ai_rationale = llm.get("rationale", "")
        ai_risk      = llm.get("risk_level", "MEDIUM")
        ai_factors   = llm.get("key_factors", [])
        ai_disc      = llm.get("disclaimer", "")

        agrees      = ai_verdict.upper() == signal.upper()
        agree_label = "✅ Agrees with ML signal" if agrees else "⚡ Differs from ML signal"
        agree_cls   = "yes" if agrees else "no"
        verdict_c   = conf_cls(ai_conf)
        risk_c      = risk_cls(ai_risk)
        verd_c      = verdict_cls(ai_verdict)
        verd_i      = verdict_icon(ai_verdict)

        # ── Panel open + header ───────────────────────────────────────────────
        st.markdown(
            f'<div class="ai-panel">'
            f'<div class="ai-panel-header">'
            f'<span class="ai-panel-title">🤖 AI Analysis</span>'
            f'<span class="ai-badge ai-badge-model">LLaMA-3.3-70B via Groq</span>'
            f'<span class="ai-agree {agree_cls}">{agree_label}</span>'
            f'</div>',
            unsafe_allow_html=True,
        )

        # ── Verdict / Confidence / Risk row ───────────────────────────────────
        st.markdown(
            f'<div class="ai-verdict-row">'
            f'  <div>'
            f'    <div style="font-size:10px;color:{MUTED};text-transform:uppercase;'
            f'letter-spacing:.08em;margin-bottom:6px;">AI Verdict</div>'
            f'    <div class="ai-verdict {verd_c}">{verd_i} {ai_verdict}</div>'
            f'  </div>'
            f'  <div class="ai-conf-box">'
            f'    <div class="ai-conf-label">Confidence</div>'
            f'    <div class="ai-conf-value {verdict_c}">{ai_conf}</div>'
            f'  </div>'
            f'  <div class="ai-risk-box">'
            f'    <div class="ai-risk-label">Risk Level</div>'
            f'    <div class="ai-risk-value {risk_c}">{ai_risk}</div>'
            f'  </div>'
            f'</div>',
            unsafe_allow_html=True,
        )

        # ── Rationale ─────────────────────────────────────────────────────────
        st.markdown(
            f'<div style="font-size:11px;color:{MUTED};text-transform:uppercase;'
            f'letter-spacing:.1em;margin-bottom:8px;">Rationale</div>'
            f'<div class="ai-rationale">{ai_rationale}</div>',
            unsafe_allow_html=True,
        )

        # ── Key Factors ───────────────────────────────────────────────────────
        st.markdown(
            f'<div style="font-size:11px;color:{MUTED};text-transform:uppercase;'
            f'letter-spacing:.1em;margin:12px 0 10px;">Key Factors</div>',
            unsafe_allow_html=True,
        )
        if ai_factors:
            for factor in ai_factors:
                st.markdown(
                    f'<div class="ai-factor">'
                    f'<span class="ai-factor-icon">◆</span>{factor}'
                    f'</div>',
                    unsafe_allow_html=True,
                )
        else:
            st.markdown(
                f'<div style="color:{MUTED};font-size:13px;">No specific factors returned.</div>',
                unsafe_allow_html=True,
            )

        # ── Disclaimer + panel close ──────────────────────────────────────────
        st.markdown(
            f'<div class="ai-disclaimer">⚠️ {ai_disc}</div>'
            f'</div>',   # closes ai-panel
            unsafe_allow_html=True,
        )

    elif llm and not llm.get("llm_available", True):
        st.markdown(
            f'<div class="ai-panel">'
            f'<div class="ai-panel-header">'
            f'<span class="ai-panel-title">🤖 AI Analysis</span>'
            f'<span class="ai-badge ai-badge-model">Groq</span>'
            f'</div>'
            f'<div class="ai-unavailable">'
            f'<div style="font-size:32px;margin-bottom:8px;">⚡</div>'
            f'<div style="font-size:14px;color:{MUTED};margin-bottom:4px;">LLM Verification Unavailable</div>'
            f'<div style="font-size:12px;color:{TEXT_DIM};">'
            f'{llm.get("rationale","Set GROQ_API_KEY in your .env file.")}'
            f'</div></div></div>',
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            f'<div class="ai-panel"><div class="ai-unavailable">'
            f'<div style="font-size:14px;color:{MUTED};">No LLM response. Ensure server2 is v2.1+</div>'
            f'</div></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<hr class='s2-div'>", unsafe_allow_html=True)

    # ── Columns: Chart left | Indicators + Top features right ────────────────
    left, right = st.columns([3, 2], gap="large")

    # ── PRICE CHART ──────────────────────────────────────────────────────────
    with left:
        st.markdown(f"<p class='s2-section-head'>90-Day Price History (Candlestick)</p>",
                    unsafe_allow_html=True)

        n = len(hist_dates)
        x = np.arange(n)

        # Downsample x-tick labels for readability
        step    = max(1, n // 12)
        x_ticks = x[::step]
        x_lbls  = [hist_dates[i][5:] for i in range(0, n, step)]  # MM-DD

        fig, (ax_c, ax_v) = plt.subplots(
            2, 1, figsize=(13, 6.5),
            gridspec_kw={"height_ratios": [3, 1], "hspace": 0.06},
            sharex=True,
        )
        _ax(ax_c, fig)
        _ax(ax_v, fig)

        # Candlestick bars
        for i in range(n):
            o, c, h, l = hist_open[i], hist_close[i], hist_high[i], hist_low[i]
            color = GREEN if c >= o else RED
            ax_c.plot([i, i], [l, h], color=color, linewidth=0.9, alpha=0.6, zorder=2)
            body_h = abs(c - o) or 0.01
            ax_c.bar(i, body_h, bottom=min(o, c), color=color,
                     width=0.65, alpha=0.85, zorder=3)

        # SMA20 overlay
        if n >= 20:
            sma20 = pd.Series(hist_close).rolling(20).mean().values
            ax_c.plot(x, sma20, color=BLUE, linewidth=1.3,
                      linestyle="--", alpha=0.7, label="SMA 20", zorder=4)

        # SMA50 overlay
        if n >= 50:
            sma50 = pd.Series(hist_close).rolling(50).mean().values
            ax_c.plot(x, sma50, color=AMBER, linewidth=1.3,
                      linestyle="--", alpha=0.7, label="SMA 50", zorder=4)

        # Current price line
        ax_c.axhline(current_price, color=sig_col, linewidth=1.0,
                     linestyle=":", alpha=0.6, zorder=5)
        ax_c.text(n - 0.5, current_price,
                  f" {fmt_inr(current_price)}",
                  color=sig_col, fontsize=8, va="center")

        ax_c.set_title(f"{sym} — Daily OHLC  ({hist_dates[0]} to {hist_dates[-1]})",
                       fontsize=12, pad=10)
        ax_c.yaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"Rs{v:,.0f}"))
        legend = ax_c.legend(facecolor=SURFACE2, edgecolor=BORDER2,
                             labelcolor=MUTED, fontsize=8.5, loc="upper left")

        # Volume bars
        vol_colors = [GREEN if hist_close[i] >= hist_open[i] else RED for i in range(n)]
        ax_v.bar(x, hist_vol, color=vol_colors, alpha=0.5, width=0.75, zorder=3)
        vol_sma = pd.Series(hist_vol).rolling(20).mean().values
        ax_v.plot(x, vol_sma, color=AMBER, linewidth=1.0, alpha=0.7, zorder=4)
        ax_v.set_ylabel("Volume", fontsize=8, color=MUTED)
        ax_v.yaxis.set_major_formatter(
            mticker.FuncFormatter(lambda v, _: f"{v/1e6:.1f}M" if v >= 1e6 else f"{v/1e3:.0f}K")
        )
        ax_v.set_xticks(x_ticks)
        ax_v.set_xticklabels(x_lbls, rotation=35, ha="right", color=MUTED, fontsize=8)

        fig.tight_layout(pad=1.0)
        st.pyplot(fig)
        plt.close(fig)

        # ── Confidence Gauge ──────────────────────────────────────────────────
        st.markdown(f"<p class='s2-section-head'>Probability Gauge</p>",
                    unsafe_allow_html=True)

        fig_g, ax_g = plt.subplots(figsize=(8, 2.8))
        _ax(ax_g, fig_g)
        ax_g.set_xlim(0, 1)
        ax_g.set_ylim(-0.3, 1.1)
        ax_g.set_yticks([])
        ax_g.set_xticks([0, 0.38, 0.5, 0.62, 1.0])
        ax_g.set_xticklabels(["0%", "SELL←38%", "50%", "62%→BUY", "100%"],
                             fontsize=8.5, color=MUTED)

        ax_g.barh(0, 0.38, color=RED,   height=0.35, alpha=0.15, left=0)
        ax_g.barh(0, 0.24, color=AMBER, height=0.35, alpha=0.15, left=0.38)
        ax_g.barh(0, 0.38, color=GREEN, height=0.35, alpha=0.15, left=0.62)
        ax_g.barh(0, buy_prob, color=sig_col, height=0.35, alpha=0.7, left=0)
        ax_g.plot([buy_prob, buy_prob], [-0.25, 0.55],
                  color=sig_col, linewidth=3, zorder=5, solid_capstyle="round")
        ax_g.plot(buy_prob, 0.55, marker="^", color=sig_col, markersize=10, zorder=6)
        ax_g.text(buy_prob, -0.22, f"{buy_prob*100:.1f}%",
                  ha="center", va="top", fontsize=14, fontweight="bold", color=sig_col)
        ax_g.set_title(f"BUY probability needle — ML signal: {signal}", fontsize=10, pad=8)
        ax_g.axvline(0.38, color=RED,   linewidth=0.8, linestyle=":", alpha=0.6)
        ax_g.axvline(0.62, color=GREEN, linewidth=0.8, linestyle=":", alpha=0.6)

        fig_g.tight_layout(pad=0.8)
        st.pyplot(fig_g)
        plt.close(fig_g)

    # ── RIGHT PANEL ──────────────────────────────────────────────────────────
    with right:
        # Indicator snapshot
        st.markdown("<p class='s2-section-head'>Live Indicator Snapshot</p>",
                    unsafe_allow_html=True)

        rsi    = indicators["rsi_14"]
        stoch  = indicators["stoch_k"]
        adx    = indicators["adx"]
        bb_pct = indicators["bb_pct_20"]
        macd_d = indicators["macd_diff"]
        vol_r  = indicators["vol_ratio"]
        sma20r = indicators["close_vs_sma20"]
        sma200r= indicators["close_vs_sma200"]

        def pill(label, val, cls):
            return f"<span class='ind-pill {cls}'>{label}: {val}</span>"

        rsi_cls   = "ind-bull" if rsi < 40 else "ind-bear" if rsi > 65 else "ind-neut"
        stoch_cls = "ind-bull" if stoch < 25 else "ind-bear" if stoch > 75 else "ind-neut"
        adx_cls   = "ind-info" if adx > 25 else "ind-neut"
        bb_cls    = "ind-bear" if bb_pct > 0.9 else "ind-bull" if bb_pct < 0.1 else "ind-neut"
        macd_cls  = "ind-bull" if macd_d > 0 else "ind-bear"
        vol_cls   = "ind-info" if vol_r > 1.5 else "ind-neut"
        sma_cls   = "ind-bull" if sma20r > 0 else "ind-bear"
        sma200_cls= "ind-bull" if sma200r > 0 else "ind-bear"

        st.markdown(f"""
        <div class="ind-row">
            {pill("RSI-14",     f"{rsi:.1f}",     rsi_cls)}
            {pill("Stoch %K",   f"{stoch:.1f}",   stoch_cls)}
            {pill("ADX",        f"{adx:.1f}",     adx_cls)}
            {pill("BB%",        f"{bb_pct:.2f}",  bb_cls)}
            {pill("MACD diff",  f"{macd_d:.4f}",  macd_cls)}
        </div>
        <div class="ind-row">
            {pill("Vol ratio",  f"{vol_r:.2f}x",  vol_cls)}
            {pill("vs SMA20",   pct_str(sma20r),  sma_cls)}
            {pill("vs SMA200",  pct_str(sma200r), sma200_cls)}
            {pill("ATR-14",     fmt_inr(indicators['atr_14']), "ind-info")}
        </div>
        """, unsafe_allow_html=True)

        # RSI gauge mini chart
        st.markdown("<p class='s2-section-head' style='margin-top:18px;'>RSI + Bollinger %B</p>",
                    unsafe_allow_html=True)

        fig_i, (ax_r, ax_b) = plt.subplots(1, 2, figsize=(7.5, 2.5))
        for ax in (ax_r, ax_b):
            _ax(ax, fig_i)

        theta = np.linspace(np.pi, 0, 200)
        ax_r.plot(np.cos(theta), np.sin(theta),
                  color=BORDER2, linewidth=8, solid_capstyle="round", alpha=0.4)
        rsi_norm = rsi / 100.0
        theta_f = np.linspace(np.pi, np.pi - rsi_norm * np.pi, 200)
        rsi_color = RED if rsi > 70 else GREEN if rsi < 30 else AMBER
        ax_r.plot(np.cos(theta_f), np.sin(theta_f),
                  color=rsi_color, linewidth=8, solid_capstyle="round")
        ax_r.text(0, 0.1, f"{rsi:.1f}", ha="center", va="center",
                  fontsize=18, fontweight="bold", color=rsi_color)
        ax_r.text(0, -0.3, "RSI 14", ha="center", fontsize=9, color=MUTED)
        ax_r.set_xlim(-1.2, 1.2); ax_r.set_ylim(-0.5, 1.3)
        ax_r.set_xticks([]); ax_r.set_yticks([])
        ax_r.text(-1.1, -0.05, "0",   fontsize=7.5, color=TEXT_DIM)
        ax_r.text( 0.9, -0.05, "100", fontsize=7.5, color=TEXT_DIM)

        ax_b.plot(np.cos(theta), np.sin(theta),
                  color=BORDER2, linewidth=8, solid_capstyle="round", alpha=0.4)
        bb_norm = float(np.clip(bb_pct, 0, 1))
        theta_bb = np.linspace(np.pi, np.pi - bb_norm * np.pi, 200)
        bb_color = RED if bb_pct > 0.85 else GREEN if bb_pct < 0.15 else BLUE
        ax_b.plot(np.cos(theta_bb), np.sin(theta_bb),
                  color=bb_color, linewidth=8, solid_capstyle="round")
        ax_b.text(0, 0.1, f"{bb_pct:.2f}", ha="center", va="center",
                  fontsize=18, fontweight="bold", color=bb_color)
        ax_b.text(0, -0.3, "BB %B", ha="center", fontsize=9, color=MUTED)
        ax_b.set_xlim(-1.2, 1.2); ax_b.set_ylim(-0.5, 1.3)
        ax_b.set_xticks([]); ax_b.set_yticks([])
        ax_b.text(-1.1, -0.05, "0", fontsize=7.5, color=TEXT_DIM)
        ax_b.text( 0.9, -0.05, "1", fontsize=7.5, color=TEXT_DIM)

        fig_i.patch.set_facecolor(BG)
        fig_i.tight_layout(pad=0.5)
        st.pyplot(fig_i)
        plt.close(fig_i)

        # Top Feature Importances
        st.markdown("<p class='s2-section-head' style='margin-top:18px;'>Top-20 Feature Importances (XGBoost)</p>",
                    unsafe_allow_html=True)

        feat_names = [f[0] for f in top_feats]
        feat_vals  = [f[1] for f in top_feats]
        n_f        = len(feat_names)

        cmap_colors = [
            f"#{int(255*(1-v/max(feat_vals))):02x}"
            f"{int(200*(v/max(feat_vals))):02x}"
            f"{int(120*(v/max(feat_vals))):02x}"
            for v in feat_vals
        ]

        fig_f, ax_f = plt.subplots(figsize=(7.5, n_f * 0.38 + 0.5))
        _ax(ax_f, fig_f)
        bars = ax_f.barh(range(n_f), feat_vals, color=cmap_colors,
                         height=0.72, zorder=3)
        ax_f.set_yticks(range(n_f))
        ax_f.set_yticklabels(feat_names, fontsize=8.5, color=TEXT)
        ax_f.invert_yaxis()
        for bar, val in zip(bars, feat_vals):
            ax_f.text(val + max(feat_vals) * 0.01, bar.get_y() + bar.get_height() / 2,
                      f"{val:.4f}", va="center", fontsize=7.5, color=MUTED)
        ax_f.set_xlabel("Importance", fontsize=9, color=MUTED)
        ax_f.set_title("Feature importances (higher = more predictive)", fontsize=9.5, pad=6)
        fig_f.patch.set_facecolor(BG)
        fig_f.tight_layout(pad=0.8)
        st.pyplot(fig_f)
        plt.close(fig_f)

    # ── Return distribution ───────────────────────────────────────────────────
    st.markdown("<hr class='s2-div'>", unsafe_allow_html=True)
    with st.expander("📊 Daily Return Distribution (last 90 days)", expanded=False):
        returns = pd.Series(hist_close).pct_change().dropna().values * 100
        fig_d, ax_d = plt.subplots(figsize=(13, 3.5))
        _ax(ax_d, fig_d)
        _, bins, patches = ax_d.hist(returns, bins=30, edgecolor=BG, linewidth=0.3)
        for patch, edge in zip(patches, bins):
            patch.set_facecolor(GREEN if edge >= 0 else RED)
            patch.set_alpha(0.75)
        ax_d.axvline(0, color=MUTED, linewidth=1.2, linestyle="--")
        mu, std = float(np.mean(returns)), float(np.std(returns))
        ax_d.axvline(mu, color=AMBER, linewidth=1.5, linestyle=":",
                     label=f"Mean: {mu:+.2f}%")
        ax_d.set_title(f"{sym} — Daily Return Distribution  (mu={mu:+.2f}%  sigma={std:.2f}%)",
                       fontsize=11, pad=8)
        ax_d.set_xlabel("Daily Return (%)", fontsize=9)
        ax_d.legend(facecolor=SURFACE2, edgecolor=BORDER, labelcolor=MUTED, fontsize=9)
        fig_d.tight_layout(pad=0.8)
        st.pyplot(fig_d)
        plt.close(fig_d)

    # ── Model explainer ───────────────────────────────────────────────────────
    with st.expander("🔬 How the model works", expanded=False):
        ec1, ec2, ec3 = st.columns(3)
        cards = [
            ("80 Engineered Features", BLUE,
             "RSI x3, Stochastic, Williams %R, MACD, ADX, CCI, ATR x2, "
             "OBV, MFI, Bollinger Bands, rolling skew/kurtosis, candle body/wicks, "
             "volume ratio, lag returns, price vs SMA 20/50/200, and interaction terms."),
            ("Calibrated Voting Ensemble", GREEN,
             "XGBoost (weight 3) + RandomForest (weight 2) + GradientBoosting (weight 2) "
             "combined via soft voting. Isotonic calibration ensures the probability "
             "outputs reflect true likelihoods rather than raw scores."),
            ("Groq LLM Re-Verification", PURPLE,
             "After the ML model produces a signal, LLaMA-3.3-70B (via Groq) independently "
             "reviews all indicators and produces a second-opinion verdict with confidence "
             "level, risk assessment, and key reasoning factors."),
        ]
        for col, (title, color, body) in zip([ec1, ec2, ec3], cards):
            col.markdown(
                f"<div style='background:{SURFACE}; border:1px solid {BORDER}; "
                f"border-left:3px solid {color}; border-radius:10px; padding:16px 18px;'>"
                f"<div style='font-size:11px; text-transform:uppercase; letter-spacing:.09em; "
                f"color:{color}; margin-bottom:8px;'>{title}</div>"
                f"<p style='font-size:13px; color:{TEXT}; line-height:1.65; margin:0;'>{body}</p>"
                f"</div>",
                unsafe_allow_html=True,
            )

    # ── Disclaimer ───────────────────────────────────────────────────────────
    st.markdown(
        f"<p style='color:{TEXT_DIM}; font-size:11px; text-align:center; margin-top:28px;'>"
        "⚠️  Stockify is an educational tool — not SEBI-registered and not financial advice. "
        "Model signals are probabilistic estimates and past performance does not guarantee future results."
        "</p>",
        unsafe_allow_html=True,
    )

# ─────────────────────────────────────────────────────────────────────────────
# EMPTY STATE
# ─────────────────────────────────────────────────────────────────────────────
else:
    st.markdown(f"""
    <div style="text-align:center; padding:5rem 0 4rem; color:{TEXT_DIM};">
        <div style="font-size:60px; margin-bottom:16px;">📈</div>
        <p style="font-size:18px; color:{MUTED}; font-weight:600; margin:0 0 8px;">
            Enter an NSE symbol and click Analyse
        </p>
        <p style="font-size:13px; color:{TEXT_DIM}; margin:0;">
            Try: RELIANCE &nbsp;·&nbsp; TCS &nbsp;·&nbsp; INFY &nbsp;·&nbsp;
            HDFCBANK &nbsp;·&nbsp; SBIN &nbsp;·&nbsp; TATAMOTORS &nbsp;·&nbsp; WIPRO
        </p>
        <div style="margin-top:32px; display:inline-flex; gap:12px; flex-wrap:wrap; justify-content:center;">
            <div style="background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px;
                        padding:14px 20px; text-align:left; min-width:200px;">
                <div style="font-size:10px; color:{GREEN}; text-transform:uppercase;
                            letter-spacing:.1em; margin-bottom:6px;">✔  80 Features</div>
                <div style="font-size:13px; color:{TEXT};">RSI, MACD, ADX, Bollinger, ATR, OBV, MFI &amp; more</div>
            </div>
            <div style="background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px;
                        padding:14px 20px; text-align:left; min-width:200px;">
                <div style="font-size:10px; color:{BLUE}; text-transform:uppercase;
                            letter-spacing:.1em; margin-bottom:6px;">✔  Ensemble Model</div>
                <div style="font-size:13px; color:{TEXT};">XGBoost + RandomForest + GradientBoosting</div>
            </div>
            <div style="background:{SURFACE}; border:1px solid {BORDER}; border-radius:10px;
                        padding:14px 20px; text-align:left; min-width:200px;">
                <div style="font-size:10px; color:{PURPLE}; text-transform:uppercase;
                            letter-spacing:.1em; margin-bottom:6px;">✔  AI Verification</div>
                <div style="font-size:13px; color:{TEXT};">Groq LLaMA-3.3-70B second opinion</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)