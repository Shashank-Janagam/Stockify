"""
PaperBull – AI Stock Forecast  |  Streamlit frontend
Connects to server1.py (FastAPI) running on port 8000.
"""

import streamlit as st
import requests
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
API_URL = "http://127.0.0.1:8000/forecast"

st.set_page_config(
    page_title="PaperBull – AI Forecast",
    layout="wide",
    page_icon="🐂",
)

# ─────────────────────────────────────────────────────────────────────────────
# DESIGN TOKENS
# ─────────────────────────────────────────────────────────────────────────────
BG         = "#f8fafc"
SURFACE    = "#ffffff"
BORDER     = "#e2e8f0"
GREEN      = "#10b981"
GREEN_DIM  = "#047857"
RED        = "#ef4444"
RED_DIM    = "#b91c1c"
AMBER      = "#d97706"
MUTED      = "#64748b"
TEXT       = "#0f172a"
TEXT_DIM   = "#475569"
PURPLE     = "#7c3aed"

# ─────────────────────────────────────────────────────────────────────────────
# CSS
# ─────────────────────────────────────────────────────────────────────────────
st.markdown(f"""
<style>
    .stApp {{
        background-color: {BG};
        background-image: radial-gradient({BORDER} 1px, transparent 1px);
        background-size: 16px 16px;
        color: {TEXT};
    }}
    .block-container {{ padding: 0 2.2rem 4rem !important; max-width: 1440px !important; }}

    .report-card {{
        background: {SURFACE};
        border: 1px solid {BORDER};
        border-radius: 12px;
        padding: 20px 24px;
        margin-bottom: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,.05);
        transition: transform 0.18s, box-shadow 0.18s;
    }}
    .report-card:hover {{
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,.07);
    }}
    .report-card h4 {{
        color: {GREEN_DIM};
        margin: 0 0 8px 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }}
    .report-card p {{ color: {TEXT_DIM}; font-size: 15px; line-height: 1.65; margin: 0; }}

    .verdict-banner {{
        background: rgba(16,185,129,0.09);
        border: 1px solid {GREEN};
        border-radius: 10px;
        padding: 16px 22px;
        margin-bottom: 16px;
    }}
    .verdict-banner.bearish {{ background: rgba(239,68,68,0.09); border-color: {RED}; }}
    .verdict-banner.neutral {{ background: rgba(100,116,139,0.09); border-color: {MUTED}; }}
    .verdict-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: {MUTED}; margin-bottom: 4px; }}
    .verdict-text  {{ font-size: 17px; font-weight: 600; color: {TEXT}; }}

    .badge {{ display:inline-block; padding:3px 12px; border-radius:20px;
              font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }}
    .badge-low    {{ background:rgba(16,185,129,.1); color:{GREEN_DIM}; border:1px solid {GREEN}; }}
    .badge-medium {{ background:rgba(217,119,6,.1);  color:{AMBER};     border:1px solid {AMBER}; }}
    .badge-high   {{ background:rgba(239,68,68,.1);  color:{RED_DIM};   border:1px solid {RED}; }}

    .meta-pill {{
        display:inline-block; padding:2px 10px; border-radius:12px;
        font-size:11px; background:rgba(124,58,237,.08);
        color:{PURPLE}; border:1px solid rgba(124,58,237,.25);
        margin-right:6px; margin-top:6px;
    }}

    .divider {{ border:none; border-top:1px solid {BORDER}; margin:20px 0; }}

    div[data-testid="stTextInput"] > div > div > input {{
        background:{SURFACE} !important; border:1px solid {BORDER} !important;
        border-right:none !important; border-radius:4px 0 0 4px !important;
        color:{TEXT} !important; font-size:15px !important; font-weight:500 !important;
        padding:11px 16px !important; letter-spacing:.05em !important;
        caret-color:{GREEN_DIM}; outline:none !important; box-shadow:none !important;
    }}
    div[data-testid="stTextInput"] > div > div > input:focus {{
        border-color:{GREEN_DIM} !important;
        box-shadow:0 0 0 2px rgba(16,185,129,.15) !important;
    }}
    div[data-testid="stTextInput"] > div > div > input::placeholder {{
        color:{MUTED} !important; font-weight:300;
    }}

    .stButton > button[kind="primary"] {{
        background:{GREEN} !important; color:{SURFACE} !important;
        border:none !important; border-radius:0 4px 4px 0 !important;
        font-weight:600 !important; font-size:13px !important;
        letter-spacing:.08em !important; text-transform:uppercase !important;
        padding:11px 22px !important; transition:background .12s !important;
    }}
    .stButton > button[kind="primary"]:hover {{ background:#059669 !important; }}
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# HEADER
# ─────────────────────────────────────────────────────────────────────────────
st.markdown("## 🐂 PaperBull — AI Stock Forecast")
st.markdown(
    f"<p style='color:{MUTED}; margin-top:-10px; font-size:14px;'>"
    "Seeded LSTM · Groq LLM sentiment (temperature = 0) · NSE/BSE · "
    "Same input → same output, every time</p>",
    unsafe_allow_html=True,
)
st.markdown("<hr class='divider'>", unsafe_allow_html=True)

# ─────────────────────────────────────────────────────────────────────────────
# INPUT
# ─────────────────────────────────────────────────────────────────────────────
col_in1, col_in2 = st.columns([3, 1])
with col_in1:
    symbol = st.text_input(
        "Stock symbol", "RELIANCE", label_visibility="collapsed",
        placeholder="NSE symbol e.g. RELIANCE, TCS, INFY, HDFCBANK"
    )
with col_in2:
    run = st.button("🔍 Analyse", use_container_width=True, type="primary")

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def direction_color(direction: str) -> str:
    return GREEN_DIM if direction == "bullish" else RED_DIM if direction == "bearish" else MUTED

def direction_glow(direction: str) -> str:
    return GREEN if direction == "bullish" else RED if direction == "bearish" else "#94a3b8"

def pct_change(base: float, target: float) -> str:
    if base == 0:
        return "—"
    ch = (target - base) / base * 100
    sign = "+" if ch >= 0 else ""
    return f"{sign}{ch:.1f}%"

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
if run:
    with st.spinner(f"Fetching data and running seeded LSTM + LLM analysis for {symbol}…"):
        try:
            res = requests.get(f"{API_URL}/{symbol}", timeout=180)
            res.raise_for_status()
            data = res.json()
        except requests.exceptions.HTTPError as e:
            st.error(f"API error {res.status_code}: {res.json().get('detail', str(e))}")
            st.stop()
        except Exception as e:
            st.error(f"Could not reach the API: {e}")
            st.stop()

    # ── unpack response ──────────────────────────────────────────────────────
    current_price = data["current_price"]
    lstm_prices   = data.get("lstm_prices", [])
    forecast      = data["forecast"]
    report        = data["report"]
    chart_data    = data.get("chart_data", {})
    meta          = data.get("meta", {})
    history       = data.get("history", {})

    llm_prices  = forecast["prices"]
    lower       = forecast["lower"]
    upper       = forecast["upper"]
    direction   = forecast["direction"]
    confidence  = forecast["confidence"]
    risk_level  = report.get("risk_level", "medium")

    hist_dates  = history.get("dates", [])
    hist_prices = history.get("prices", [])

    day5_price   = llm_prices[-1]
    is_bullish   = day5_price > current_price
    signal       = "BUY 🟢" if is_bullish else "SELL 🔴"

    # ── top metrics ──────────────────────────────────────────────────────────
    st.markdown("### Overview")
    m1, m2, m3, m4, m5, m6 = st.columns(6)
    m1.metric("Current price",   f"₹{current_price:,.2f}")
    m2.metric("Signal",          signal)
    m3.metric("Confidence",      f"{confidence}%")
    m4.metric("Direction",       direction.capitalize())
    m5.metric("Day 5 target",    f"₹{day5_price:,.2f}",
              delta=pct_change(current_price, day5_price))
    m6.metric("Sentiment score", f"{meta.get('sentiment_score', 0.0):+.3f}")

    # Meta pills (model transparency)
    st.markdown(
        f"<div style='margin-bottom:8px'>"
        f"<span class='meta-pill'>LSTM seed: {meta.get('lstm_seed', 42)}</span>"
        f"<span class='meta-pill'>Max LLM adjustment: ±{meta.get('max_sentiment_shift_pct', 3)}%</span>"
        f"<span class='meta-pill'>Data points: {meta.get('data_points', '—')}</span>"
        f"<span class='meta-pill'>LLM temp: 0 (deterministic)</span>"
        f"</div>",
        unsafe_allow_html=True,
    )

    st.markdown("<hr class='divider'>", unsafe_allow_html=True)

    # ── layout ───────────────────────────────────────────────────────────────
    left, right = st.columns([3, 2], gap="large")

    # ── CHART: 1-Month History + 5-Day Forecast ──────────────────────────────
    with left:
        st.markdown("### 📊 1-Month History + 5-Day Forecast")
        forecast_labels = chart_data.get("labels", [f"Day {i}" for i in range(1, 6)])

        n_hist = len(hist_prices)
        n_fc   = len(llm_prices)

        # Sequential x positions: history 0..n_hist-1, forecast n_hist..n_hist+n_fc-1
        x_hist = list(range(n_hist))
        x_fc   = list(range(n_hist, n_hist + n_fc))

        # Combined labels — show every 5th historical label to avoid clutter
        all_labels = []
        for i, lbl in enumerate(hist_dates):
            all_labels.append(lbl if i % 5 == 0 else "")
        all_labels += forecast_labels

        fig, ax = plt.subplots(figsize=(12, 5))
        fig.patch.set_facecolor(BG)
        ax.set_facecolor(SURFACE)

        # ── History line (solid, blue-grey) ──
        if hist_prices:
            ax.plot(x_hist, hist_prices,
                    color="#475569", linewidth=1.8, label="Historical close",
                    solid_capstyle="round")

        # ── "Today" vertical divider ──
        today_x = n_hist - 0.5
        ax.axvline(today_x, color=AMBER, linewidth=1.5, linestyle="--",
                   alpha=0.8, zorder=5)
        y_range = ax.get_ylim()
        ax.text(today_x + 0.15, ax.get_ylim()[1], "Today ▸",
                color=AMBER, fontsize=9, fontweight="600", va="top")

        # ── Confidence band (forecast zone only) ──
        ax.fill_between(x_fc, lower, upper,
                        color="#0284c7", alpha=0.08, label="90% confidence band")

        # ── Connection line: last history point → first forecast point ──
        if hist_prices:
            # LSTM base connection
            if lstm_prices:
                ax.plot([x_hist[-1], x_fc[0]],
                        [hist_prices[-1], lstm_prices[0]],
                        color=MUTED, linewidth=1.2, linestyle="--", alpha=0.6)
            # LLM adjusted connection
            c_main = direction_color(direction)
            ax.plot([x_hist[-1], x_fc[0]],
                    [hist_prices[-1], llm_prices[0]],
                    color=c_main, linewidth=2, alpha=0.5)

        # ── LSTM raw line (forecast) ──
        if lstm_prices:
            ax.plot(x_fc, lstm_prices,
                    color=MUTED, linewidth=1.4, linestyle="--",
                    marker="o", markersize=4, label="LSTM (base)")

        # ── LLM-adjusted line (forecast) ──
        c_main = direction_color(direction)
        c_glow = direction_glow(direction)
        ax.plot(x_fc, llm_prices,
                color=c_main, linewidth=2.5,
                marker="o", markersize=6, label="LLM adjusted",
                path_effects=[
                    pe.withStroke(linewidth=7, foreground=c_glow, alpha=0.10),
                    pe.Normal(),
                ])

        # ── Annotate LLM forecast prices ──
        for d, p in zip(x_fc, llm_prices):
            ax.annotate(f"₹{p:,.0f}", (d, p),
                        textcoords="offset points", xytext=(0, 11),
                        ha="center", fontsize=8, color=TEXT,
                        fontweight="500")

        # ── Current price reference line ──
        ax.axhline(current_price, color=AMBER, linewidth=0.8,
                   linestyle=":", alpha=0.5)

        # ── Axis formatting ──
        all_x = x_hist + x_fc
        ax.set_xticks(all_x)
        ax.set_xticklabels(all_labels, color=MUTED, fontsize=8,
                           rotation=45, ha="right")
        ax.tick_params(axis="y", colors=MUTED, labelsize=10)
        ax.spines[:].set_color(BORDER)
        ax.set_title(f"{symbol.upper()} — 1-Month History + 5-Day Forecast",
                     color=TEXT, fontsize=13, pad=12)
        ax.set_xlabel("Trading day", color=MUTED, fontsize=10)
        ax.set_ylabel("Price (₹)", color=MUTED, fontsize=10)
        ax.legend(facecolor=SURFACE, edgecolor=BORDER,
                  labelcolor=TEXT_DIM, fontsize=9, loc="upper left")
        ax.grid(True, color=BORDER, linewidth=0.5, linestyle="--")
        fig.tight_layout()
        st.pyplot(fig)
        plt.close(fig)

        # Forecast table
        st.markdown("**Forecast breakdown**")
        table = {
            "Day":              forecast_labels,
            "LSTM base (₹)":    lstm_prices if lstm_prices else ["—"] * 5,
            "LLM adjusted (₹)": llm_prices,
            "Lower 90% (₹)":    lower,
            "Upper 90% (₹)":    upper,
            "vs Current":       [pct_change(current_price, p) for p in llm_prices],
        }
        st.dataframe(table, use_container_width=True, hide_index=True)

    # ── ANALYST REPORT ───────────────────────────────────────────────────────
    with right:
        st.markdown("### 🧠 LLM Analyst Report")

        verdict_cls = direction if direction in ("bullish", "bearish") else "neutral"
        st.markdown(f"""
        <div class="verdict-banner {verdict_cls}">
            <div class="verdict-label">Analyst verdict</div>
            <div class="verdict-text">{report.get('verdict', '—')}</div>
        </div>
        """, unsafe_allow_html=True)

        st.markdown(f"""
        <div class="report-card">
            <h4>Summary</h4>
            <p>{report.get('summary', '—')}</p>
        </div>
        """, unsafe_allow_html=True)

        bc1, bc2 = st.columns(2)
        with bc1:
            st.markdown(f"""
            <div class="report-card" style="border-color:#2ea043;">
                <h4>🟢 Bull case</h4>
                <p>{report.get('bull_case', '—')}</p>
            </div>
            """, unsafe_allow_html=True)
        with bc2:
            st.markdown(f"""
            <div class="report-card" style="border-color:#da3633;">
                <h4>🔴 Bear case</h4>
                <p>{report.get('bear_case', '—')}</p>
            </div>
            """, unsafe_allow_html=True)

        lv1, lv2 = st.columns(2)
        with lv1:
            st.metric("Support",    f"₹{report.get('support_level', '—'):,}")
        with lv2:
            st.metric("Resistance", f"₹{report.get('resistance_level', '—'):,}")

        badge_cls = f"badge-{risk_level}"
        st.markdown(f"""
        <div style="margin-top:12px;">
            <span style="color:{MUTED}; font-size:13px;">Risk level &nbsp;</span>
            <span class="badge {badge_cls}">{risk_level}</span>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("<hr class='divider'>", unsafe_allow_html=True)

    # ── LSTM vs LLM ADJUSTMENT BAR ───────────────────────────────────────────
    if lstm_prices:
        st.markdown("### 🔁 LLM Sentiment Adjustment over LSTM Base")
        diff   = [round(llm_prices[i] - lstm_prices[i], 2) for i in range(5)]
        colors = [GREEN_DIM if d >= 0 else RED_DIM for d in diff]

        fig2, ax2 = plt.subplots(figsize=(9, 2.5))
        fig2.patch.set_facecolor(BG)
        ax2.set_facecolor(SURFACE)
        bars = ax2.bar(labels, diff, color=colors, width=0.5, zorder=3)
        ax2.axhline(0, color=BORDER, linewidth=0.8)
        ax2.set_title("LLM price correction over LSTM base (₹)", color=TEXT, fontsize=12)
        ax2.tick_params(colors=MUTED)
        ax2.spines[:].set_color(BORDER)
        ax2.grid(True, axis="y", color=BORDER, linewidth=0.5, linestyle="--", zorder=0)
        for bar, val in zip(bars, diff):
            ax2.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + (0.06 if val >= 0 else -0.25),
                f"{'+'if val>=0 else ''}{val}",
                ha="center", va="bottom", fontsize=9, color=TEXT,
            )
        fig2.tight_layout()
        st.pyplot(fig2)
        plt.close(fig2)

    # ── DISCLAIMER ───────────────────────────────────────────────────────────
    st.markdown(f"""
    <p style="color:{MUTED}; font-size:12px; margin-top:28px; text-align:center;">
    ⚠️ PaperBull is a simulated platform for educational purposes only.
    Not SEBI-registered. Not financial advice.
    Predictions are probabilistic, not guaranteed.
    Maximum LLM price adjustment is capped at ±{meta.get('max_sentiment_shift_pct', 3)}% of LSTM output.
    </p>
    """, unsafe_allow_html=True)