import React from 'react';
import { RefreshCw } from 'lucide-react';
import { PageLogo } from '../layout/SprintNavIcon';

/**
 * Filet de sécurité : une erreur dans une vue n'affiche plus un écran noir,
 * elle propose de réessayer sans perdre le reste de l'application.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erreur d’interface :', error, info?.componentStack);
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="h-full flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <PageLogo name={this.props.icon || 'dashboard'} />
          <div>
            <h2 className="text-lg font-semibold text-zinc-50">Cette page a rencontré un problème</h2>
            <p className="text-sm text-zinc-400 mt-1.5">
              Rien n'est perdu : vos projets et vos serveurs sont intacts. Vous pouvez réessayer ou changer de page.
            </p>
          </div>
          <button type="button" className="btn theme-accent-btn" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
          <p className="text-[12px] font-mono text-zinc-600 break-words">{String(this.state.error?.message || '')}</p>
        </div>
      </div>
    );
  }
}
