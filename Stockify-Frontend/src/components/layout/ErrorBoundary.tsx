import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.fallback) {
        return this.fallback;
      }
      return (
        <div style={{ padding: "32px", margin: "24px auto", maxWidth: "800px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", color: "#991b1b", fontFamily: "sans-serif" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700 }}>Something went wrong rendering this view</h3>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#b91c1c" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }

  private get fallback(): ReactNode {
    return this.props.fallback;
  }
}
