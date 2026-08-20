import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureReactBoundaryError } from "../lib/sentry";

interface SilentErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  source?: string;
  /**
   * Optional hook fired in addition to the Sentry capture when a child throws.
   * Lets a caller add its own reporting (e.g. a privacy-safe PostHog event for a
   * widget that failed to mount). Must never throw meaningfully — a throw here is
   * swallowed so it cannot break the silent recovery.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface SilentErrorBoundaryState {
  hasError: boolean;
}

export class SilentErrorBoundary extends Component<
  SilentErrorBoundaryProps,
  SilentErrorBoundaryState
> {
  constructor(props: SilentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SilentErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const err = error instanceof Error ? error : new Error(String(error));
    try {
      captureReactBoundaryError(err, info, this.props.source ?? "silent-boundary");
    } catch {
      // Error reporting must not prevent the silent recovery.
    }
    try {
      this.props.onError?.(err, info);
    } catch {
      // A caller's extra reporting must not prevent the silent recovery either.
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
