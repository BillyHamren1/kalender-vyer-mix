import React from 'react';
import { reportDiagnostic } from '@/services/diagnostics/diagnostics';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
}

export class GlobalErrorBoundary extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): GlobalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportDiagnostic({
      code: 'REACT_RENDER_ERROR',
      source: 'react',
      severity: 'critical',
      error,
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-card-foreground">Appen stötte på ett fel</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Felet har sparats i diagnostiken med förslag på nästa åtgärd.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Ladda om
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}