/**
 * ZK duel flow (commit → reveal → resolve) for smart-account (passkey) wallets.
 * Reuses the same Noir circuit + contract entrypoints as ClashGame.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { NoirService, type ClashProofResult } from '@/utils/NoirService';
import type { ClashGameService } from './clashService';
import type { SmartAccountService } from './smartAccountService';
import type { Game, GamePlayback, Move } from './bindings';
import { Attack, Defense } from './bindings';
import {
  PhaseHeader,
  AlertBanner,
  PlayerStatusCard,
  MoveSelector,
  StrategyPreview,
  createEmptyMoves,
  type SelectedMove,
} from '@/components/Clashgamecomponents';
import '@/components/Clashgameenhanced.css';
import { recordSessionLoadActivity } from '@/utils/onChainTxFeed';

type ZkPhase = 'create' | 'commit' | 'waiting_reveal' | 'reveal' | 'resolve' | 'complete';

const POINTS_DECIMALS = 7;
const DEFAULT_POINTS = '0.1';

function parsePoints(value: string): bigint | null {
  try {
    const cleaned = value.replace(/[^\d.]/g, '');
    if (!cleaned || cleaned === '.') return null;
    const [whole = '0', fraction = ''] = cleaned.split('.');
    const paddedFraction = fraction.padEnd(POINTS_DECIMALS, '0').slice(0, POINTS_DECIMALS);
    return BigInt(whole + paddedFraction);
  } catch {
    return null;
  }
}

function createRandomSessionId(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    let value = 0;
    const buffer = new Uint32Array(1);
    while (value === 0) {
      crypto.getRandomValues(buffer);
      value = buffer[0];
    }
    return value;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

function toBuffer(arr: Uint8Array): Buffer {
  return Buffer.from(arr);
}

function toContractMoves(moves: SelectedMove[]): Move[] {
  return moves.map((m) => ({
    attack: m.attack as Attack,
    defense: m.defense as Defense,
  }));
}

function storageKeyPublicInputs(sid: number, addr: string) {
  return `clash_zk_public_${sid}_${addr}`;
}

function storageKeyMoves(sid: number, addr: string) {
  return `clash_zk_moves_${sid}_${addr}`;
}

/** Same packing as testnet-option.sh: moves_raw = [atk0,atk1,atk2, def0,def1,def2] */
function formatMovesRawLine(moves: SelectedMove[]): string {
  const a = moves.map((m) => m.attack ?? -1);
  const d = moves.map((m) => m.defense ?? -1);
  if (a.some((x) => x < 0) || d.some((x) => x < 0)) return '— (incomplete)';
  const raw = [...a, ...d];
  return `[${raw.join(', ')}]  hex: ${raw.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Maps UI state to the same sequence as testnet-option.sh (steps 15–21).
 */
function describeScriptStep(args: {
  hasGame: boolean;
  phase: ZkPhase;
  myCommitted: boolean;
  p1c: boolean;
  p2c: boolean;
  p1r: boolean;
  p2r: boolean;
  hasBattle: boolean;
  hasLocalProof: boolean;
}): { ref: string; hint: string } {
  const { hasGame, phase, myCommitted, p1c, p2c, p1r, p2r, hasBattle, hasLocalProof } = args;
  if (!hasGame) return { ref: 'Step 15: start_game', hint: 'Create or load a session (locks stake via GameHub).' };
  if (phase === 'commit' && !myCommitted && !hasLocalProof)
    return { ref: 'Prover.toml', hint: 'Pick 3×(attack, defense) — same as attacks/defenses arrays in the script.' };
  if (phase === 'commit' && !myCommitted && hasLocalProof)
    return { ref: 'Steps 3–5 + 16: prove + commit_moves', hint: 'Proof split matches the script: public_inputs (96 B) + proof_bytes.' };
  if (phase === 'waiting_reveal' && myCommitted && !(p1c && p2c))
    return { ref: 'Steps 16–17', hint: 'Waiting for the other player’s commit_moves.' };
  if (phase === 'reveal' || (phase === 'waiting_reveal' && !myCommitted))
    return { ref: 'Steps 18–19: reveal_moves', hint: 'Submit same public_inputs + plaintext moves as JSON (attest hash).' };
  if (phase === 'resolve')
    return { ref: 'Step 20: resolve_battle', hint: 'Anyone can invoke once both reveals are on-chain.' };
  if (phase === 'complete' || hasBattle) return { ref: 'Step 21: get_game_playback', hint: 'Resolved — fetch turn-by-turn playback.' };
  return { ref: '—', hint: '' };
}

type Props = {
  userAddress: string;
  clashService: ClashGameService;
  smartAccountService: SmartAccountService;
};

export function ClashZkDuelSmartAccount({ userAddress, clashService, smartAccountService }: Props) {
  const noir = useRef(new NoirService());

  const [phase, setPhase] = useState<ZkPhase>('create');
  const [sessionId, setSessionId] = useState(() => createRandomSessionId());
  const [gameState, setGameState] = useState<Game | null>(null);
  const [gamePlayback, setGamePlayback] = useState<GamePlayback | null>(null);

  const [opponentAddress, setOpponentAddress] = useState('');
  const [pointsStr, setPointsStr] = useState(DEFAULT_POINTS);
  const [loadSessionId, setLoadSessionId] = useState('');

  const [selectedMoves, setSelectedMoves] = useState<SelectedMove[]>(() => createEmptyMoves());
  const [storedPublicInputs, setStoredPublicInputs] = useState<Uint8Array | null>(null);
  /** Local UltraHonk output — mirrors script steps 3–5 before `commit_moves` (step 16). */
  const [proofBundle, setProofBundle] = useState<ClashProofResult | null>(null);
  const [proofMovesKey, setProofMovesKey] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [, setUiTick] = useState(0);

  useEffect(() => {
    if (lastSyncedAt == null) return;
    const id = window.setInterval(() => setUiTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [lastSyncedAt]);

  const loadPublicInputs = (sid: number, addr: string): Uint8Array | null => {
    try {
      const b64 = localStorage.getItem(storageKeyPublicInputs(sid, addr));
      if (!b64) return null;
      const binary = atob(b64);
      return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
    } catch {
      return null;
    }
  };

  const savePublicInputs = (sid: number, addr: string, inputs: Uint8Array) => {
    try {
      const b64 = btoa(String.fromCharCode(...inputs));
      localStorage.setItem(storageKeyPublicInputs(sid, addr), b64);
    } catch (e) {
      console.warn('savePublicInputs', e);
    }
  };

  const clearPublicInputs = (sid: number, addr: string) => {
    try {
      localStorage.removeItem(storageKeyPublicInputs(sid, addr));
    } catch {
      /* ignore */
    }
  };

  const loadMovesFromStorage = (sid: number, addr: string): SelectedMove[] => {
    try {
      const raw = localStorage.getItem(storageKeyMoves(sid, addr));
      if (!raw) return createEmptyMoves();
      return JSON.parse(raw) as SelectedMove[];
    } catch {
      return createEmptyMoves();
    }
  };

  const saveMovesToStorage = (sid: number, addr: string, moves: SelectedMove[]) => {
    try {
      localStorage.setItem(storageKeyMoves(sid, addr), JSON.stringify(moves));
    } catch {
      /* ignore */
    }
  };

  const loadGameState = useCallback(async () => {
    try {
      const game = await clashService.getGame(sessionId);
      if (!game) return;
      setGameState(game);
      setLastSyncedAt(Date.now());

      const p1c = game.has_player1_commitment;
      const p2c = game.has_player2_commitment;
      const p1r = game.player1_commitment?.has_revealed ?? false;
      const p2r = game.player2_commitment?.has_revealed ?? false;
      const hasBattle = game.has_battle_result;

      const isP1 = game.player1 === userAddress;
      const isP2 = game.player2 === userAddress;
      const myCommitted = isP1 ? p1c : isP2 ? p2c : false;

      if (hasBattle) {
        setPhase('complete');
        const pb = await clashService.getGamePlayback(sessionId);
        if (pb) setGamePlayback(pb);
      } else if (p1r && p2r) {
        setPhase('resolve');
      } else if (p1c && p2c) {
        setPhase('reveal');
      } else if (myCommitted) {
        setPhase('waiting_reveal');
      } else {
        setPhase('commit');
      }

      const stored = loadPublicInputs(sessionId, userAddress);
      if (stored) setStoredPublicInputs(stored);
    } catch (e) {
      console.warn('[ZK] loadGameState', e);
    }
  }, [clashService, sessionId, userAddress]);

  /** Live updates while a session is in progress (no full page reload) */
  useEffect(() => {
    if (phase === 'create' || phase === 'complete') return;

    const tick = () => {
      void loadGameState();
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [phase, sessionId, loadGameState]);

  const handleStartGame = async () => {
    setError(null);
    setSuccess(null);
    const pts = parsePoints(pointsStr);
    if (!pts || pts <= 0n) {
      setError('Enter a valid points amount');

      return;
    }
    if (!opponentAddress.trim()) {
      setError('Enter opponent contract address (C…)');
      return;
    }
    if (opponentAddress.trim() === userAddress) {
      setError('Cannot play against yourself');
      return;
    }

    setBusy(true);
    try {
      const sid = createRandomSessionId();
      setSessionId(sid);
      setSelectedMoves(createEmptyMoves());
      setStoredPublicInputs(null);
      setProofBundle(null);
      setProofMovesKey(null);
      setGamePlayback(null);
      setGameState(null);

      await clashService.startGameWithSmartAccount(
        sid,
        userAddress,
        opponentAddress.trim(),
        pts,
        pts,
        smartAccountService
      );

      setSuccess('Game started! Choose your 3-turn strategy.');
      setPhase('commit');
      await loadGameState();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadSession = async () => {
    setError(null);
    const sid = parseInt(loadSessionId.trim(), 10);
    if (Number.isNaN(sid) || sid <= 0) {
      setError('Enter a valid session ID');
      return;
    }
    setBusy(true);
    try {
      const game = await clashService.getGame(sid);
      if (!game) {
        setError('Game not found');
        return;
      }
      const p1 = game.player1;
      const p2 = game.player2;
      if (p1 !== userAddress && p2 !== userAddress) {
        setError('You are not a player in this game');
        return;
      }
      setSessionId(sid);
      setSelectedMoves(loadMovesFromStorage(sid, userAddress));
      const sp = loadPublicInputs(sid, userAddress);
      setStoredPublicInputs(sp);
      setProofBundle(null);
      setProofMovesKey(null);
      setGameState(game);
      setLoadSessionId('');

      if (game.has_battle_result) {
        setPhase('complete');
        const pb = await clashService.getGamePlayback(sid);
        if (pb) setGamePlayback(pb);
      } else if (
        game.player1_commitment?.has_revealed &&
        game.player2_commitment?.has_revealed
      ) {
        setPhase('resolve');
      } else if (game.has_player1_commitment && game.has_player2_commitment) {
        setPhase('reveal');
      } else {
        setPhase('commit');
      }
      recordSessionLoadActivity({ sessionId: sid });
      setSuccess('Session loaded');
      setTimeout(() => setSuccess(null), 2500);
      await loadGameState();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game');
    } finally {
      setBusy(false);
    }
  };

  /** Steps 3–5 in testnet-option.sh: nargo execute + prove_ultra_keccak_honk (here: Noir + bb.js in browser). */
  const handleGenerateProof = async () => {
    const allFilled = selectedMoves.every((m) => m.attack !== null && m.defense !== null);
    if (!allFilled) {
      setError('Pick attack and defense for all 3 turns');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess('Running circuit + UltraHonk (same role as nargo execute + prove_ultra_keccak_honk)…');
    try {
      const attacks = selectedMoves.map((m) => m.attack!) as [number, number, number];
      const defenses = selectedMoves.map((m) => m.defense!) as [number, number, number];

      const proofResult = await noir.current.generateClashProof('duel_commit_circuit', {
        attacks,
        defenses,
        playerAddress: userAddress,
        sessionId,
      });

      setProofBundle(proofResult);
      setProofMovesKey(JSON.stringify(selectedMoves.map((m) => [m.attack, m.defense])));
      setSuccess(
        `Proof ready in ${proofResult.proofTime}s. Commitment hash (last 32 B of public_inputs) is shown below — then submit commit_moves.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Proof generation failed');
      setProofBundle(null);
      setProofMovesKey(null);
    } finally {
      setBusy(false);
    }
  };

  /** Step 16 in testnet-option.sh: stellar contract invoke … commit_moves --public_inputs --proof_bytes */
  const handleSubmitCommit = async () => {
    if (!proofBundle || !proofMatchesMoves) {
      setError('Generate a proof that matches the current moves, then submit.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clashService.commitMovesWithSmartAccount(
        sessionId,
        userAddress,
        proofBundle.publicInputs,
        proofBundle.proofBytes,
        smartAccountService
      );

      savePublicInputs(sessionId, userAddress, proofBundle.publicInputs);
      setStoredPublicInputs(proofBundle.publicInputs);
      setProofBundle(null);
      setProofMovesKey(null);
      setPhase('waiting_reveal');
      setSuccess('commit_moves confirmed on-chain');
      await loadGameState();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (!storedPublicInputs) {
      setError('Missing stored commitment data. Commit from this browser first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clashService.revealMovesWithSmartAccount(
        sessionId,
        userAddress,
        toBuffer(storedPublicInputs),
        toContractMoves(selectedMoves),
        smartAccountService
      );
      clearPublicInputs(sessionId, userAddress);
      setSuccess('Moves revealed');
      await loadGameState();
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reveal failed');
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    setBusy(true);
    setError(null);
    try {
      await clashService.resolveBattleWithSmartAccount(sessionId, smartAccountService);
      const pb = await clashService.getGamePlayback(sessionId);
      if (pb) setGamePlayback(pb);
      setPhase('complete');
      await loadGameState();
      setSuccess('Battle resolved');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolve failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    if (sessionId && userAddress) {
      clearPublicInputs(sessionId, userAddress);
      try {
        localStorage.removeItem(storageKeyMoves(sessionId, userAddress));
      } catch {
        /* ignore */
      }
    }
    setPhase('create');
    setSessionId(createRandomSessionId());
    setGameState(null);
    setGamePlayback(null);
    setSelectedMoves(createEmptyMoves());
    setStoredPublicInputs(null);
    setProofBundle(null);
    setProofMovesKey(null);
    setError(null);
    setSuccess(null);
  };

  useEffect(() => {
    saveMovesToStorage(sessionId, userAddress, selectedMoves);
  }, [selectedMoves, sessionId, userAddress]);

  const movesKey = useMemo(
    () => JSON.stringify(selectedMoves.map((m) => [m.attack, m.defense])),
    [selectedMoves]
  );
  const proofMatchesMoves = Boolean(proofBundle && proofMovesKey === movesKey);

  const isP1 = gameState && gameState.player1 === userAddress;
  const isP2 = gameState && gameState.player2 === userAddress;
  const p1c = gameState?.has_player1_commitment ?? false;
  const p2c = gameState?.has_player2_commitment ?? false;
  const p1r = gameState?.player1_commitment?.has_revealed ?? false;
  const p2r = gameState?.player2_commitment?.has_revealed ?? false;
  const myCommitted = isP1 ? p1c : isP2 ? p2c : false;
  const myRevealed = isP1 ? p1r : isP2 ? p2r : false;

  const scriptCue = useMemo(
    () =>
      describeScriptStep({
        hasGame: !!gameState,
        phase,
        myCommitted,
        p1c,
        p2c,
        p1r,
        p2r,
        hasBattle: gameState?.has_battle_result ?? false,
        hasLocalProof: !!proofBundle,
      }),
    [gameState, phase, myCommitted, p1c, p2c, p1r, p2r, proofBundle]
  );

  const syncedLabel =
    lastSyncedAt != null
      ? `Live · ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago`
      : 'Live sync';

  return (
    <div className="clash-game-container">
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="text-xs font-mono text-gray-500">{syncedLabel}</span>
        <button
          type="button"
          onClick={() => void loadGameState()}
          className="text-xs font-bold px-3 py-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
        >
          Sync now
        </button>
      </div>

      <PhaseHeader phase={phase === 'waiting_reveal' ? 'reveal' : phase} sessionId={sessionId} />

      {gameState && phase !== 'create' && (
        <div className="mb-4 rounded-xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-sky-800">
            Same flow as testnet-option.sh
          </p>
          <p className="text-sm font-bold text-gray-900">{scriptCue.ref}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">{scriptCue.hint}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[11px] text-gray-500">
            <li>start_game — session, both players, stake (script step 15)</li>
            <li>Prover inputs: 3× attack + 3× defense; player_address + session_id fields for the circuit</li>
            <li>nargo execute + prove_ultra_keccak_honk → split public_inputs (96 B) + proof_bytes (browser uses Noir + bb.js)</li>
            <li>commit_moves with --public_inputs and --proof_bytes (steps 16–17)</li>
            <li>reveal_moves with same public_inputs + moves JSON (steps 18–19)</li>
            <li>resolve_battle (step 20), then get_game_playback (step 21)</li>
          </ol>
        </div>
      )}

      {error && <AlertBanner type="error" message={error} />}
      {success && <AlertBanner type="success" message={success} />}

      {phase === 'create' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>Player 1</strong> opens the duel: both captains stake the same points. Each side picks three rounds
            of attack and defense, then seals the plan with a proof and <code className="text-xs">commit_moves</code>.
            After both commits, you <code className="text-xs">reveal_moves</code> and the contract resolves the battle.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Opponent (C…)</label>
              <input
                className="w-full border-2 rounded-lg px-3 py-2 text-sm font-mono"
                value={opponentAddress}
                onChange={(e) => setOpponentAddress(e.target.value)}
                placeholder="C…"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Stake each (XLM)</label>
              <input
                className="w-full border-2 rounded-lg px-3 py-2 text-sm"
                value={pointsStr}
                onChange={(e) => setPointsStr(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleStartGame()}
            className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-red-600 to-orange-500 shadow-lg disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Start duel (you are player 1)'}
          </button>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <p className="text-xs font-bold text-gray-500 mb-2">Join existing session</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border-2 rounded-lg px-3 py-2 text-sm font-mono"
                value={loadSessionId}
                onChange={(e) => setLoadSessionId(e.target.value)}
                placeholder="Session ID"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleLoadSession()}
                className="px-4 py-2 rounded-lg font-bold border-2 border-gray-300 bg-white"
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {phase !== 'create' && gameState && (
        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          <PlayerStatusCard
            label="Player 1"
            address={gameState.player1}
            points={gameState.player1_points}
            isYou={!!isP1}
            committed={p1c}
            revealed={p1r}
          />
          <PlayerStatusCard
            label="Player 2"
            address={gameState.player2}
            points={gameState.player2_points}
            isYou={!!isP2}
            committed={p2c}
            revealed={p2r}
          />
        </div>
      )}

      {gameState && phase === 'commit' && !myCommitted && (
        <div className="space-y-4">
          <MoveSelector moves={selectedMoves} onChange={setSelectedMoves} disabled={busy} />
          <StrategyPreview moves={selectedMoves} />
          <p className="text-center text-[11px] font-mono text-gray-500">{formatMovesRawLine(selectedMoves)}</p>

          {proofBundle && (
            <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/90 p-4 text-sm">
              <div className="font-black text-violet-900">Local proof (not yet on-chain)</div>
              <div className="break-all font-mono text-xs text-violet-950">
                commitment_hash: {proofBundle.commitmentHash}
              </div>
              <div className="text-xs text-gray-600">
                public_inputs: {proofBundle.publicInputs.length} bytes (addr ∥ session ∥ hash) · proof_bytes:{' '}
                {proofBundle.proofBytes.length} bytes
              </div>
              {!proofMatchesMoves && (
                <p className="text-xs font-bold text-amber-700">Moves changed — regenerate proof before commit_moves.</p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGenerateProof()}
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3 font-black text-white shadow-lg disabled:opacity-50"
          >
            {busy && !proofBundle ? 'Generating proof…' : '1) Generate proof (circuit + UltraHonk)'}
          </button>

          <button
            type="button"
            disabled={busy || !proofBundle || !proofMatchesMoves}
            onClick={() => void handleSubmitCommit()}
            className="w-full rounded-xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-black text-white shadow-lg disabled:opacity-50"
          >
            {busy && proofBundle ? 'Submitting commit_moves…' : '2) Submit commit_moves (on-chain)'}
          </button>
        </div>
      )}

      {phase === 'waiting_reveal' && myCommitted && gameState && (
        <AlertBanner type="info" message="You committed. Waiting for the other player’s commit_moves…" />
      )}

      {phase === 'reveal' && gameState && (
        <div className="space-y-4">
          <AlertBanner type="info" message="Both committed — reveal your moves (must match your proof)." />
          <MoveSelector
            moves={selectedMoves}
            onChange={setSelectedMoves}
            disabled={busy || myRevealed}
          />
          {!myRevealed && (
            <button
              type="button"
              disabled={busy || !storedPublicInputs}
              onClick={() => void handleReveal()}
              className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-emerald-600 to-teal-500 shadow-lg disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Reveal moves on-chain'}
            </button>
          )}
          {myRevealed && (
            <AlertBanner type="success" message="You revealed. Waiting for opponent or resolve…" />
          )}
        </div>
      )}

      {phase === 'resolve' && gameState && (
        <div className="space-y-4">
          <AlertBanner type="info" message="Both revealed — anyone can resolve the battle." />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleResolve()}
            className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-amber-600 to-orange-500 shadow-lg disabled:opacity-50"
          >
            {busy ? 'Resolving…' : 'Resolve battle'}
          </button>
        </div>
      )}

      {phase === 'complete' && gameState?.has_battle_result && (
        <div className="mt-6 p-6 rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50">
          <h3 className="text-2xl font-black text-center mb-4">⚔️ Battle finished</h3>
          <p className="text-center text-lg font-bold">
            {(() => {
              const br = gameState.battle_result;
              if (!br) return 'Resolved';
              if (br.is_draw) return '🤝 Draw';
              const w = br.winner;
              const addr = typeof w === 'string' ? w : undefined;
              if (!addr) return '🤝 Draw';
              return addr === userAddress ? '🏆 You won!' : '😢 You lost';
            })()}
          </p>
          {gamePlayback && gamePlayback.turn_results?.length > 0 && (
            <div className="mt-4 text-sm text-gray-700 space-y-2">
              <p className="font-bold">Turn-by-turn</p>
              <ul className="list-disc pl-5 space-y-1">
                {gamePlayback.turn_results.map((t, i) => (
                  <li key={i}>
                    Turn {Number(t.turn) + 1}: P1 {t.player1_hp_remaining} HP · P2 {t.player2_hp_remaining} HP
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="mt-6 w-full py-3 rounded-xl font-black border-2 border-gray-400 bg-white"
          >
            New duel
          </button>
        </div>
      )}

      {phase !== 'create' && (
        <button
          type="button"
          onClick={handleReset}
          className="mt-6 text-xs font-bold text-gray-500 underline"
        >
          Abandon & start over
        </button>
      )}
    </div>
  );
}
