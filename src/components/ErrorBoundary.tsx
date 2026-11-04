import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="initialization panel"><h1>Vault interface interrupted</h1>
      <p>Reload to release this session and reconnect to your encrypted storage.</p><button onClick={() => window.location.reload()}>Reload Keeva</button></main>;
    return this.props.children;
  }
}
