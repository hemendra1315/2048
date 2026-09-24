import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { crashReporter } from '../../lib/crashReporting';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Short label for logs, e.g. "social" or "admin". */
  name?: string;
  /** Called after the user chooses "Try again", before the subtree is re-rendered. */
  onReset?: () => void;
  /** Extra action shown in the fallback, e.g. returning to the cover screen. */
  secondaryAction?: { label: string; onClick: () => void };
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render and lifecycle errors in its subtree so one failing component shows a fallback
 * card instead of unmounting the whole app (a blank/black screen).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report crash to telemetry service
    crashReporter.recordCrash({
      message: error.message,
      stack: error.stack || info.componentStack || undefined,
      component: `ErrorBoundary:${this.props.name ?? 'app'}`,
    });
  }

  private reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const { secondaryAction } = this.props;
    return (
      <div role="alert" className="min-h-screen w-full bg-[#050505] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#0C0D0F] border border-[#1E2025] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">Something went wrong</h2>
            <p className="text-xs text-[#A7ABB3]">This screen hit an unexpected error. Your data is safe.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-[#10B981] hover:bg-emerald-400 text-black font-bold py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Try again</span>
            </button>
            {secondaryAction && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  secondaryAction.onClick();
                }}
                className="w-full min-h-[44px] flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold text-[#A7ABB3] hover:text-white bg-[#131417] border border-[#1E2025] transition-colors cursor-pointer"
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
