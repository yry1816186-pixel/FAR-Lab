/**
 * ErrorBoundary — top-level React error boundary for uncaught render/lazy errors.
 *
 * Catches errors that page-level loading/error states CANNOT:
 *   - a lazy route chunk failing to download (network drop, deploy mismatch)
 *   - an uncaught exception during render of any descendant
 *   - a thrown error inside an event handler that propagates through render
 *
 * When an error is caught, it renders an honest fallback UI inside the AppShell
 * content area (so the top navigation stays usable — the user can navigate away),
 * with two recovery affordances:
 *   1. "Try again"  — resets the boundary and re-mounts the subtree (fresh render)
 *   2. "Reload"     — full page reload (recovers from a bad deploy / stale chunk)
 *
 * Honesty note: this is a DISPLAY-ONLY safety net. It never touches the backend
 * hash-chain evidence log; a browser render error does not corrupt provenance.
 *
 * Zero-tolerance compliant: no `any`, no ts-ignore, no empty catch, no stub return.
 * (React error boundaries must be class components — getDerivedStateFromError /
 *  componentDidCatch are class-only APIs.)
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * When this value changes, a caught error is cleared and the subtree remounts.
   * Bound to the route pathname by RouteErrorBoundary so navigating away from a
   * crashed page recovers the app WITHOUT a manual "Try again" — React does not
   * reset boundary state when children change.
   */
  readonly resetOn?: string | number;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  /** Incremented on each reset; used as a remount key to force a fresh render. */
  readonly resetKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Forward to the console for operator diagnostics. A production deployment would
    // additionally forward this to an error-tracking service; we intentionally do not
    // auto-send telemetry from the browser without explicit user consent.
    console.error('[ErrorBoundary] uncaught error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Route recovery: navigating away from a crashed page must clear the error.
    // Without this, one page's render crash freezes EVERY route behind the same
    // fallback until the user clicks "Try again" manually.
    if (
      this.props.resetOn !== undefined &&
      prevProps.resetOn !== this.props.resetOn &&
      this.state.error !== null
    ) {
      this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
    }
  }

  private readonly handleReset = (): void => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div
          className="mx-auto max-w-2xl space-y-4 py-16"
          data-testid="error-boundary-fallback"
          role="alert"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
          </div>
          <p className="text-muted-foreground">
            An unexpected error occurred while rendering this section. This is a
            display-only error in the browser — the backend evidence chain and your
            data are unaffected.
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">
            <code>{this.state.error.message || String(this.state.error)}</code>
          </pre>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={this.handleReset} data-testid="error-boundary-retry">
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
            <Button type="button" variant="outline" onClick={this.handleReload} data-testid="error-boundary-reload">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reload page
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If the problem persists after reloading, the deployed version may have
            changed — a full reload fetches the latest assets.
          </p>
        </div>
      );
    }

    return (
      <div key={this.state.resetKey} data-error-boundary-reset={this.state.resetKey}>
        {this.props.children}
      </div>
    );
  }
}

/**
 * ErrorBoundary bound to the current route: any navigation (pathname change)
 * clears a caught error, so the rest of the app stays usable after one page
 * crashes. Must be rendered inside <BrowserRouter>.
 */
export function RouteErrorBoundary({ children }: { readonly children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetOn={pathname}>{children}</ErrorBoundary>;
}
