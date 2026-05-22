import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[JARVIS] UI error:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#090909] px-6 text-center text-[#F0F0F0]">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="max-w-md text-sm text-[rgba(240,240,240,0.55)]">
            {String(error?.message || error)}
          </p>
          <button
            type="button"
            className="rounded-btn border border-[rgba(255,255,255,0.12)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)]"
            onClick={() => window.location.reload()}
          >
            Reload JARVIS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
