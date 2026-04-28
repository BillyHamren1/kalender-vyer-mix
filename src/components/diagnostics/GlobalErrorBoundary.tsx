import React from 'react';
import { reportDiagnostic } from '@/services/diagnostics/diagnostics';
import { forceManualRecovery, isStaleModuleError } from '@/utils/moduleRecovery';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  isModuleError: boolean;
}

export class GlobalErrorBoundary extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = {
    hasError: false,
    isModuleError: false,
  };

  static getDerivedStateFromError(error: unknown): GlobalErrorBoundaryState {
    return {
      hasError: true,
      isModuleError: isStaleModuleError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportDiagnostic({
      code: isStaleModuleError(error) ? 'LAZY_ROUTE_BOUNDARY_FALLBACK' : 'REACT_RENDER_ERROR',
      source: 'react',
      severity: 'critical',
      error,
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleReload = () => {
    if (this.state.isModuleError) {
      // Stale chunk — purge caches + SW, then hard reload.
      forceManualRecovery();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const { isModuleError } = this.state;
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-card-foreground">
              {isModuleError ? 'Sidan kunde inte laddas' : 'Appen stötte på ett fel'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isModuleError
                ? 'Previewn verkar ha en gammal version cachad. Töm cachen och ladda om för att hämta senaste versionen.'
                : 'Felet har sparats i diagnostiken med förslag på nästa åtgärd.'}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {isModuleError ? 'Töm cache och ladda om' : 'Ladda om'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
