import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw, ChevronDown, ChevronUp, Copy } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    componentStack: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleTryAgain = (): void => {
    this.setState({ hasError: false, error: null, componentStack: null, showDetails: false, copied: false });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleCopyDetails = (): void => {
    const { error, componentStack } = this.state;
    const details = [
      `Time: ${new Date().toISOString()}`,
      `Error: ${error?.message ?? 'Unknown error'}`,
      error?.stack ? `Stack:\n${error.stack}` : null,
      componentStack ? `Component stack:${componentStack}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    navigator.clipboard
      .writeText(details)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch(() => {
        // Clipboard unavailable; nothing to do.
      });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, componentStack, showDetails, copied } = this.state;

    return (
      <div className="min-h-screen bg-vault-950 text-vault-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-vault-900 border border-vault-700/80 rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h2 className="text-base font-bold text-white mb-1">Something went wrong</h2>
          <p className="text-xs text-vault-400 mb-5">
            The app hit an unexpected error. Your data is safe - try again, or reload if that doesn't help.
          </p>

          <div className="w-full flex gap-2 mb-3">
            <button
              onClick={this.handleTryAgain}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 text-xs font-bold rounded-xl transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-200 text-xs font-bold rounded-xl transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload
            </button>
          </div>

          <button
            onClick={() => this.setState({ showDetails: !showDetails })}
            className="flex items-center gap-1 text-[11px] text-vault-500 hover:text-vault-300 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{showDetails ? 'Hide' : 'Show'} technical details</span>
          </button>

          {showDetails && (
            <div className="w-full mt-3 text-left animate-fade-in">
              <pre className="w-full max-h-40 overflow-auto bg-vault-950 border border-vault-800 rounded-xl p-3 text-[10px] text-vault-400 whitespace-pre-wrap break-words">
                {error?.message || 'Unknown error'}
                {componentStack ? `\n${componentStack.trim()}` : ''}
              </pre>
              <button
                onClick={this.handleCopyDetails}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 text-[11px] font-semibold rounded-lg transition-all"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'Copied' : 'Copy details'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
