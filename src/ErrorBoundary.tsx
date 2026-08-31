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
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack, source: 'ErrorBoundary' });
  }

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
          <button onClick={() => window.location.reload()} style={{
            border: '1px solid #dc2626', color: '#dc2626', background: 'transparent',
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '10px 20px', cursor: 'pointer',
          }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
