import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "../lib/sentry-client";

interface IslandBoundaryProps {
  children: ReactNode;
}

interface IslandBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class IslandBoundary extends Component<IslandBoundaryProps, IslandBoundaryState> {
  constructor(props: IslandBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): IslandBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[IslandBoundary] Uncaught error in island:", error, info);
    captureException(error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1.5rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--color-neutral-200, #e5e7eb)",
            backgroundColor: "var(--color-neutral-50, #f9fafb)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-neutral-600, #4b5563)",
              margin: 0,
            }}
          >
            This section failed to load.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.5rem 1.25rem",
              borderRadius: "9999px",
              border: "1px solid var(--color-neutral-300, #d1d5db)",
              backgroundColor: "transparent",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--color-neutral-700, #374151)",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
