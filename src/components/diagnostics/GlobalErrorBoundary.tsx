import React from 'react';
import { reportDiagnostic, type DiagnosticEvent } from '@/services/diagnostics/diagnostics';
import { forceManualRecovery, isStaleModuleError } from '@/utils/moduleRecovery';

interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  isModuleError: boolean;
  code: string | null;
  reference: string | null;
  details: string | null;
  copied: boolean;
}

const INITIAL_STATE: GlobalErrorBoundaryState = {
  hasError: false,
  isModuleError: false,
  code: null,
  reference: null,
  details: null,
  copied: false,
};

export class GlobalErrorBoundary extends React.Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = INITIAL_STATE;

  static getDerivedStateFromError(error: unknown): Partial<GlobalErrorBoundaryState> {
    return {
      hasError: true,
      isModuleError: isStaleModuleError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const code = isStaleModuleError(error) ? 'LAZY_ROUTE_BOUNDARY_FALLBACK' : 'REACT_RENDER_ERROR';
    const event: DiagnosticEvent | null = reportDiagnostic({
      code,
      source: 'react',
      severity: 'critical',
      error,
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });

    const reference = event?.id ?? `local_${Date.now().toString(36)}`;
    const details = [
      `Felkod: ${code}`,
      `Referens: ${reference}`,
      `Sida: ${typeof window === 'undefined' ? '-' : window.location.pathname}`,
      `Tid: ${new Date().toISOString()}`,
      `Meddelande: ${error?.message ?? '-'}`,
      `Stack: ${(error?.stack ?? '-').slice(0, 2000)}`,
      `Komponenter: ${(errorInfo.componentStack ?? '-').slice(0, 2000)}`,
    ].join('\n');

    this.setState({ code, reference, details });
  }

  handleReload = () => {
    if (this.state.isModuleError) {
      // Stale chunk — purge caches + SW, then hard reload.
      forceManualRecovery();
    } else {
      window.location.reload();
    }
  };

  handleCopy = async () => {
    if (!this.state.details) return;
    try {
      await navigator.clipboard.writeText(this.state.details);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    if (this.state.hasError) {
      const { isModuleError, code, reference, copied } = this.state;
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-card-foreground">
              {isModuleError ? 'Sidan kunde inte laddas' : 'Appen stötte på ett fel'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isModuleError
                ? 'Previewn verkar ha en gammal version cachad. Töm cachen och ladda om för att hämta senaste versionen.'
                : 'Felet har sparats. Kopiera felinfon och skicka den till supporten så kan vi se exakt vad som hände.'}
            </p>

            {(code || reference) && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs font-mono text-muted-foreground break-all">
                {code}
                {reference ? ` · ${reference}` : ''}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {isModuleError ? 'Töm cache och ladda om' : 'Ladda om'}
              </button>
              {this.state.details && (
                <button
                  type="button"
                  onClick={this.handleCopy}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground"
                >
                  {copied ? 'Kopierat!' : 'Kopiera felinfo'}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
