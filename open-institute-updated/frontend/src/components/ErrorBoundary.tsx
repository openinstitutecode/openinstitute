import { Component, ReactNode } from "react";

// KFX-041 / KUX-008 — a render error in any page used to blank the whole app (no boundary existed).
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("UI error caught by boundary", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="container-page py-20">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-3 font-display text-3xl font-medium">This page hit an unexpected error.</h1>
        <p className="mt-3 max-w-xl text-sm text-ink/70">Your data has not been changed. Reload the page; if it keeps happening, tell the helpdesk what you were doing.</p>
        <div className="mt-6 flex gap-3">
          <button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
          <a className="btn-secondary" href="/">Go to home</a>
        </div>
      </div>
    );
  }
}
