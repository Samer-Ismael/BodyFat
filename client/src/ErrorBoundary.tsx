import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { err: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("UI error:", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <main style={{ padding: "1.5rem", maxWidth: 640, color: "#eef2f6", fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: "1.1rem" }}>Something broke</h1>
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#1a222c",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
              color: "#ff453a",
            }}
          >
            {this.state.err.message}
          </pre>
          <p style={{ color: "#8b9bab", marginTop: 16, fontSize: 14 }}>
            Reload the page. If it persists, open DevTools (F12) → Console and note any red errors.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
