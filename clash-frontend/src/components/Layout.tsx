/**
 * Layout.tsx  —  Updated with auth-aware navbar
 *
 * New props:
 *   user              — AuthUser | null (from useAuth)
 *   onShowAuth        — open PasskeyAuthModal
 *   onShowChallenges  — toggle ChallengeManager
 *   onLogout          — logout handler
 */

import { useRef } from 'react';
import { PirateScene } from './PirateScene';
import type { AuthUser } from '@/services/passkeyService';
import './Layout.css';
import './LayoutAuth.css'; 

interface LayoutProps {
  title?:             string;
  subtitle?:          string;
  children:           React.ReactNode;
  user?:              AuthUser | null;
  onShowAuth?:        () => void;
  onShowChallenges?:  () => void;
  onLogout?:          () => void;
}

export function Layout({
  title,
  subtitle,
  children,
  user,
  onShowAuth,
  onShowChallenges,
  onLogout,
}: LayoutProps) {
  const resolvedTitle    = title    || import.meta.env.VITE_GAME_TITLE    || 'Clash of Pirates';
  const resolvedSubtitle = subtitle || import.meta.env.VITE_GAME_TAGLINE  || 'Zero-Knowledge Combat on the High Seas';

  return (
    <div className="pirate-arena">
      {/* 3D Background Scene */}
      <PirateScene />

      {/* Floating Particles */}
      <div className="particles-container">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              '--delay':    `${Math.random() * 5}s`,
              '--duration': `${15 + Math.random() * 10}s`,
              '--x':        `${Math.random() * 100}vw`,
              '--size':     `${2 + Math.random() * 4}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Main Content Container */}
      <div className="arena-container">
        {/* ─── HEADER ─── */}
        <header className="arena-header">
          {/* Left — brand */}
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

          {/* Right — actions */}
          <div className="header-actions">
            {/* Testnet badge */}
            <div className="network-badge testnet-badge">
              <span className="badge-icon">⚓</span>
              <span>Testnet Waters</span>
            </div>

            {user ? (
              /* ── Logged-in state ── */
              <>
                {/* Challenges button with pulse if there are pending */}
                <button
                  className="nav-challenge-btn"
                  onClick={onShowChallenges}
                  title="Challenge Hub"
                >
                  <span>⚔️</span>
                  <span className="nav-challenge-label">Challenges</span>
                </button>

                {/* User pill */}
                <div className="nav-user-pill">
                  <span className="nav-user-avatar">🏴‍☠️</span>
                  <div className="nav-user-info">
                    <span className="nav-user-name">{user.username}</span>
                    <span className="nav-user-addr">
                      {user.address.slice(0, 4)}…{user.address.slice(-4)}
                    </span>
                  </div>
                  <button
                    className="nav-logout-btn"
                    onClick={onLogout}
                    title="Leave ship"
                  >
                    ⛵
                  </button>
                </div>
              </>
            ) : (
              /* ── Logged-out state ── */
              <button className="nav-login-btn" onClick={onShowAuth}>
                <span>☠</span>
                <span>Board the Ship</span>
              </button>
            )}
          </div>
        </header>

        {/* ─── MAIN ─── */}
        <main className="arena-main">
          <div className="content-frame">
            {children}
          </div>
        </main>

        {/* ─── FOOTER ─── */}
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
            <span className="footer-divider">|</span>
            <span className="footer-text">🔑 Passkey Authentication</span>
          </div>
          <div className="footer-decoration footer-decoration-bottom">
            <svg className="rope-divider" viewBox="0 0 100 20" preserveAspectRatio="none">
              <path d="M0,10 Q25,15 50,10 T100,10" stroke="currentColor" fill="none" strokeWidth="2"/>
              <path d="M0,8 Q25,13 50,8 T100,8" stroke="currentColor" fill="none" strokeWidth="1.5" opacity="0.5"/>
            </svg>
          </div>
        </footer>
      </div>

      {/* Combat Flash Overlay */}
      <div className="combat-flash" id="combat-flash" />
    </div>
  );
}