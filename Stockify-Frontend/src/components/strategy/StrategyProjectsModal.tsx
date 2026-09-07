import React, { useState, useMemo } from "react";
import type {
  IndicatorConfig,
  TrendFilterConfig,
  ConditionItem,
  PositionSizingConfig,
  StopLossConfig,
  TakeProfitConfig,
  PortfolioGuardrailsConfig
} from "../../pages/AlgoBacktest";

export interface StrategyProject {
  id: string;
  name: string;
  description?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  selectedBasket?: string;
  period: string;
  candleInterval: string;
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  indicators: IndicatorConfig[];
  trendFilter: TrendFilterConfig;
  entryLogicType: "SINGLE" | "AND" | "OR";
  entryConditions: ConditionItem[];
  exitLogicType: "SINGLE" | "AND" | "OR";
  exitConditions: ConditionItem[];
  positionSizing: PositionSizingConfig;
  stopLoss: StopLossConfig;
  takeProfit: TakeProfitConfig;
  breakevenTriggerPct?: number;
  portfolioGuardrails: PortfolioGuardrailsConfig;
  lastReport?: {
    totalReturnPct?: number;
    winRatePct?: number;
    totalTrades?: number;
    finalEquity?: number;
    backtestedAt?: string;
  };
}

interface StrategyProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: StrategyProject[];
  activeProjectId?: string | null;
  onSaveProject: (project: Omit<StrategyProject, "id" | "createdAt" | "updatedAt">, targetId?: string) => void;
  onLoadProject: (project: StrategyProject) => void;
  onDeleteProject: (projectId: string) => void;
  onBacktestProject: (project: StrategyProject) => void;
  onExecuteProject: (project: StrategyProject) => void;
  currentStudioState: Omit<StrategyProject, "id" | "createdAt" | "updatedAt" | "name" | "description">;
}

export const StrategyProjectsModal: React.FC<StrategyProjectsModalProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSaveProject,
  onLoadProject,
  onDeleteProject,
  onBacktestProject,
  onExecuteProject,
  currentStudioState
}) => {
  const [modalMode, setModalMode] = useState<"list" | "save_new" | "export_import">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Save Dialog Form State
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectCategory, setProjectCategory] = useState("Trend Following");
  const [saveTargetId, setSaveTargetId] = useState<string | undefined>(undefined);

  // Import JSON State
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const CATEGORIES = ["ALL", "Trend Following", "Momentum", "Mean Reversion", "Scalping", "Breakout", "Custom"];

  const openSaveDialog = (targetExistingId?: string) => {
    const existing = projects.find(p => p.id === targetExistingId);
    if (existing) {
      setProjectName(existing.name);
      setProjectDescription(existing.description || "");
      setProjectCategory(existing.category || "Trend Following");
      setSaveTargetId(existing.id);
    } else {
      setProjectName(`Strategy Project - ${currentStudioState.symbol} (${new Date().toLocaleDateString()})`);
      setProjectDescription("");
      setProjectCategory("Trend Following");
      setSaveTargetId(undefined);
    }
    setModalMode("save_new");
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    onSaveProject({
      ...currentStudioState,
      name: projectName.trim(),
      description: projectDescription.trim(),
      category: projectCategory
    }, saveTargetId);

    setModalMode("list");
  };

  const handleImportSubmit = () => {
    setImportError(null);
    try {
      const parsed = JSON.parse(importJsonText);
      if (!parsed.name || !parsed.indicators) {
        throw new Error("Invalid format. Strategy Project must contain at least 'name' and 'indicators'.");
      }
      onSaveProject({
        ...currentStudioState,
        ...parsed,
        name: parsed.name + " (Imported)"
      });
      setImportJsonText("");
      setModalMode("list");
    } catch (e: any) {
      setImportError(e.message || "Invalid JSON syntax");
    }
  };

  const handleExportProject = (proj: StrategyProject) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(proj, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${proj.name.replace(/\s+/g, "_")}_project.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            p.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (p.description || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === "ALL" || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [projects, searchTerm, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="pb-modal-overlay" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(3, 7, 18, 0.85)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "20px"
    }}>
      <div className="pb-modal-card" style={{
        background: "#0b1523",
        border: "1px solid #1e3a5f",
        borderRadius: "14px",
        width: "100%",
        maxWidth: "960px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)",
        overflow: "hidden"
      }}>
        {/* Modal Header */}
        <div style={{
          padding: "18px 24px",
          borderBottom: "1px solid #1e3a5f",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(90deg, #0d1a2d 0%, #0b1523 100%)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.4rem" }}>📁</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#f8fafc", fontWeight: "700" }}>
                PaperBull Strategy Projects Hub
              </h2>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                Create, organize, save, backtest, and execute algorithmic trading strategies as standalone projects.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {modalMode === "list" && (
              <button
                type="button"
                onClick={() => openSaveDialog()}
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  color: "#fff",
                  border: "1px solid #38bdf8",
                  borderRadius: "8px",
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                💾 Save Current As Project
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "1.3rem",
                cursor: "pointer",
                padding: "4px 8px"
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {/* VIEW: SAVE NEW PROJECT DIALOG */}
          {modalMode === "save_new" && (
            <form onSubmit={handleSaveSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#0d1a2d", padding: "16px", borderRadius: "10px", border: "1px solid #1e3a5f" }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", color: "#38bdf8" }}>
                  {saveTargetId ? "✏️ Update Existing Strategy Project" : "💾 Save Strategy Project"}
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "6px", fontWeight: "600" }}>
                      Project Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      placeholder="e.g. Nifty Intraday SuperTrend Scalper"
                      style={{
                        width: "100%",
                        background: "#08111d",
                        border: "1px solid #38bdf8",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        color: "#fff",
                        fontSize: "0.92rem",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "6px", fontWeight: "600" }}>
                        Category
                      </label>
                      <select
                        value={projectCategory}
                        onChange={e => setProjectCategory(e.target.value)}
                        style={{
                          width: "100%",
                          background: "#08111d",
                          border: "1px solid #1e3a5f",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          color: "#fff",
                          fontSize: "0.88rem"
                        }}
                      >
                        {CATEGORIES.filter(c => c !== "ALL").map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "6px", fontWeight: "600" }}>
                        Target Symbol & Timeframe
                      </label>
                      <div style={{
                        padding: "10px 14px",
                        background: "#08111d",
                        border: "1px solid #1e3a5f",
                        borderRadius: "8px",
                        color: "#38bdf8",
                        fontSize: "0.88rem",
                        fontWeight: "600"
                      }}>
                        {currentStudioState.symbol} • {currentStudioState.candleInterval.toUpperCase()} • {currentStudioState.period.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "6px", fontWeight: "600" }}>
                      Description & Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={projectDescription}
                      onChange={e => setProjectDescription(e.target.value)}
                      placeholder="e.g. 5-minute crossover strategy with strict 1.5% trailing stop and ATR volatility filter."
                      style={{
                        width: "100%",
                        background: "#08111d",
                        border: "1px solid #1e3a5f",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        color: "#fff",
                        fontSize: "0.88rem",
                        boxSizing: "border-box"
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Strategy Highlights Summary */}
              <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "14px", borderRadius: "8px", border: "1px solid #1e3a5f" }}>
                <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: "bold", textTransform: "uppercase" }}>
                  Project Configuration Snapshot:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                  {currentStudioState.indicators.map((ind, i) => (
                    <span key={i} style={{ background: "#08111d", border: "1px solid #38bdf8", color: "#38bdf8", padding: "3px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "600" }}>
                      ● {ind.name} ({Object.values(ind.params || {}).join(", ") || ind.key})
                    </span>
                  ))}
                  <span style={{ background: "#08111d", border: "1px solid #10b981", color: "#10b981", padding: "3px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "600" }}>
                    🎯 Entry: {currentStudioState.entryConditions.length} Rules
                  </span>
                  <span style={{ background: "#08111d", border: "1px solid #ef4444", color: "#ef4444", padding: "3px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "600" }}>
                    🛡️ SL -{currentStudioState.stopLoss.value}%
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setModalMode("list")}
                  style={{
                    background: "transparent",
                    border: "1px solid #334155",
                    color: "#94a3b8",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    border: "1px solid #10b981",
                    color: "#fff",
                    padding: "8px 20px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  ✓ Save Strategy Project
                </button>
              </div>
            </form>
          )}

          {/* VIEW: IMPORT / EXPORT */}
          {modalMode === "export_import" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ background: "#0d1a2d", padding: "16px", borderRadius: "10px", border: "1px solid #1e3a5f" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: "1.05rem", color: "#38bdf8" }}>
                  📥 Import Strategy Project from JSON
                </h3>
                <textarea
                  rows={8}
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder="Paste strategy project JSON definition here..."
                  style={{
                    width: "100%",
                    background: "#08111d",
                    border: "1px solid #1e3a5f",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    color: "#38bdf8",
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    boxSizing: "border-box"
                  }}
                />
                {importError && (
                  <p style={{ color: "#ef4444", fontSize: "0.82rem", margin: "6px 0 0 0" }}>⚠️ {importError}</p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setModalMode("list")}
                    style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "6px 14px", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={!importJsonText.trim()}
                    style={{ background: "#0284c7", border: "none", color: "#fff", padding: "6px 16px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}
                  >
                    Import &amp; Save Project
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: PROJECT LIST / GALLERY */}
          {modalMode === "list" && (
            <div>
              {/* Search & Filter Bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "18px", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "260px" }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="🔍 Search saved projects by name, symbol, notes..."
                    style={{
                      flex: 1,
                      background: "#08111d",
                      border: "1px solid #1e3a5f",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      color: "#fff",
                      fontSize: "0.88rem"
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        background: selectedCategory === cat ? "#0284c7" : "#0d1a2d",
                        border: `1px solid ${selectedCategory === cat ? "#38bdf8" : "#1e3a5f"}`,
                        color: selectedCategory === cat ? "#fff" : "#94a3b8",
                        borderRadius: "6px",
                        padding: "5px 10px",
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        fontWeight: selectedCategory === cat ? "700" : "500"
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setModalMode("export_import")}
                    style={{
                      background: "#112238",
                      border: "1px solid #243c5a",
                      color: "#38bdf8",
                      borderRadius: "6px",
                      padding: "5px 10px",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      fontWeight: "600"
                    }}
                  >
                    📥 Import JSON
                  </button>
                </div>
              </div>

              {/* Projects Grid */}
              {filteredProjects.length === 0 ? (
                <div style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  background: "#0d1a2d",
                  borderRadius: "12px",
                  border: "1px dashed #1e3a5f"
                }}>
                  <span style={{ fontSize: "2rem" }}>📂</span>
                  <h4 style={{ color: "#f8fafc", margin: "10px 0 4px 0" }}>No Strategy Projects Found</h4>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: "0 0 16px 0" }}>
                    {searchTerm || selectedCategory !== "ALL"
                      ? "No projects match your search criteria."
                      : "Save your active indicators, rules, and parameters as a reusable strategy project."}
                  </p>
                  <button
                    type="button"
                    onClick={() => openSaveDialog()}
                    style={{
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      color: "#fff",
                      border: "1px solid #38bdf8",
                      borderRadius: "8px",
                      padding: "8px 18px",
                      fontSize: "0.85rem",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    💾 Save Active Strategy As First Project
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: "16px" }}>
                  {filteredProjects.map(proj => {
                    const isActive = activeProjectId === proj.id;
                    return (
                      <div
                        key={proj.id}
                        style={{
                          background: isActive ? "linear-gradient(145deg, #0f243c 0%, #0b1523 100%)" : "#0d1a2d",
                          border: `1px solid ${isActive ? "#38bdf8" : "#1e3a5f"}`,
                          borderRadius: "10px",
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: "12px",
                          boxShadow: isActive ? "0 0 15px rgba(56, 189, 248, 0.2)" : "none",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <div>
                          {/* Card Header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <h4 style={{ margin: 0, fontSize: "1rem", color: "#f8fafc", fontWeight: "700" }}>
                                  {proj.name}
                                </h4>
                                {isActive && (
                                  <span style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.68rem", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              {proj.category && (
                                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: "600" }}>
                                  🏷️ {proj.category}
                                </span>
                              )}
                            </div>

                            <span style={{
                              background: "#08111d",
                              border: "1px solid #243c5a",
                              color: "#38bdf8",
                              fontWeight: "700",
                              fontSize: "0.78rem",
                              padding: "3px 8px",
                              borderRadius: "6px"
                            }}>
                              {proj.symbol} • {proj.candleInterval?.toUpperCase()}
                            </span>
                          </div>

                          {proj.description && (
                            <p style={{ margin: "4px 0 10px 0", fontSize: "0.8rem", color: "#cbd5e1", lineHeight: "1.4" }}>
                              {proj.description}
                            </p>
                          )}

                          {/* Indicators & Rules Strip */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
                            {(proj.indicators || []).map((ind, i) => (
                              <span
                                key={i}
                                style={{
                                  background: "#08111d",
                                  border: "1px solid #1e3a5f",
                                  color: "#94a3b8",
                                  fontSize: "0.72rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px"
                                }}
                              >
                                {ind.name} {ind.params?.period ? `(${ind.params.period})` : ""}
                              </span>
                            ))}
                            <span style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px" }}>
                              SL -{proj.stopLoss?.value || 1.5}%
                            </span>
                            <span style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", fontSize: "0.72rem", padding: "2px 6px", borderRadius: "4px" }}>
                              TP {proj.takeProfit?.type === "RISK_REWARD" ? `1:${proj.takeProfit.ratio} R:R` : `+${proj.takeProfit?.value}%`}
                            </span>
                          </div>

                          {/* Cached Performance Report if available */}
                          {proj.lastReport && (
                            <div style={{
                              background: "#08111d",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: "1px solid #1e3a5f",
                              display: "grid",
                              gridTemplateColumns: "repeat(3, 1fr)",
                              gap: "8px",
                              textAlign: "center",
                              fontSize: "0.74rem"
                            }}>
                              <div>
                                <span style={{ color: "#94a3b8", display: "block" }}>Return</span>
                                <span style={{ color: (proj.lastReport.totalReturnPct ?? 0) >= 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>
                                  {(proj.lastReport.totalReturnPct ?? 0) >= 0 ? "+" : ""}{(proj.lastReport.totalReturnPct ?? 0).toFixed(2)}%
                                </span>
                              </div>
                              <div>
                                <span style={{ color: "#94a3b8", display: "block" }}>Win Rate</span>
                                <span style={{ color: "#f8fafc", fontWeight: "bold" }}>
                                  {(proj.lastReport.winRatePct ?? 0).toFixed(1)}%
                                </span>
                              </div>
                              <div>
                                <span style={{ color: "#94a3b8", display: "block" }}>Trades</span>
                                <span style={{ color: "#f8fafc", fontWeight: "bold" }}>
                                  {proj.lastReport.totalTrades ?? 0}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Project Actions Toolbar */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          borderTop: "1px solid #1e3a5f",
                          paddingTop: "10px",
                          marginTop: "6px"
                        }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                onLoadProject(proj);
                                onClose();
                              }}
                              style={{
                                background: "#0284c7",
                                border: "none",
                                color: "#fff",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                fontSize: "0.76rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                              title="Load strategy into studio builder"
                            >
                              ✏️ Load Studio
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onBacktestProject(proj);
                                onClose();
                              }}
                              style={{
                                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                border: "none",
                                color: "#fff",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                fontSize: "0.76rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                              title="Run backtest on this project"
                            >
                              ▶ Backtest
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onExecuteProject(proj);
                              }}
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                border: "1px solid #f59e0b",
                                color: "#f59e0b",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                fontSize: "0.76rem",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                              title="Execute live/paper signal analysis"
                            >
                              ⚡ Execute
                            </button>
                          </div>

                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => openSaveDialog(proj.id)}
                              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.85rem", padding: "2px 4px" }}
                              title="Rename / Edit details"
                            >
                              ⚙️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportProject(proj)}
                              style={{ background: "transparent", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: "0.85rem", padding: "2px 4px" }}
                              title="Export project to JSON"
                            >
                              📤
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Delete strategy project "${proj.name}"?`)) {
                                  onDeleteProject(proj.id);
                                }
                              }}
                              style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.85rem", padding: "2px 4px" }}
                              title="Delete project"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid #1e3a5f",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#08111d",
          fontSize: "0.8rem",
          color: "#94a3b8"
        }}>
          <span>{projects.length} Saved Strategy Project{projects.length === 1 ? "" : "s"}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#cbd5e1",
              padding: "5px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
