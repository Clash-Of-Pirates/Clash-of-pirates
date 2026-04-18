import { OnChainTxPanel } from './OnChainTxPanel';
import './Layout.css';

interface LayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Layout({ title, subtitle, children }: LayoutProps) {
  const resolvedTitle = title || import.meta.env.VITE_GAME_TITLE || 'Clash';
  const resolvedSubtitle = subtitle || import.meta.env.VITE_GAME_TAGLINE || 'Enter the arena';

  return (
    <div className="arena-root">
      <div className="arena-noise" />
      <div className="particles-container">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              '--delay': `${Math.random() * 5}s`,
              '--duration': `${15 + Math.random() * 10}s`,
              '--x': `${Math.random() * 100}vw`,
              '--size': `${2 + Math.random() * 4}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <header className="app-header">
        <div>
          <h1 className="app-title">{resolvedTitle}</h1>
          <p className="app-subtitle">{resolvedSubtitle}</p>
        </div>
      </header>
      <div className="layout-content">{children}</div>
      <footer className="app-footer">Soroban duel protocol secured by zero-knowledge proofs</footer>
      <div className="arena-vignette" />
      <div className="arena-flash" id="combat-flash" />
      <OnChainTxPanel />
    </div>
  );
}