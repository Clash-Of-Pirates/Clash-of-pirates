import { useEffect, useRef } from 'react';
import { WalletSwitcher } from './WalletSwitcher';
import { PirateScene } from './PirateScene';
import './Layout.css';

import { WalletStandalone } from './WalletStandalone';
import './LayoutStandalone.css';

interface LayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Layout({ title, subtitle, children }: LayoutProps) {
  const resolvedTitle = title || import.meta.env.VITE_GAME_TITLE || 'Clash of Pirates';
  const resolvedSubtitle = subtitle || import.meta.env.VITE_GAME_TAGLINE || 'Zero-Knowledge Combat on the High Seas';

  return (
    <div className="pirate-arena">
      {/* 3D Background Scene */}
      <PirateScene />
      
      {/* Atmospheric Fog Layers */}
      {/* <div className="fog-layer fog-layer-1" />
      <div className="fog-layer fog-layer-2" />
      <div className="fog-layer fog-layer-3" /> */}
      
      {/* Floating Particles */}
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

      {/* Vignette & Film Grain */}
      {/* <div className="vignette" />
      <div className="film-grain" /> */}

      {/* Main Content Container */}
      <div className="arena-container">
        <header className="arena-header">
          <div className="header-left">
            <div className="skull-divider">
              <svg viewBox="0 0 24 24" fill="currentColor" className="skull-icon">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 2.76 1.12 5.26 2.93 7.07L12 22l7.07-2.93C20.88 17.26 22 14.76 22 12c0-5.52-4.48-10-10-10zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
                <circle cx="9" cy="11" r="1.5"/>
                <circle cx="15" cy="11" r="1.5"/>
                <path d="M12 13c-1.1 0-2 .9-2 2h4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
            
            <div className="brand-container">
              <h1 className="brand-title">
                <span className="title-swords">⚔️</span>
                {resolvedTitle}
                <span className="title-swords">⚔️</span>
              </h1>
              <p className="brand-subtitle">{resolvedSubtitle}</p>
            </div>
            
            <div className="skull-divider skull-divider-right">
              <svg viewBox="0 0 24 24" fill="currentColor" className="skull-icon">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 2.76 1.12 5.26 2.93 7.07L12 22l7.07-2.93C20.88 17.26 22 14.76 22 12c0-5.52-4.48-10-10-10zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
                <circle cx="9" cy="11" r="1.5"/>
                <circle cx="15" cy="11" r="1.5"/>
                <path d="M12 13c-1.1 0-2 .9-2 2h4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
          </div>

          <div className="header-actions">
            <div className="network-badge testnet-badge">
              <span className="badge-icon">⚓</span>
              <span>Testnet Waters</span>
            </div>
            <div className="network-badge dev-badge">
              <span className="badge-icon">🏴‍☠️</span>
              <span>Dev Crew</span>
            </div>
            <div className="wallet-container">
              <WalletSwitcher />
              {/* <WalletStandalone /> */}
            </div>
          </div>
        </header>

        <main className="arena-main">
          <div className="content-frame">
            {children}
          </div>
        </main>

        <footer className="arena-footer">
          <div className="footer-decoration">
            <svg className="rope-divider" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path d="M0,10 Q25,5 50,10 T100,10" stroke="currentColor" fill="none" strokeWidth="2"/>
              <path d="M0,12 Q25,7 50,12 T100,12" stroke="currentColor" fill="none" strokeWidth="1.5" opacity="0.5"/>
            </svg>
          </div>
          <div className="footer-content">
            <span className="footer-text">⚓ Built with the Stellar Game Studio</span>
            <span className="footer-divider">|</span>
            <span className="footer-text">🏴‍☠️ Powered by Zero-Knowledge Proofs</span>
          </div>
          <div className="footer-decoration footer-decoration-bottom">
            <svg className="rope-divider" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path d="M0,10 Q25,15 50,10 T100,10" stroke="currentColor" fill="none" strokeWidth="2"/>
              <path d="M0,8 Q25,13 50,8 T100,8" stroke="currentColor" fill="none" strokeWidth="1.5" opacity="0.5"/>
            </svg>
          </div>
        </footer>
      </div>

      {/* Combat Flash Overlay (for dramatic moments) */}
      <div className="combat-flash" id="combat-flash" />
    </div>
  );
}