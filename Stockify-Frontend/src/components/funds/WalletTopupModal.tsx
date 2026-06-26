import { useContext, useEffect, useRef, useState } from "react";
import "../../Styles/WalletTopupModal.css";
import { AuthContext } from "../../auth/AuthProvider";

type Decision = "APPROVE" | "WARN" | "REJECT";
type ModalState = "loading" | "result" | "confirming" | "success";

interface TopupResponse {
  decision: Decision;
  reason: string;
  advice: string;
  ruleVerdict: string;
  llmVerdict: string;
  amount: number;
  dailyCap?: number;
  performanceTier?: string;
  winRates?: {
    overall: string;
    "30d": string;
    "3d": string;
    "24h": string;
  } | null;
  weightedWinRate?: number | null;
}

interface Props {
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WalletTopupModal({ amount, onClose, onSuccess }: Props) {
  const { user } = useContext(AuthContext);
  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  const [modalState, setModalState] = useState<ModalState>("loading");
  const [topupData, setTopupData] = useState<TopupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    analyze();
  }, []);

  const getToken = async (): Promise<string> => {
    if (!user || typeof user.getIdToken !== "function") throw new Error("Not authenticated");
    return user.getIdToken(true);
  };

  const analyze = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${HOST}/api/payments/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const data: TopupResponse = await res.json();
      setTopupData(data);
      setModalState("result");
    } catch (err: any) {
      setError(err.message || "Failed to analyze");
      setModalState("result");
    }
  };

  const confirmTopup = async () => {
    if (!topupData) return;
    setModalState("confirming");
    try {
      const token = await getToken();
      const res = await fetch(`${HOST}/api/payments/topup/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to credit wallet");
      }
      setModalState("success");
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to confirm");
      setTopupData(prev => prev ? { ...prev } : null);
      setModalState("result");
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && modalState !== "confirming") onClose();
  };

  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  /* ── Left panel verdict pills state ── */
  const pillState = (() => {
    if (modalState === "loading") return { rule: "loading", llm: "loading" };
    if (!topupData) return { rule: "loading", llm: "loading" };
    const ruleVerdict = topupData.ruleVerdict === "HARD_BLOCK" ? "block" : "allow";
    const llmMap: Record<string, string> = { ALLOW: "allow", WARN: "warn", SOFT_BLOCK: "block" };
    return { rule: ruleVerdict, llm: llmMap[topupData.llmVerdict] || "allow" };
  })();

  return (
    <div className="wtm-backdrop" onClick={handleBackdropClick}>
      <div className="wtm-modal">

        {/* ════════ LEFT DARK SIDEBAR ════════ */}
        <div className="wtm-left">
          {/* Brand */}
          <div className="wtm-brand">
            <div className="wtm-brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 12V8C20 6.89543 19.1046 6 18 6H6C4.89543 6 4 6.89543 4 8V16C4 17.1046 4.89543 18 6 18H18C19.1046 18 20 17.1046 20 16V14M20 12H17C15.8954 12 15 12.8954 15 14C15 15.1046 15.8954 16 17 16H20M20 12V14"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="wtm-brand-name">PaperBull Vault</div>
              <div className="wtm-brand-sub">Smart Top-up</div>
            </div>
          </div>

          {/* Amount */}
          <div className="wtm-left-amount">
            <div className="wtm-left-amount-label">Adding</div>
            <div className="wtm-left-amount-value">
              <span className="wtm-currency">₹</span>{fmt(amount)}
            </div>
          </div>

          {/* Live verdict pills */}
          <div className="wtm-left-pills">
            <div className={`wtm-left-pill ${pillState.rule}`}>
              <div className="wtm-left-pill-dot" />
              ⚙️ Rule Engine —&nbsp;
              {pillState.rule === "loading" ? "Checking…" : pillState.rule === "allow" ? "Clear" : "Blocked"}
            </div>
            <div className={`wtm-left-pill ${pillState.llm}`}>
              <div className="wtm-left-pill-dot" />
              🤖 AI Engine —&nbsp;
              {pillState.llm === "loading" ? "Analyzing…" : pillState.llm === "allow" ? "Clear" : pillState.llm === "warn" ? "Warning" : "Blocked"}
            </div>
            {modalState !== "loading" && topupData && (
              <div className={`wtm-left-pill ${topupData.decision === "APPROVE" ? "allow" : topupData.decision === "WARN" ? "warn" : "block"}`}>
                <div className="wtm-left-pill-dot" />
                📋 Decision —&nbsp;
                {topupData.decision === "APPROVE" ? "Approved" : topupData.decision === "WARN" ? "Caution" : "Rejected"}
              </div>
            )}
          </div>

          {/* Limit and Win Rate Details */}
          {modalState !== "loading" && topupData && topupData.dailyCap !== undefined && (
            <div className="wtm-left-limit">
              <div className="wtm-left-limit-label">Daily Vault Limit</div>
              <div className="wtm-left-limit-value">₹{fmt(topupData.dailyCap)}</div>
              <div className="wtm-left-limit-tier">{topupData.performanceTier}</div>
              {topupData.weightedWinRate !== null && topupData.weightedWinRate !== undefined && (
                <div className="wtm-left-winrates">
                  <div className="wtm-left-winrate-row">
                    <span>Weighted Win Rate:</span>
                    <span className="val">{topupData.weightedWinRate}%</span>
                  </div>
                  {topupData.winRates && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div className="wtm-left-winrate-row">
                        <span>Overall / 30d:</span>
                        <span className="val">{topupData.winRates.overall} / {topupData.winRates["30d"]}</span>
                      </div>
                      <div className="wtm-left-winrate-row">
                        <span>3d / 24h:</span>
                        <span className="val">{topupData.winRates["3d"]} / {topupData.winRates["24h"]}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {/* <div className="wtm-left-footer">
            <span style={{ fontSize: 14 }}>🔒</span>
            <span className="wtm-left-footer-text">
              256-bit encrypted<br />AI behavioral analysis
            </span>
          </div> */}
        </div>

        {/* ════════ RIGHT PANEL ════════ */}
        <div className="wtm-right">
          <div className="wtm-right-bar" />

          <div className="wtm-right-header">
            {modalState !== "confirming" && (
              <button className="wtm-close-btn" onClick={onClose}>✕</button>
            )}
          </div>

          <div className="wtm-right-body">
            {/* Loading */}
            {modalState === "loading" && (
              <div className="wtm-loading-wrap">
                <div className="wtm-brain-container">
                  <div className="wtm-brain-ring" />
                  <div className="wtm-brain-ring-2" />
                  <div className="wtm-brain-icon">🧠</div>
                </div>
                <div className="wtm-loading-title">Analyzing Your Request</div>
                <div className="wtm-loading-sub">
                  Running rule checks &amp; AI behavioral analysis in parallel to protect your trading psychology.
                </div>
              </div>
            )}

            {/* Error */}
            {modalState === "result" && error && (
              <div className="wtm-result">
                <div className="wtm-result-icon wtm-icon-reject">⚠️</div>
                <div className="wtm-result-title">Something went wrong</div>
                <div className="wtm-result-sub">{error}</div>
                <div className="wtm-btn-group">
                  <button className="wtm-btn wtm-btn-ghost" onClick={onClose}>Close</button>
                </div>
              </div>
            )}

            {/* Result */}
            {modalState === "result" && !error && topupData && (
              <RightResult data={topupData} onConfirm={confirmTopup} onClose={onClose} />
            )}

            {/* Confirming */}
            {modalState === "confirming" && (
              <div className="wtm-confirming">
                <div className="wtm-mini-spin" />
                <div className="wtm-loading-title" style={{ fontSize: 17 }}>Crediting Wallet…</div>
                <div className="wtm-loading-sub">Updating your balance securely.</div>
              </div>
            )}

            {/* Success */}
            {modalState === "success" && (
              <div className="wtm-result">
                <div className="wtm-result-icon wtm-icon-approve" style={{ fontSize: 38 }}>🎉</div>
                <div className="wtm-result-title">Money Added!</div>
                <div className="wtm-result-sub">
                  ₹{fmt(amount)} has been credited to your PaperBull Vault.{" "}
                  <span style={{ color: "#10b981", fontWeight: 700 }}>Happy trading!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════
   RIGHT PANEL RESULT VIEW
══════════════════════════ */
function RightResult({
  data,
  onConfirm,
  onClose,
}: {
  data: TopupResponse;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { decision, reason, advice } = data;

  const cfg = {
    APPROVE: {
      iconClass: "wtm-icon-approve",
      icon: "✅",
      title: "Good to Go!",
      adviceClass: "wtm-advice-approve",
      adviceEmoji: "💡",
    },
    WARN: {
      iconClass: "wtm-icon-warn",
      icon: "⚠️",
      title: "Proceed with Caution",
      adviceClass: "wtm-advice-warn",
      adviceEmoji: "🤔",
    },
    REJECT: {
      iconClass: "wtm-icon-reject",
      icon: "🚫",
      title: "Deposit Blocked",
      adviceClass: "wtm-advice-reject",
      adviceEmoji: "💬",
    },
  }[decision];

  return (
    <div className="wtm-result">
      <div className={`wtm-result-icon ${cfg.iconClass}`}>{cfg.icon}</div>
      <div className="wtm-result-title">{cfg.title}</div>
      <div className="wtm-result-sub">{reason}</div>

      {advice && (
        <div className={`wtm-advice ${cfg.adviceClass}`}>
          <span className="wtm-advice-emoji">{cfg.adviceEmoji}</span>
          <span className="wtm-advice-text">"{advice}"</span>
        </div>
      )}

      <div className="wtm-btn-group">
        {decision === "APPROVE" && (
          <>
            <button className="wtm-btn wtm-btn-primary" onClick={onConfirm}>
              ✓ Add Money Now
            </button>
            <button className="wtm-btn wtm-btn-ghost" onClick={onClose}>Cancel</button>
          </>
        )}
        {decision === "WARN" && (
          <>
            <button className="wtm-btn wtm-btn-amber" onClick={onConfirm}>
              → Proceed Anyway
            </button>
            <button className="wtm-btn wtm-btn-ghost" onClick={onClose}>Cancel</button>
          </>
        )}
        {decision === "REJECT" && (
          <button className="wtm-btn wtm-btn-ghost" style={{ flex: "none", width: "100%" }} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
