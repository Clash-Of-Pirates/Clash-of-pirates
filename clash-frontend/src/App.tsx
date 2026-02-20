/**
 * App.tsx  —  Updated entry point
 *
 * Auth flow:
 *   1. On mount, check localStorage for saved AuthUser
 *   2. If no user → show PasskeyAuthModal (blocking)
 *   3. If user → show game + optional ChallengeManager panel
 */

import { useState } from 'react';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { PasskeyAuthModal } from '@/components/Passkeyauthmodal';
import { ChallengeManager } from './components/ChallengeManager';
import { ClashGame } from './games/clash/ClashGame';
import type { AuthUser } from '@/services/passkeyService';
import { config } from './config';

const GAME_ID    = 'clash';
const GAME_TITLE = import.meta.env.VITE_GAME_TITLE  || 'Clash of Pirates';
const GAME_TAG   = import.meta.env.VITE_GAME_TAGLINE || 'Zero-Knowledge Combat on the High Seas';

export default function App() {
  const { user, isLoggedIn, isLoading, userAddress, login, logout } = useAuth();
  const [showAuth,       setShowAuth]       = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const contractId = config.contractIds[GAME_ID] || '';
  const hasContract = contractId && contractId !== 'YOUR_CONTRACT_ID';

  const handleAuthSuccess = (authUser: AuthUser) => {
    login(authUser);
    setShowAuth(false);
  };

  const handleGameStart = (sessionId: number) => {
    setActiveSessionId(sessionId);
    setShowChallenges(false);
  };

  // Still hydrating from localStorage
  if (isLoading) {
    return (
      <Layout title={GAME_TITLE} subtitle={GAME_TAG}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '4rem 0' }}>
          <div style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>⚓</div>
          <p style={{ color: 'var(--color-ink-muted, #9ca3af)', fontFamily: 'Cinzel, serif' }}>Preparing the ship…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title={GAME_TITLE}
      subtitle={GAME_TAG}
      user={user}
      onShowAuth={() => setShowAuth(true)}
      onShowChallenges={() => setShowChallenges(s => !s)}
      onLogout={logout}
    >
      {/* Auth modal — blocks if not logged in */}
      {(!isLoggedIn || showAuth) && (
        <PasskeyAuthModal
          required={!isLoggedIn}
          onSuccess={handleAuthSuccess}
          onClose={isLoggedIn ? () => setShowAuth(false) : undefined}
        />
      )}

      {/* Contract not configured */}
      {!hasContract && isLoggedIn && (
        <div className="card">
          <h3 className="gradient-text">Contract Not Configured</h3>
          <p style={{ color: 'var(--color-ink-muted)', marginTop: '1rem' }}>
            Run <code>bun run setup</code> to deploy contracts, or set
            <code> VITE_CLASH_CONTRACT_ID</code> in <code>.env</code>.
          </p>
        </div>
      )}

      {/* Challenge Manager overlay */}
      {isLoggedIn && hasContract && showChallenges && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ChallengeManager
            userAddress={userAddress}
            username={user!.username}
            onGameStart={handleGameStart}
          />
        </div>
      )}

      {/* Main game */}
      {isLoggedIn && hasContract && (
        <ClashGame
          userAddress={userAddress}
          currentEpoch={1}
          availablePoints={1_000_000_000n}
          initialSessionId={activeSessionId}
          onStandingsRefresh={() => {}}
          onGameComplete={() => setActiveSessionId(null)}
        />
      )}
    </Layout>
  );
}