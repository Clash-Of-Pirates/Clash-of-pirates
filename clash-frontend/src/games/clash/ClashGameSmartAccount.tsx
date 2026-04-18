import React, { useState, useEffect, useCallback } from 'react';
import { SmartAccountService } from './smartAccountService';
import { ClashGameService } from './clashService';
import { ClashZkDuelSmartAccount } from './ClashZkDuelSmartAccount';
import {
  Attack,
  Defense,
  MatchState,
  type Move,
  type PvPMatch,
} from './bindings';
import { getContractId, NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import './styles.css'; // Add CSS file

function isPlayer1Side(match: PvPMatch, user: string): boolean {
  return match.player1 === user;
}

/** Contract: even `current_turn` → player1 acts; odd → player2. */
function isMyTurn(match: PvPMatch, user: string): boolean {
  if (match.state !== MatchState.Active) return false;
  const player1Turn = match.current_turn % 2 === 0;
  if (player1Turn) return user === match.player1;
  return user === match.player2;
}

function unwrapWinner(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'Some' in v) {
    const inner = (v as { Some?: unknown }).Some;
    if (typeof inner === 'string') return inner;
  }
  if (typeof v === 'object' && v !== null && 'tag' in v && (v as { tag?: string }).tag === 'Some') {
    const vals = (v as { values?: unknown[] }).values;
    if (Array.isArray(vals) && typeof vals[0] === 'string') return vals[0];
  }
  return undefined;
}

const CLASH_CONTRACT_ID = getContractId('clash');
const ACCOUNT_WASM_HASH = import.meta.env.VITE_ACCOUNT_WASM_HASH ?? '';
const WEBAUTHN_VERIFIER = import.meta.env.VITE_WEBAUTHN_VERIFIER_ADDRESS ?? '';

const missingClashContract = !CLASH_CONTRACT_ID?.trim();
const missingSmartAccountEnv =
  !ACCOUNT_WASM_HASH?.trim() || !WEBAUTHN_VERIFIER?.trim();

export function ClashGameWithSmartAccount() {
  // Wallet state
  const [smartAccountService] = useState(
    () =>
      new SmartAccountService(
        RPC_URL,
        NETWORK_PASSPHRASE,
        ACCOUNT_WASM_HASH,
        WEBAUTHN_VERIFIER
      )
  );

  const [clashService] = useState(() => new ClashGameService(CLASH_CONTRACT_ID));

  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState<boolean | null>(null);

  // Game state — legacy turn-by-turn PvP (contract `Match_*`), separate from ZK session duel
  const [legacyPvpOpen, setLegacyPvpOpen] = useState(false);
  const [pvpMatches, setPvpMatches] = useState<number[]>([]);
  const [currentMatch, setCurrentMatch] = useState<PvPMatch | null>(null);
  const [opponentAddress, setOpponentAddress] = useState('');
  const [joinMatchId, setJoinMatchId] = useState('');
  const [liveSyncAt, setLiveSyncAt] = useState<number | null>(null);
  const [, setLiveTick] = useState(0);

  // Re-render periodically so "Xs ago" updates without manual reload
  useEffect(() => {
    if (liveSyncAt == null) return;
    const id = window.setInterval(() => setLiveTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveSyncAt]);

  // Initialize SmartAccount on mount
  useEffect(() => {
    const init = async () => {
      try {
        await smartAccountService.init();
        console.log('✅ SmartAccount initialized');

        // Try to restore session
        const restored = await smartAccountService.restoreSession();
        if (restored) {
          const contractId = smartAccountService.getContractId();
          if (contractId) {
            setUserAddress(contractId);
            setWalletConnected(true);
            console.log('✅ Session restored:', contractId);
          }
        }
        setSessionRestored(restored);
      } catch (err) {
        console.error('❌ Initialization error:', err);
        const message = err instanceof Error ? err.message : 'Failed to initialize SmartAccount';
        setError(message);
      }
    };

    init();
  }, [smartAccountService]);

  const refreshMyMatches = useCallback(async () => {
    if (!userAddress) return;
    try {
      const ids = await clashService.getPlayerMatches(userAddress);
      setPvpMatches(ids);
    } catch (e) {
      console.warn('Failed to load match list from chain:', e);
    }
  }, [userAddress, clashService]);

  useEffect(() => {
    if (!walletConnected || !userAddress || !legacyPvpOpen) return;
    void refreshMyMatches();
  }, [walletConnected, userAddress, legacyPvpOpen, refreshMyMatches]);

  /** Lobby list: refresh periodically so invites appear without reload */
  useEffect(() => {
    if (!walletConnected || !userAddress || !legacyPvpOpen || currentMatch) return;
    const id = window.setInterval(() => {
      void refreshMyMatches();
    }, 5000);
    return () => window.clearInterval(id);
  }, [walletConnected, userAddress, legacyPvpOpen, currentMatch, refreshMyMatches]);

  /** Active match: poll chain so opponent moves / accept show up live */
  const matchPollId = currentMatch?.match_id;
  useEffect(() => {
    if (matchPollId == null || !walletConnected) return;
    const run = async () => {
      try {
        const m = await clashService.getMatch(matchPollId);
        setCurrentMatch(m);
        setLiveSyncAt(Date.now());
      } catch {
        /* ignore transient RPC errors */
      }
    };
    void run();
    const id = window.setInterval(() => void run(), 4000);
    return () => window.clearInterval(id);
  }, [matchPollId, walletConnected, clashService]);

  // Handle wallet creation
  const handleCreateWallet = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔐 Creating fresh smart wallet...');
      const result = await smartAccountService.createFreshWallet(
        'Clash Pirates',
        `player_${Date.now()}`,
        true // auto-fund
      );

      setUserAddress(result.contractId);
      setWalletConnected(true);
      setError(null);

      // Refresh balance
      const bal = await smartAccountService.getBalance(result.contractId);
      setBalance(bal);

      console.log('✅ Wallet created:', result.contractId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Wallet creation failed:', err);
      setError(`Failed to create wallet: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle wallet connection / passkey sign in
  const handleSignInWithPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔑 Signing in with passkey...');
      const result = await smartAccountService.connectWallet(true);

      if (result) {
        setUserAddress(result.contractId);
        setWalletConnected(true);

        // Refresh balance
        const bal = await smartAccountService.getBalance(result.contractId);
        setBalance(bal);

        console.log('✅ Signed in:', result.contractId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Sign-in failed:', err);
      setError(`Failed to sign in: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    try {
      await smartAccountService.disconnect();
      setUserAddress(null);
      setWalletConnected(false);
      setCurrentMatch(null);
      setPvpMatches([]);
      console.log('✅ Disconnected');
    } catch (err) {
      console.error('❌ Disconnect error:', err);
    }
  };

  // Load match details
  const handleLoadMatch = async (matchId: number) => {
    setLoading(true);
    setError(null);

    try {
      console.log('📥 Loading match details...');
      const match = await clashService.getMatch(matchId);
      setCurrentMatch(match);
      setJoinMatchId('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Load match failed:', err);
      setError(`Failed to load match: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByMatchId = async () => {
    const id = parseInt(joinMatchId.trim(), 10);
    if (!userAddress || Number.isNaN(id) || id < 0) {
      setError('Enter a valid match ID number');
      return;
    }
    await handleLoadMatch(id);
  };

  // Create PVP invite
  const handleCreateInvite = async () => {
    if (!userAddress || !opponentAddress.trim()) {
      setError('Please enter opponent address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🎮 Creating PVP invite...');
      const matchId = await clashService.createInviteWithSmartAccount(
        userAddress,
        opponentAddress.trim(),
        smartAccountService
      );

      setOpponentAddress('');
      setError(null);
      await refreshMyMatches();
      await handleLoadMatch(matchId);

      console.log('✅ Invite created:', matchId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Invite creation failed:', err);
      setError(`Failed to create invite: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Accept invite
  const handleAcceptInvite = async () => {
    if (!currentMatch || !userAddress) return;

    setLoading(true);
    setError(null);

    try {
      console.log('✅ Accepting invite...');
      await clashService.acceptInviteWithSmartAccount(
        userAddress,
        currentMatch.match_id,
        smartAccountService
      );

      // Reload match
      await handleLoadMatch(currentMatch.match_id);
      await refreshMyMatches();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Accept failed:', err);
      setError(`Failed to accept: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reject invite
  const handleRejectInvite = async () => {
    if (!currentMatch || !userAddress) return;

    setLoading(true);
    setError(null);

    try {
      console.log('❌ Rejecting invite...');
      await clashService.rejectInviteWithSmartAccount(
        userAddress,
        currentMatch.match_id,
        smartAccountService
      );

      setCurrentMatch(null);
      setPvpMatches((prev) => prev.filter((id) => id !== currentMatch.match_id));
      await refreshMyMatches();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Reject failed:', err);
      setError(`Failed to reject: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Play turn
  const handlePlayTurn = async (attack: Attack, defense: Defense) => {
    if (!currentMatch || !userAddress) return;

    setLoading(true);
    setError(null);

    try {
      const move: Move = { attack, defense };
      console.log('🎮 Playing turn:', move);

      await clashService.playTurnWithSmartAccount(
        userAddress,
        currentMatch.match_id,
        move,
        smartAccountService
      );

      // Reload match
      await handleLoadMatch(currentMatch.match_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Play turn failed:', err);
      setError(`Failed to play turn: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // Render loading state
  if (loading && !walletConnected) {
    return (
      <div className="clash-container">
        <div className="loading">Initializing...</div>
      </div>
    );
  }

  const myHp =
    currentMatch && userAddress
      ? isPlayer1Side(currentMatch, userAddress)
        ? currentMatch.player1_hp
        : currentMatch.player2_hp
      : 0;
  const oppHp =
    currentMatch && userAddress
      ? isPlayer1Side(currentMatch, userAddress)
        ? currentMatch.player2_hp
        : currentMatch.player1_hp
      : 0;
  const canPlayTurn =
    Boolean(
      currentMatch &&
        userAddress &&
        currentMatch.state === MatchState.Active &&
        isMyTurn(currentMatch, userAddress)
    );
  const waitingOnOpponent =
    Boolean(
      currentMatch &&
        userAddress &&
        currentMatch.state === MatchState.Active &&
        !isMyTurn(currentMatch, userAddress)
    );
  const winnerAddr = unwrapWinner(currentMatch?.winner);

  return (
    <div className="clash-container">
      {missingClashContract && (
        <div className="error-banner" role="alert">
          Clash contract ID is not configured. Set <code>VITE_CLASH_CONTRACT_ID</code> or ensure{' '}
          repo-root <code>deployment.json</code> includes <code>clash</code>, then rebuild.
        </div>
      )}
      {missingSmartAccountEnv && (
        <div className="error-banner" role="alert">
          Smart account is not configured. Set <code>VITE_ACCOUNT_WASM_HASH</code> and{' '}
          <code>VITE_WEBAUTHN_VERIFIER_ADDRESS</code> for passkey deployments on this network.
        </div>
      )}
      {/* Header */}
      <div className="clash-header">
        <h1>⚔️ Clash Pirates</h1>
        {walletConnected ? (
          <div className="wallet-info">
            <div className="wallet-address">
              {userAddress?.slice(0, 10)}...{userAddress?.slice(-10)}
            </div>
            <div className="wallet-balance">💰 {balance} XLM</div>
            <button onClick={handleDisconnect} className="btn-disconnect">
              Disconnect
            </button>
          </div>
        ) : (
          <div className="wallet-connect">
            <p className="wallet-description">
              Create a fresh passkey wallet for this app, or sign in with a wallet that was created with the current smart-account flow.
            </p>
            <button
              onClick={handleSignInWithPasskey}
              disabled={loading || missingClashContract || missingSmartAccountEnv}
              className="btn-primary"
            >
              {loading ? '⏳ Signing in...' : '🔑 Sign in with Passkey'}
            </button>
            <button
              onClick={handleCreateWallet}
              disabled={loading || missingClashContract || missingSmartAccountEnv}
              className="btn-secondary"
            >
              {loading ? '⏳ Creating...' : '🔐 Create Fresh Wallet'}
            </button>
            {sessionRestored === false && (
              <div className="wallet-hint">
                No active passkey session was found. Use "Sign in with Passkey" if you already registered one.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <div className="error-banner">{error}</div>}

      {/* Canonical duel: same combat rules — plan all three rounds, commit with proof, reveal, resolve */}
      {walletConnected && (
        <div className="duel-intro card" style={{ marginBottom: '1.25rem' }}>
          <h2 className="gradient-text" style={{ marginTop: 0 }}>
            ⚔️ Clash of Pirates
          </h2>
          <p className="wallet-description" style={{ marginBottom: '1rem' }}>
            One duel flow: you and your opponent each plan three rounds (attack + defense per round),{' '}
            <strong>commit</strong> those plans on-chain with a zero-knowledge proof (opponent cannot see your moves),{' '}
            then <strong>reveal</strong> and <strong>resolve</strong> to determine the winner. This matches the{' '}
            <a
              href="https://github.com/Clash-Of-Pirates/Clash-of-pirates"
              target="_blank"
              rel="noopener noreferrer"
            >
              Clash of Pirates
            </a>{' '}
            design: commit_moves → reveal_moves → resolve_battle.
          </p>
          <ol
            style={{
              margin: 0,
              paddingLeft: '1.25rem',
              color: 'var(--color-ink-muted)',
              lineHeight: 1.6,
              fontSize: '0.9rem',
            }}
          >
            <li>Player 1 starts the session (stake) or Player 2 joins with the session ID.</li>
            <li>Each side selects three turns, generates a local proof, and submits commit_moves.</li>
            <li>After both commits, each side reveals moves that match their commitment.</li>
            <li>Anyone calls resolve_battle; the contract simulates rounds and reports the winner.</li>
          </ol>
        </div>
      )}

      {/* Main game: ZK commit / reveal / resolve (same RPS + combo rules as on-chain playback) */}
      {walletConnected && userAddress && (
        <div className="classic-section clash-zk-shell">
          <ClashZkDuelSmartAccount
            userAddress={userAddress}
            clashService={clashService}
            smartAccountService={smartAccountService}
          />
        </div>
      )}

      {/* Legacy: alternate on-chain API (turn-by-turn matches) — not the primary commit-reveal duel */}
      {walletConnected && (
        <details
          className="pvp-section legacy-pvp-details"
          style={{ marginTop: '1.5rem' }}
          onToggle={(e) => setLegacyPvpOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              listStyle: 'none',
            }}
          >
            Advanced — legacy turn-by-turn PvP (no commit-reveal)
          </summary>
          <p className="wallet-description" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            The contract also exposes invite/accept and one move at a time. Use only if you need that older flow; it
            does not share state with session-based duels above.
          </p>
          <div className="pvp-section-inner">
          {liveSyncAt != null && currentMatch && (
            <div className="live-sync-bar" aria-live="polite">
              Live · updated{' '}
              {Math.max(0, Math.round((Date.now() - liveSyncAt) / 1000))}s ago
            </div>
          )}
          {/* Invite form */}
          {!currentMatch && (
            <div className="invite-form">
              <h2>Create or Join a Battle</h2>
              <p className="wallet-description" style={{ marginBottom: '1rem' }}>
                Invites use your smart-account contract address (C…) on-chain. Share your address with your opponent,
                or send them the numeric match ID after you create an invite.
              </p>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Opponent address (C… smart account or G…)"
                  value={opponentAddress}
                  onChange={(e) => setOpponentAddress(e.target.value)}
                  className="input"
                />
                <button
                  onClick={handleCreateInvite}
                  disabled={loading || !opponentAddress.trim()}
                  className="btn-primary"
                >
                  {loading ? '⏳ Sending...' : '📤 Send Invite'}
                </button>
              </div>

              <div className="input-group" style={{ marginTop: '1rem' }}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Join by match ID"
                  value={joinMatchId}
                  onChange={(e) => setJoinMatchId(e.target.value)}
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => void handleJoinByMatchId()}
                  disabled={loading || !joinMatchId.trim()}
                  className="btn-secondary"
                >
                  Open match
                </button>
                <button
                  type="button"
                  onClick={() => void refreshMyMatches()}
                  disabled={loading}
                  className="btn-secondary"
                >
                  Refresh list
                </button>
              </div>

              {/* Matches list */}
              {pvpMatches.length > 0 && (
                <div className="matches-list">
                  <h3>Your matches (on-chain)</h3>
                  <div className="matches-grid">
                    {pvpMatches.map((matchId) => (
                      <button
                        key={matchId}
                        onClick={() => void handleLoadMatch(matchId)}
                        className="match-btn"
                      >
                        Match #{matchId}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active match */}
          {currentMatch && (
            <div className="match-view battle-arena">
              <div className="match-header">
                <div>
                  <h2>Battle #{currentMatch.match_id}</h2>
                  <div className="match-status">
                    Status:{' '}
                    {['Created', 'Accepted', 'Active', 'Finished'][
                      currentMatch.state
                    ] || 'Unknown'}
                  </div>
                  <div className="wallet-description" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    P1: {currentMatch.player1.slice(0, 8)}… · P2: {currentMatch.player2.slice(0, 8)}…
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentMatch(null)}
                  className="btn-secondary"
                >
                  ← Lobby
                </button>
              </div>

              {/* Player stats */}
              <div className="player-stats">
                <div className="player">
                  <div className="player-label">You</div>
                  <div className="hp-bar">
                    <div
                      className="hp-fill"
                      style={{
                        width: `${Math.max(0, (myHp / 100) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="hp-text">{myHp}/100 HP</div>
                </div>

                <div className="vs">VS</div>

                <div className="player">
                  <div className="player-label">Opponent</div>
                  <div className="hp-bar">
                    <div
                      className="hp-fill"
                      style={{
                        width: `${Math.max(0, (oppHp / 100) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="hp-text">{oppHp}/100 HP</div>
                </div>
              </div>

              {currentMatch.state === MatchState.Created &&
                userAddress === currentMatch.player1 && (
                  <p className="wallet-description" style={{ textAlign: 'center', margin: '1rem 0' }}>
                    Invite sent — waiting for player 2 to accept.
                  </p>
                )}

              {/* Match actions */}
              {currentMatch.state === MatchState.Created &&
                userAddress === currentMatch.player2 && (
                <div className="action-buttons">
                  <button
                    onClick={handleAcceptInvite}
                    disabled={loading}
                    className="btn-primary"
                  >
                    ✅ Accept Battle
                  </button>
                  <button
                    onClick={handleRejectInvite}
                    disabled={loading}
                    className="btn-secondary"
                  >
                    ❌ Reject
                  </button>
                </div>
              )}

              {waitingOnOpponent && (
                <p className="wallet-description" style={{ textAlign: 'center', margin: '1rem 0' }}>
                  Waiting for your opponent&apos;s move…
                </p>
              )}

              {canPlayTurn && (
                <div className="turn-controls">
                  <h3>Your move</h3>
                  <div className="moves-grid">
                    {[
                      { attack: Attack.Slash, defense: Defense.Block, name: '⚔️ Slash + Block' },
                      {
                        attack: Attack.Fireball,
                        defense: Defense.Dodge,
                        name: '🔥 Fireball + Dodge',
                      },
                      {
                        attack: Attack.Lightning,
                        defense: Defense.Counter,
                        name: '⚡ Lightning + Counter',
                      },
                    ].map((combo) => (
                      <button
                        key={combo.name}
                        onClick={() => handlePlayTurn(combo.attack, combo.defense)}
                        disabled={loading}
                        className="move-btn"
                      >
                        {combo.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentMatch.state === MatchState.Finished && (
                <div className="match-result">
                  <h3>⚔️ Battle Complete!</h3>
                  {winnerAddr ? (
                    <div className="result">
                      {winnerAddr === userAddress ? (
                        <div className="win">🎉 You Won!</div>
                      ) : (
                        <div className="lose">😢 You Lost</div>
                      )}
                    </div>
                  ) : (
                    <div className="draw">🤝 Draw</div>
                  )}
                  <button
                    onClick={() => setCurrentMatch(null)}
                    className="btn-secondary"
                  >
                    Back to Lobby
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </details>
      )}
    </div>
  );
}
