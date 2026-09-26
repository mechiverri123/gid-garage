import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './JobOps';

// React error boundaries have to be class components — no hooks equivalent.
// This is the last line of defense: if anything anywhere in the tree throws
// during render (a bad hook order, a null field from the API, whatever),
// the whole app used to go fully blank with nothing in the DOM and no way
// out except a manual refresh. This catches that and shows a real recovery
// screen instead, so a bug becomes "click reload" rather than "app is dead
// until someone figures out to hard-refresh."
interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null; componentStack: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    reportError(error, { componentStack: info.componentStack, source: 'ErrorBoundary' });
  }

  copyDebugInfo = async () => {
    const { error, componentStack } = this.state;
    const report = [
      '--- GID Garage debug report ---',
      `Time: ${new Date().toISOString()}`,
      `URL: ${typeof location !== 'undefined' ? location.href : 'unknown'}`,
      `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
      '',
      `Error: ${error?.name ?? 'Unknown'}: ${error?.message ?? 'no message'}`,
      '',
      'Stack:',
      error?.stack ?? '(no stack available)',
      '',
      'Component stack:',
      componentStack ?? '(not available)',
      '--- end debug report ---',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(report);
      alert('Debug info copied — paste it into a chat with Claude (or any AI) to debug this.');
    } catch {
      // Clipboard denied — fall back to a visible, selectable block instead
      // of silently failing with no way to get the report out at all.
      window.prompt('Copy this debug info manually:', report);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#000',
          color: '#fff', padding: '24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif',
        }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#dc2626', marginBottom: '12px' }}>
            Something went wrong
          </p>
          <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '20px', maxWidth: '360px' }}>
            The page hit an error and couldn't finish loading. This has been reported. Reloading usually fixes it.
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => window.location.reload()} style={{
              border: '1px solid #dc2626', color: '#dc2626', background: 'transparent',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '10px 20px', cursor: 'pointer',
            }}>
              Reload
            </button>
            <button onClick={this.copyDebugInfo} style={{
              border: '1px solid #4b5563', color: '#9ca3af', background: 'transparent',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '10px 20px', cursor: 'pointer',
            }}>
              Copy Debug Info
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
