import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Lock, Power, ShieldCheck, Wallet } from 'lucide-react';
import { rpc } from '@stellar/stellar-sdk';
import { SmartAccountService } from './smartAccountService';
import { ClashGameService } from './clashService';
import { ClashZkArena } from './ClashZkArena';
import { CopyChip } from './components/CopyChip';
import { getContractId, NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import './styles.css';

const CLASH_CONTRACT_ID = getContractId('clash');
const ACCOUNT_WASM_HASH = import.meta.env.VITE_ACCOUNT_WASM_HASH ?? '';
const WEBAUTHN_VERIFIER = import.meta.env.VITE_WEBAUTHN_VERIFIER_ADDRESS ?? '';
const missingClashContract = !CLASH_CONTRACT_ID?.trim();
const missingSmartAccountEnv = !ACCOUNT_WASM_HASH?.trim() || !WEBAUTHN_VERIFIER?.trim();

/** Must match `DELEGATE_SESSION_STORAGE_KEY` in smartAccountService.ts (read-only duplicate for UI checks). */
const DELEGATE_SESSION_STORAGE_KEY = 'clash-smart-account-delegate-session-v1';

type ParsedDelegate = {
  smartAccountContractId: string;
  validUntilLedger: number;
  clashContractId: string;
};

function parseDelegateSessionFromStorage(): ParsedDelegate | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DELEGATE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number } & Partial<ParsedDelegate>;
    if (parsed.v !== 1 || typeof parsed.validUntilLedger !== 'number' || typeof parsed.smartAccountContractId !== 'string') {
      return null;
    }
    return {
      smartAccountContractId: parsed.smartAccountContractId,
      validUntilLedger: parsed.validUntilLedger,
      clashContractId: typeof parsed.clashContractId === 'string' ? parsed.clashContractId : '',
    };
  } catch {
    return null;
  }
}

async function isLedgerBeforeOrAt(validUntilLedger: number): Promise<boolean> {
  const server = new rpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith('http://'),
  });
  const { sequence } = await server.getLatestLedger();
  return sequence <= validUntilLedger;
}

function formatBalanceNum(raw: string | undefined | null): string {
  if (raw === undefined || raw === null || raw === '') return '';
  const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
  if (Number.isNaN(n)) return '';
  return n.toFixed(3);
}

export function ClashGameArena() {
  const [smartAccountService] = useState(
    () => new SmartAccountService(RPC_URL, NETWORK_PASSPHRASE, ACCOUNT_WASM_HASH, WEBAUTHN_VERIFIER)
  );
  const [clashService] = useState(() => new ClashGameService(CLASH_CONTRACT_ID));
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [displayBalance, setDisplayBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState<boolean | null>(null);
  const [fastSigning, setFastSigning] = useState(false);
  const [fastSigningBusy, setFastSigningBusy] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [sessionExpiresLedger, setSessionExpiresLedger] = useState<number | null>(null);
  const [hasActiveSessionKey, setHasActiveSessionKey] = useState(false);
  const balancePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceAnimFromRef = useRef(0);

  const refreshFastSigningState = useCallback(() => {
    setFastSigning(smartAccountService.hasClashSigningSession());
  }, [smartAccountService]);

  const evaluateSessionKeyUi = useCallback(
    async (address: string | null) => {
      if (!address) {
        setHasActiveSessionKey(false);
        setSessionExpiresLedger(null);
        return;
      }
      const mem = smartAccountService.getClashSigningSession();
      if (mem && mem.clashContractId === CLASH_CONTRACT_ID) {
        try {
          const ok = await isLedgerBeforeOrAt(mem.validUntilLedger);
          setSessionExpiresLedger(mem.validUntilLedger);
          setHasActiveSessionKey(ok);
          if (ok) return;
        } catch {
          setSessionExpiresLedger(mem.validUntilLedger);
          setHasActiveSessionKey(false);
        }
      }
      const stored = parseDelegateSessionFromStorage();
      if (
        stored &&
        stored.smartAccountContractId === address &&
        stored.clashContractId === CLASH_CONTRACT_ID
      ) {
        try {
          const ok = await isLedgerBeforeOrAt(stored.validUntilLedger);
          setSessionExpiresLedger(stored.validUntilLedger);
          setHasActiveSessionKey(ok);
          return;
        } catch {
          setSessionExpiresLedger(stored.validUntilLedger);
          setHasActiveSessionKey(false);
          return;
        }
      }
      setHasActiveSessionKey(false);
      setSessionExpiresLedger(null);
    },
    [smartAccountService]
  );

  const fetchBalanceWithRetry = useCallback(
    async (address: string, maxAttempts = 3) => {
      for (let i = 0; i < maxAttempts; i += 1) {
        try {
          const raw = await smartAccountService.getBalance(address);
          const formatted = formatBalanceNum(raw);
          if (formatted !== '') {
            const n = parseFloat(formatted);
            if (!Number.isNaN(n) && n > 0) {
              setBalance(formatted);
              setBalanceLoading(false);
              return;
            }
          }
        } catch {
          /* retry */
        }
        if (i < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, i === 0 ? 2000 : 5000));
        }
      }
      try {
        const raw = await smartAccountService.getBalance(address);
        const formatted = formatBalanceNum(raw);
        if (formatted !== '') {
          setBalance(formatted);
        } else {
          setBalance('0');
        }
      } catch {
        setBalance('0');
      } finally {
        setBalanceLoading(false);
      }
    },
    [smartAccountService]
  );

  useEffect(() => {
    const init = async () => {
      try {
        await smartAccountService.init();
        const restored = await smartAccountService.restoreSession();
        if (restored) {
          const contractId = smartAccountService.getContractId();
          if (contractId) {
            setUserAddress(contractId);
            setWalletConnected(true);
            setBalanceLoading(true);
            void fetchBalanceWithRetry(contractId);
            void evaluateSessionKeyUi(contractId);
          }
        }
        setSessionRestored(restored);
        refreshFastSigningState();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize SmartAccount';
        setError(message);
      }
    };
    void init();
  }, [smartAccountService, refreshFastSigningState, fetchBalanceWithRetry, evaluateSessionKeyUi]);

  useEffect(() => {
    if (balanceLoading || balance === null) return;
    const target = parseFloat(balance);
    if (Number.isNaN(target)) return;
    const from = balanceAnimFromRef.current;
    let frame: number;
    const duration = 320;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 2;
      const v = from + (target - from) * eased;
      setDisplayBalance(v);
      if (t >= 1) balanceAnimFromRef.current = target;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [balance, balanceLoading]);

  useEffect(() => {
    if (!userAddress || !walletConnected) {
      if (balancePollRef.current) {
        clearInterval(balancePollRef.current);
        balancePollRef.current = null;
      }
      return;
    }
    balancePollRef.current = setInterval(() => {
      void fetchBalanceWithRetry(userAddress, 1);
    }, 30000);
    return () => {
      if (balancePollRef.current) clearInterval(balancePollRef.current);
    };
  }, [userAddress, walletConnected, fetchBalanceWithRetry]);

  useEffect(() => {
    if (!userAddress || !walletConnected) return;
    const id = window.setInterval(() => {
      void evaluateSessionKeyUi(userAddress);
    }, 20000);
    return () => clearInterval(id);
  }, [userAddress, walletConnected, evaluateSessionKeyUi]);

  const handleCreateWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await smartAccountService.createFreshWallet('Clash', `player_${Date.now()}`, true);
      setUserAddress(result.contractId);
      setWalletConnected(true);
      setBalanceLoading(true);
      void fetchBalanceWithRetry(result.contractId);
      void evaluateSessionKeyUi(result.contractId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to create wallet: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignInWithPasskey = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await smartAccountService.connectWallet(true);
      if (result) {
        setUserAddress(result.contractId);
        setWalletConnected(true);
        setBalanceLoading(true);
        void fetchBalanceWithRetry(result.contractId);
        void evaluateSessionKeyUi(result.contractId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to sign in: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    await smartAccountService.disconnect();
    setFastSigning(false);
    setUserAddress(null);
    setWalletConnected(false);
    setBalance(null);
    setBalanceLoading(true);
    balanceAnimFromRef.current = 0;
    setDisplayBalance(0);
    setHasActiveSessionKey(false);
    setSessionExpiresLedger(null);
  };

  const handleStartFastSigning = async () => {
    setFastSigningBusy(true);
    setError(null);
    try {
      await smartAccountService.startClashSigningSession(CLASH_CONTRACT_ID);
      refreshFastSigningState();
      await evaluateSessionKeyUi(userAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Fast signing setup failed: ${message}`);
    } finally {
      setFastSigningBusy(false);
    }
  };

  const handleClearFastSigning = () => {
    smartAccountService.clearClashSigningSession();
    refreshFastSigningState();
    void evaluateSessionKeyUi(userAddress);
  };

  const handleFundWallet = async () => {
    if (!userAddress) return;
    setLoading(true);
    try {
      await smartAccountService.fundWallet(userAddress);
      setBalanceLoading(true);
      void fetchBalanceWithRetry(userAddress, 3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Funding failed');
    } finally {
      setLoading(false);
    }
  };

  const balanceNum = balance !== null ? parseFloat(balance) : NaN;
  const showLowBalance = !balanceLoading && !Number.isNaN(balanceNum) && balanceNum < 2 && balanceNum > 0;
  const showZeroBalance = !balanceLoading && !Number.isNaN(balanceNum) && balanceNum <= 0;

  return (
    <div className="arena-game-shell">
      {(missingClashContract || missingSmartAccountEnv) && (
        <div className="critical-banner">
          Missing app configuration: set contract id + smart-account env vars.
        </div>
      )}

      <div className="arena-topbar">
        <div>
          <h2>CLASH</h2>
          <p>PISTOLS AT DAWN · ZK ARENA</p>
        </div>
        <div className={`wallet-pill ${walletConnected ? 'connected' : ''}`}>
          <span className={`wallet-pill-dot ${walletConnected ? 'on' : ''}`}>●</span>
          {walletConnected && userAddress ? (
            <div className="wallet-pill-identity">
              <span className="wallet-pill-you">⚡ YOU</span>
              <CopyChip label="" value={userAddress} display={`${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`} />
            </div>
          ) : (
            <>
              <Wallet size={14} />
              Wallet Locked
            </>
          )}
          {walletConnected && (
            <div className="wallet-pill-balance" title={showLowBalance ? 'Low balance — fund your wallet to continue playing' : undefined}>
              {balanceLoading ? (
                <span className="wallet-balance-loading">-- XLM</span>
              ) : showZeroBalance ? (
                <button type="button" className="wallet-balance-fund" onClick={() => void handleFundWallet()}>
                  0 XLM — Fund Wallet
                </button>
              ) : (
                <span
                  className={`wallet-balance-value ${showLowBalance ? 'wallet-balance-low' : ''}`}
                  title={showLowBalance ? 'Low balance — fund your wallet to continue playing' : undefined}
                >
                  {displayBalance.toFixed(3)} XLM
                  {showLowBalance && <AlertTriangle size={12} className="wallet-balance-warn-icon" aria-hidden />}
                </span>
              )}
            </div>
          )}
          {walletConnected && (
            <button className="wallet-pill-disconnect" onClick={() => void handleDisconnect()} aria-label="Disconnect wallet">
              <Power size={12} />
            </button>
          )}
        </div>
      </div>

      {!walletConnected && (
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="entry-gate">
          <div className="entry-wordmark">CLASH</div>
          <p>Connect wallet to enter the arena</p>
          <button className="btn-arena-primary gate-btn" onClick={() => void handleCreateWallet()} disabled={loading || missingClashContract || missingSmartAccountEnv}>
            ⚡ CREATE PASSKEY WALLET
          </button>
          <button className="btn-arena-secondary gate-btn" onClick={() => void handleSignInWithPasskey()} disabled={loading || missingClashContract || missingSmartAccountEnv}>
            ↩ CONNECT EXISTING
          </button>
          {sessionRestored === false && <small>Restore previous session unavailable in this browser session.</small>}
          <div className="lock-overlay">
            <Lock size={18} /> Locked until wallet is validated
          </div>
        </motion.section>
      )}

      <AnimatePresence>
        {walletConnected && userAddress && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="arena-layout">
            <aside className="left-rail">
              <div className="rail-card">
                <span>Phase</span>
                <strong>Duel Flow</strong>
              </div>
              <div className="rail-card rail-card-session">
                <span>Session</span>
                <span className="rail-you-label">YOU</span>
                <strong className="mono">{activeSessionId || 'Pending'}</strong>
              </div>
              {activeSessionId && <CopyChip label="SESSION" value={activeSessionId} />}
              <div className="rail-card">
                <span>Balance</span>
                <strong className={`mono rail-balance ${balanceLoading ? 'rail-balance-loading' : ''}`}>
                  {balanceLoading ? '-- XLM' : `${formatBalanceNum(balance)} XLM`}
                </strong>
              </div>
              <div className={`rail-card rail-fast-sign ${hasActiveSessionKey ? 'rail-fast-sign-active' : ''}`}>
                <div className="rail-fast-header">
                  <span>⚡ FAST SIGN</span>
                  {hasActiveSessionKey ? (
                    <span className="rail-fast-status rail-fast-status-on">
                      ACTIVE <span className="rail-fast-dot">●</span>
                    </span>
                  ) : (
                    <span className="rail-fast-status rail-fast-status-off">
                      INACTIVE <span className="rail-fast-dot rail-fast-dot-off">○</span>
                    </span>
                  )}
                </div>
                <p className="rail-fast-sub">Scoped to Clash contract</p>
                {hasActiveSessionKey && sessionExpiresLedger !== null && (
                  <p className="rail-fast-expiry mono">Expires: ledger #{sessionExpiresLedger.toLocaleString()}</p>
                )}
                {hasActiveSessionKey ? (
                  <button type="button" className="rail-btn-clear-session" onClick={handleClearFastSigning}>
                    ✕ Clear Session
                  </button>
                ) : (
                  <>
                    <p className="rail-fast-hint">Skip passkey prompts per tx</p>
                    <button
                      type="button"
                      className="rail-btn-create-session"
                      disabled={fastSigningBusy}
                      onClick={() => void handleStartFastSigning()}
                    >
                      + CREATE SESSION KEY
                    </button>
                  </>
                )}
              </div>
            </aside>

            <section className="center-stage">
              {error && (
                <div className="status-pill error">
                  <ShieldCheck size={14} /> {error}
                </div>
              )}
              <ClashZkArena
                userAddress={userAddress}
                clashService={clashService}
                smartAccountService={smartAccountService}
                fastSigning={fastSigning}
                hasActiveSessionKey={hasActiveSessionKey}
                sessionExpiresLedger={sessionExpiresLedger}
                onCreateSessionKey={() => void handleStartFastSigning()}
                onClearSessionKey={handleClearFastSigning}
                fastSigningBusy={fastSigningBusy}
                onSessionKeyActivated={() => {
                  refreshFastSigningState();
                  void evaluateSessionKeyUi(userAddress);
                }}
                onSessionIdChange={(sid) => setActiveSessionId(String(sid))}
              />
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
