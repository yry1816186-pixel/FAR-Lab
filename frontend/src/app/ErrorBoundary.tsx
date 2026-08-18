import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useT } from '@/shared/i18n/index.tsx';

function ErrorView({ onReload }: { readonly onReload: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center" data-testid="app-error">
      <h1 className="text-lg font-semibold text-danger">{t('app.error.title')}</h1>
      <p className="mt-2 text-sm text-ink2">{t('app.error.body')}</p>
      <button
        type="button"
        onClick={onReload}
        className="mt-4 rounded border border-borderStrong px-3 py-2 text-sm text-ink hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t('app.error.retry')}
      </button>
    </div>
  );
}

/** Route-level error boundary: a rendering fault never white-screens the app. */
export class RouteErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly hasError: boolean }> {
  constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { readonly hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local diagnostics only — FAR-Lab ships zero telemetry.
    console.error('[far-lab] route render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorView onReload={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
