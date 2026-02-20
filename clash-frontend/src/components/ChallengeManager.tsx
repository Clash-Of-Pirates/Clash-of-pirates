/**
 * ChallengeManager.tsx
 *
 * Full-featured challenge panel:
 *   • Send a challenge to another player by username
 *   • View incoming / outgoing / completed challenges
 *   • Accept incoming challenges
 *   • Challenges auto-expire via live countdown (no reject — contract uses expiry)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Challenge } from '@/games/clash/bindings';
import { ClashGameService } from '@/games/clash/clashService';
import { CLASH_CONTRACT } from '@/utils/constants';
import { useWallet } from '@/hooks/useWallet';
import { resolveUsername } from '@/services/passkeyService';
import './ChallengeManager.css';

const clashService = new ClashGameService(CLASH_CONTRACT);

const POINTS_DECIMALS = 7;
function formatPoints(raw: bigint | number | string): string {
  return (Number(raw) / 10_000_000).toFixed(2);
}
function parsePoints(value: string): bigint | null {
  try {
    const [whole = '0', fraction = ''] = value.replace(/[^\d.]/g, '').split('.');
    const padded = fraction.padEnd(POINTS_DECIMALS, '0').slice(0, POINTS_DECIMALS);
    return BigInt(whole + padded);
  } catch { return null; }
}

function secondsUntil(expires_at: bigint | number): number {
  return Number(expires_at) - Math.floor(Date.now() / 1000);
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return 'Expired';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Live countdown hook — ticks every second for precision.
 * Returns { label, expired, urgent (< 5 min), warning (< 1 hr) }
 */
function useLiveCountdown(expires_at: bigint | number) {
  const [secs, setSecs] = useState(() => secondsUntil(expires_at));

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => {
      const remaining = secondsUntil(expires_at);
      setSecs(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expires_at]);

  const expired = secs <= 0;
  const urgent  = !expired && secs < 5 * 60;      // < 5 minutes
  const warning = !expired && secs < 60 * 60;     // < 1 hour

  return { label: formatCountdown(secs), expired, urgent, warning };
}

// Legacy helper used in some places
function timeUntil(expires_at: bigint | number): string {
  return formatCountdown(secondsUntil(expires_at));
}

interface ChallengeManagerProps {
  userAddress: string;
  username:    string;
  onGameStart: (sessionId: number) => void;
}

type Tab = 'incoming' | 'outgoing' | 'send' | 'history';

export function ChallengeManager({ userAddress, username, onGameStart }: ChallengeManagerProps) {
  const { getContractSigner } = useWallet();

  const [tab,         setTab]         = useState<Tab>('incoming');
  const [challenges,  setChallenges]  = useState<{ active: Challenge[]; completed: Challenge[]; expired: Challenge[] }>({ active: [], completed: [], expired: [] });
  const [loading,     setLoading]     = useState(false);
  const [actionId,    setActionId]    = useState<number | null>(null); // challenge being acted on

  // Send form
  const [targetUsername, setTargetUsername] = useState('');
  const [pointsStr,      setPointsStr]      = useState('0.10');
  const [sendError,      setSendError]      = useState<string | null>(null);
  const [sendSuccess,    setSendSuccess]    = useState<string | null>(null);
  const [sending,        setSending]        = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [resolving,      setResolving]      = useState(false);

  const loadChallenges = useCallback(async () => {
    if (!userAddress) return;
    try {
      const result = await clashService.getPlayerChallenges(userAddress);
      setChallenges(result);
      const justAccepted = result.active.find(
        c => c.challenger.toString() === userAddress && 
             c.is_accepted && 
             c.session_id != null
      );
      if (justAccepted) {
        onGameStart(Number(justAccepted.session_id));
      }
    } catch (err) {
      console.error('[ChallengeManager] load error:', err);
    }
  }, [userAddress]);

  useEffect(() => {
    loadChallenges();
    const interval = setInterval(loadChallenges, 10_000);
    return () => clearInterval(interval);
  }, [loadChallenges]);

  // Resolve username on the fly
  useEffect(() => {
    const trimmed = targetUsername.trim().toLowerCase();
    if (!trimmed || trimmed === username) {
      setResolvedAddress(null);
      return;
    }
    setResolving(true);
    const tid = setTimeout(async () => {
      try {
        const addr = await resolveUsername(trimmed);
        setResolvedAddress(addr);
      } catch { setResolvedAddress(null); }
      finally { setResolving(false); }
    }, 500);
    return () => clearTimeout(tid);
  }, [targetUsername, username]);

  const handleSendChallenge = async () => {
    setSendError(null); setSendSuccess(null);
    if (!resolvedAddress) { setSendError('Username not found or not registered.'); return; }
    if (resolvedAddress === userAddress) { setSendError('Cannot challenge yourself.'); return; }
    const pts = parsePoints(pointsStr);
    if (!pts || pts <= 0n) { setSendError('Enter a valid points amount.'); return; }
    setSending(true);
    try {
      const signer = getContractSigner();
      const id = await clashService.sendChallenge(userAddress, resolvedAddress, pts, signer);
      setSendSuccess(`Challenge sent! ID: ${id}`);
      setTargetUsername(''); setResolvedAddress(null);
      await loadChallenges();
      setTab('outgoing');
    } catch (err: any) {
      setSendError(err?.message ?? 'Failed to send challenge.');
    } finally { setSending(false); }
  };

  const handleAccept = async (challengeId: number) => {
    setActionId(challengeId);
    try {
      const sessionId = Math.floor(Math.random() * 0xffffffff) || 1;
      const signer = getContractSigner();
      await clashService.acceptChallenge(challengeId, userAddress, sessionId, signer);
      await loadChallenges();
      onGameStart(sessionId);
    } catch (err: any) {
      console.error('[ChallengeManager] accept error:', err);
    } finally { setActionId(null); }
  };

  // Separate incoming vs outgoing from active
  const incoming = challenges.active.filter(c => c.challenged.toString() === userAddress);
  const outgoing = challenges.active.filter(c => c.challenger.toString() === userAddress);

  return (
    <div className="cm-container">
      {/* Header */}
      <div className="cm-header">
        <div className="cm-header-icon">⚔️</div>
        <div>
          <h3 className="cm-title">Challenge Hub</h3>
          <p className="cm-subtitle">Fight for glory on the high seas</p>
        </div>
        <button className="cm-refresh-btn" onClick={loadChallenges} title="Refresh">↻</button>
      </div>

      {/* Tabs */}
      <div className="cm-tabs">
        {([
          { key: 'incoming', label: '📨 Incoming', count: incoming.length },
          { key: 'outgoing', label: '📤 Sent',     count: outgoing.length },
          { key: 'send',     label: '⚔️ Send',     count: null },
          { key: 'history',  label: '📜 History',  count: challenges.completed.length },
        ] as const).map(t => (
          <button
            key={t.key}
            className={`cm-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="cm-badge">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="cm-body">

        {/* INCOMING */}
        {tab === 'incoming' && (
          <div className="cm-list">
            {incoming.length === 0 ? (
              <EmptyState icon="📭" text="No incoming challenges" sub="Tell a captain to bring it on!" />
            ) : incoming.map((c, i) => (
              <ChallengeCard
                key={i}
                challenge={c}
                type="incoming"
                userAddress={userAddress}
                onAccept={() => handleAccept(Number(
                  challenges.active.findIndex(x =>
                    x.challenger.toString() === c.challenger.toString() &&
                    x.challenged.toString() === c.challenged.toString()
                  )
                ))}
                isActing={actionId !== null}
              />
            ))}
          </div>
        )}

        {/* OUTGOING */}
        {tab === 'outgoing' && (
          <div className="cm-list">
            {outgoing.length === 0 ? (
              <EmptyState icon="🌊" text="No sent challenges" sub="Challenge a captain to battle!" />
            ) : outgoing.map((c, i) => (
              <ChallengeCard
                key={i}
                challenge={c}
                type="outgoing"
                userAddress={userAddress}
                isActing={false}
              />
            ))}
          </div>
        )}

        {/* SEND */}
        {tab === 'send' && (
          <div className="cm-send-panel">
            <div className="cm-send-icon">🏴‍☠️</div>
            <p className="cm-send-intro">Challenge any captain by their pirate name</p>

            <div className="cm-field">
              <label className="cm-label">⚓ Opponent's Username</label>
              <div className="cm-input-row">
                <input
                  className={`cm-input ${resolvedAddress ? 'valid' : targetUsername && !resolving ? 'invalid' : ''}`}
                  placeholder="captain_blackwater"
                  value={targetUsername}
                  onChange={e => { setTargetUsername(e.target.value); setSendError(null); setSendSuccess(null); }}
                  disabled={sending}
                />
                {resolving && <span className="cm-input-status spin">↻</span>}
                {!resolving && resolvedAddress && <span className="cm-input-status ok">✓</span>}
                {!resolving && targetUsername && !resolvedAddress && <span className="cm-input-status err">✗</span>}
              </div>
              {resolvedAddress && (
                <p className="cm-resolved">
                  {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-4)}
                </p>
              )}
              {!resolving && targetUsername && !resolvedAddress && (
                <p className="cm-resolve-error">Username not found</p>
              )}
            </div>

            <div className="cm-field">
              <label className="cm-label">💰 Points to Wager</label>
              <input
                className="cm-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.10"
                value={pointsStr}
                onChange={e => setPointsStr(e.target.value)}
                disabled={sending}
              />
              <p className="cm-field-hint">Winner takes the entire pot</p>
            </div>

            {sendError   && <div className="cm-alert error">{sendError}</div>}
            {sendSuccess && <div className="cm-alert success">{sendSuccess}</div>}

            <button
              className="cm-send-btn"
              onClick={handleSendChallenge}
              disabled={sending || !resolvedAddress || !pointsStr}
            >
              {sending ? '⏳ Sending…' : '⚔️ Send Challenge'}
            </button>
          </div>
        )}

        {/* HISTORY */}
        {tab === 'history' && (
          <div className="cm-list">
            {challenges.completed.length === 0 ? (
              <EmptyState icon="📜" text="No completed battles" sub="Fight your first duel!" />
            ) : challenges.completed.map((c, i) => (
              <ChallengeCard
                key={i}
                challenge={c}
                type="history"
                userAddress={userAddress}
                isActing={false}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Challenge Card
// ─────────────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge:   Challenge;
  type:        'incoming' | 'outgoing' | 'history';
  userAddress: string;
  onAccept?:   () => void;
  isActing:    boolean;
}

function ChallengeCard({ challenge: c, type, userAddress, onAccept, isActing }: ChallengeCardProps) {
  const challenger   = c.challenger.toString();
  const challenged   = c.challenged.toString();
  const isChallenger = challenger === userAddress;
  const opponent     = isChallenger ? challenged : challenger;
  const points       = formatPoints(c.points_wagered as bigint);

  // Live countdown — ticks every second
  const { label: timeLabel, expired, urgent, warning } = useLiveCountdown(c.expires_at as bigint);

  const timeBadgeClass = [
    'cm-time-badge',
    expired  ? 'expired'  : '',
    urgent   ? 'urgent'   : '',
    warning  ? 'warning'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`cm-card ${type} ${expired ? 'expired' : ''} ${urgent ? 'urgent' : ''}`}>
      <div className="cm-card-top">
        <div className="cm-card-opponent">
          <span className="cm-card-icon">🏴‍☠️</span>
          <div>
            <div className="cm-card-name">
              {opponent.slice(0, 6)}…{opponent.slice(-4)}
            </div>
            <div className="cm-card-role">
              {type === 'incoming' ? 'Challenger' : type === 'outgoing' ? 'Challenged' : 'Opponent'}
            </div>
          </div>
        </div>

        <div className="cm-card-wager">
          <div className="cm-wager-amount">⚓ {points}</div>
          <div className="cm-wager-label">points wagered</div>
        </div>
      </div>

      <div className="cm-card-bottom">
        {/* Live countdown — challenges expire automatically on-chain */}
        <div className={timeBadgeClass}>
          {expired ? (
            <span>⌛ Expired — challenge cancelled</span>
          ) : (
            <span>
              {urgent ? '🔴' : warning ? '🟡' : '⏰'} {timeLabel}
            </span>
          )}
        </div>

        {/* Progress bar showing time remaining visually */}
        {!expired && !c.is_completed && (
          <ExpiryBar expiresAt={c.expires_at as bigint} />
        )}

        {/* Actions */}
        {type === 'incoming' && !expired && !c.is_completed && (
          <div className="cm-incoming-actions">
            <button
              className="cm-accept-btn"
              onClick={onAccept}
              disabled={isActing}
            >
              {isActing ? '⏳ Joining…' : '⚔️ Accept Battle'}
            </button>
            {urgent && (
              <p className="cm-expire-warning">
                ⚠️ This challenge expires soon — accept now or it will be cancelled automatically!
              </p>
            )}
          </div>
        )}

        {type === 'incoming' && expired && (
          <div className="cm-expired-notice">
            Challenge expired — the challenger may resend if they wish.
          </div>
        )}

        {type === 'outgoing' && !c.is_accepted && !expired && (
          <div className="cm-pending-badge">⏳ Awaiting response</div>
        )}

        {type === 'outgoing' && expired && !c.is_completed && (
          <div className="cm-expired-notice">
            They didn't respond in time — challenge auto-cancelled.
          </div>
        )}

        {c.is_completed && (
          <div className="cm-completed-badge">✓ Battle resolved</div>
        )}

        {c.session_id && (
          <div className="cm-session-badge">
            Session #{c.session_id.toString()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Expiry Progress Bar
// ─────────────────────────────────────────────────────────────

/**
 * Visual bar that shrinks as the challenge approaches expiry.
 * Colour transitions: green → yellow → red.
 */
function ExpiryBar({ expiresAt }: { expiresAt: bigint }) {
  // Assume challenges have a 24h window (adjust to match contract config)
  const CHALLENGE_DURATION_SECS = 24 * 60 * 60;

  const [pct, setPct] = useState(() => {
    const remaining = secondsUntil(expiresAt);
    return Math.max(0, Math.min(100, (remaining / CHALLENGE_DURATION_SECS) * 100));
  });

  useEffect(() => {
    const update = () => {
      const remaining = secondsUntil(expiresAt);
      setPct(Math.max(0, Math.min(100, (remaining / CHALLENGE_DURATION_SECS) * 100)));
    };
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const color =
    pct > 50 ? '#22c55e'   // green
    : pct > 20 ? '#f59e0b' // amber
    : '#ef4444';           // red

  return (
    <div className="cm-expiry-bar-track">
      <div
        className="cm-expiry-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub: string }) {
  return (
    <div className="cm-empty">
      <div className="cm-empty-icon">{icon}</div>
      <p className="cm-empty-text">{text}</p>
      <p className="cm-empty-sub">{sub}</p>
    </div>
  );
}