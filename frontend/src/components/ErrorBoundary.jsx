import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bnc-bg flex items-center justify-center p-4">
          <div className="bg-bnc-surface border border-bnc-border rounded-lg shadow-lg p-6 max-w-lg w-full">
            <h1 className="text-xl font-bold text-bnc-red mb-2">Bir hata oluştu</h1>
            <pre className="text-sm text-bnc-textSec bg-bnc-surfaceAlt border border-bnc-border p-3 rounded overflow-auto max-h-48">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bnc-btn-primary"
            >
              Sayfayı yenile
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
