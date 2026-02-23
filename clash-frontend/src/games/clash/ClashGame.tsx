/**
 * ClashGame.tsx
 */

import { useState, useEffect, useRef } from 'react';
import { ClashGameService } from './clashService';
import { requestCache, createCacheKey } from '@/utils/requestCache';
import { useWallet } from '@/hooks/useWallet';
import { CLASH_CONTRACT } from '@/utils/constants';
import { getFundedSimulationSourceAddress } from '@/utils/simulationUtils';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { NoirService } from '@/utils/NoirService';
import type { Game, Move, GamePlayback } from './bindings';
import { Attack, Defense } from './bindings';
import { PirateStoryBox } from '@/components/PirateStoryBox';
import fireball from '@/components/sound/fireball.wav'
import lightning from '@/components/sound/lightning.wav'
import slash from '@/components/sound/slash.mp3'
import '@/components/PirateStoryBox.css';

import {
  PhaseHeader,
  AlertBanner,
  PlayerStatusCard,
  CreateGamePanel,
  createEmptyMoves,
  type SelectedMove,
  type CreateMode,
} from '@/components/Clashgamecomponents';
import '@/components/Clashgameenhanced.css';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const createRandomSessionId = (): number => {
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
};

const POINTS_DECIMALS = 7;

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

function toContractMoves(moves: SelectedMove[]): Move[] {
  return moves.map(m => ({
    attack:  (m.attack  as unknown) as Attack,
    defense: (m.defense as unknown) as Defense,
  }));
}

function toBuffer(arr: Uint8Array): Buffer {
  return Buffer.from(arr);
}

const clashService = new ClashGameService(CLASH_CONTRACT);

type GamePhase = 'create' | 'commit' | 'waiting_reveal' | 'reveal' | 'resolve' | 'complete';

interface ClashGameProps {
  userAddress:        string;
  currentEpoch:       number;
  availablePoints:    bigint;
  initialXDR?:        string | null;
  initialSessionId?:  number | null;
  onStandingsRefresh: () => void;
  onGameComplete:     () => void;
}

// ═══════════════════════════════════════════════════════════════════════
// Card Metadata
// ═══════════════════════════════════════════════════════════════════════

const ATTACK_CARDS = {
  [Attack.Slash]: {
    name: 'Slash',
    emoji: '⚔️',
    damage: 30,
    flavor: 'Swift blade strikes true',
    gradient: 'from-amber-500 to-yellow-400',
    borderColor: 'border-amber-400',
    glowColor: 'rgba(245, 158, 11, 0.5)',
  },
  [Attack.Fireball]: {
    name: 'Fireball',
    emoji: '🔥',
    damage: 40,
    flavor: 'Burn them to ashes',
    gradient: 'from-red-600 to-orange-400',
    borderColor: 'border-red-500',
    glowColor: 'rgba(220, 38, 38, 0.5)',
  },
  [Attack.Lightning]: {
    name: 'Lightning',
    emoji: '⚡',
    damage: 35,
    flavor: 'Strike with divine fury',
    gradient: 'from-violet-600 to-blue-400',
    borderColor: 'border-violet-500',
    glowColor: 'rgba(124, 58, 237, 0.5)',
  },
};

const DEFENSE_CARDS = {
  [Defense.Block]: {
    name: 'Block',
    emoji: '🛡️',
    info: 'Stops: Lightning',
    flavor: 'An impenetrable defense',
    gradient: 'from-sky-600 to-cyan-400',
    borderColor: 'border-sky-500',
    glowColor: 'rgba(2, 132, 199, 0.5)',
  },
  [Defense.Dodge]: {
    name: 'Dodge',
    emoji: '🏃',
    info: 'Stops: Slash ',
    flavor: 'A shadow in the wind',
    gradient: 'from-emerald-600 to-green-400',
    borderColor: 'border-emerald-500',
    glowColor: 'rgba(5, 150, 105, 0.5)',
  },
  [Defense.Counter]: {
    name: 'Counter',
    emoji: '🔄',
    info: 'Stops: Fire',
    flavor: 'Turn their strength against them',
    gradient: 'from-pink-600 to-rose-400',
    borderColor: 'border-pink-500',
    glowColor: 'rgba(219, 39, 119, 0.5)',
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

interface BattleCardProps {
  type: 'attack' | 'defense';
  moveId: number;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  showBack?: boolean;
}

const BattleCard = ({
  type,
  moveId,
  isSelected,
  onClick,
  disabled,
  showBack = false,
}: BattleCardProps) => {
  const card = type === 'attack'
    ? ATTACK_CARDS[moveId as Attack]
    : DEFENSE_CARDS[moveId as Defense];

  if (showBack) {
    return (
      <div className="battle-card battle-card-back">
        <div className="card-back-design">
          <div className="skull-emblem">💀</div>
          <div className="card-back-pattern"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`battle-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={!disabled ? onClick : undefined}
      style={{
        '--card-gradient': `linear-gradient(135deg, ${card.gradient})`,
        '--card-glow': card.glowColor,
      } as React.CSSProperties}
    >
      <div className="card-header">
        <span className="card-emoji">{card.emoji}</span>
        <span className="card-name">{card.name}</span>
      </div>
      <div className="card-stats">
        {type === 'attack' && (
          <span className="card-damage">{(card as any).damage} DMG</span>
        )}
        {type === 'defense' && (
          <span className="card-info">{(card as any).info}</span>
        )}
      </div>
      <div className="card-flavor">{card.flavor}</div>
      <div className={`card-border ${card.borderColor}`}></div>
    </div>
  );
};

interface TurnSlotProps {
  turnNumber: number;
  attackId: number | null;
  defenseId: number | null;
  onSelectAttack: () => void;
  onSelectDefense: () => void;
  isLocked: boolean;
}

const TurnSlot = ({
  turnNumber,
  attackId,
  defenseId,
  onSelectAttack,
  onSelectDefense,
  isLocked,
}: TurnSlotProps) => {
  const turnNames = ['Opening Strike', 'Decisive Blow', 'Final Stand'];

  return (
    <div className="turn-slot-container">
      <div className="turn-slot-header">
        <span className="turn-flag">🏴‍☠️</span>
        <span className="turn-title">TURN {turnNumber} - {turnNames[turnNumber - 1]}</span>
        <div className="turn-progress">
          {[...Array(turnNumber)].map((_, i) => (
            <span key={i} className="progress-star filled">⭐</span>
          ))}
          {[...Array(3 - turnNumber)].map((_, i) => (
            <span key={i} className="progress-star">☆</span>
          ))}
        </div>
      </div>

      <div className="turn-slot-content">
        <div className="card-slot attack-slot" onClick={onSelectAttack}>
          {attackId !== null ? (
            <BattleCard
              type="attack"
              moveId={attackId}
              isSelected={false}
              onClick={() => {}}
              showBack={isLocked}
            />
          ) : (
            <div className="empty-slot">
              <span className="slot-label">⚔️ ATTACK</span>
              <span className="slot-hint">Click to select</span>
            </div>
          )}
        </div>

        <div className="vs-divider">⚔️</div>

        <div className="card-slot defense-slot" onClick={onSelectDefense}>
          {defenseId !== null ? (
            <BattleCard
              type="defense"
              moveId={defenseId}
              isSelected={false}
              onClick={() => {}}
              showBack={isLocked}
            />
          ) : (
            <div className="empty-slot">
              <span className="slot-label">🛡️ DEFENSE</span>
              <span className="slot-hint">Click to select</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface CardSelectionModalProps {
  cardSelectionMode: { turn: number; type: 'attack' | 'defense' } | null;
  onClose: () => void;
  onSelect: (turn: number, type: 'attack' | 'defense', cardId: number) => void;
}

const CardSelectionModal = ({
  cardSelectionMode,
  onClose,
  onSelect,
}: CardSelectionModalProps) => {
  if (!cardSelectionMode) return null;

  const { turn, type } = cardSelectionMode;
  const cards = type === 'attack'
    ? [Attack.Slash, Attack.Fireball, Attack.Lightning]
    : [Defense.Block, Defense.Dodge, Defense.Counter];

  return (
    <div className="card-selection-overlay" onClick={onClose}>
      <div className="card-selection-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Select {type === 'attack' ? 'Attack' : 'Defense'} for Turn {turn + 1}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-cards">
          {cards.map(cardId => (
            <BattleCard
              key={cardId}
              type={type}
              moveId={cardId}
              isSelected={false}
              onClick={() => onSelect(turn, type, cardId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// CINEMATIC BATTLE PLAYBACK - Movie-like Experience
// ═══════════════════════════════════════════════════════════════════════

interface CinematicBattlePlaybackProps {
  gamePlayback: GamePlayback;
  currentCinematicTurn: number;
  setCurrentCinematicTurn: (n: number) => void;
  setIsPlayingCinematic: (b: boolean) => void;
  userAddress: string;
}

const CinematicBattlePlayback = ({
  gamePlayback,
  currentCinematicTurn,
  setCurrentCinematicTurn,
  setIsPlayingCinematic,
  userAddress,
}: CinematicBattlePlaybackProps) => {
  const [animationPhase, setAnimationPhase] = useState<'intro' | 'p1-attack' | 'p1-result' | 'p2-attack' | 'p2-result' | 'complete'>('intro');
  const [showWinner, setShowWinner] = useState(false);
  const turn = gamePlayback.turn_results[currentCinematicTurn];

  const playAttackSound = (attack: Attack) => {
    const soundMap = {
      [Attack.Slash]: slash,
      [Attack.Fireball]: fireball,
      [Attack.Lightning]: lightning,
    };
    
    const audio = new Audio(soundMap[attack]);
    audio.volume = 0.7;
    audio.play().catch(err => console.warn('Sound play failed:', err));
  };

  
  useEffect(() => {
    // Reset animation when turn changes
    setAnimationPhase('intro');
    setShowWinner(false);
    
    const timeline = [
      { phase: 'intro', delay: 0 },
      { phase: 'p1-attack', delay: 1500 },
      { phase: 'p1-result', delay: 3500 },
      { phase: 'p2-attack', delay: 5500 },
      { phase: 'p2-result', delay: 7500 },
      { phase: 'complete', delay: 9000 },
    ];

    
    const timeouts = timeline.map(({ phase, delay }) =>
      setTimeout(() => {
        setAnimationPhase(phase as any);
        
        // Play attack sounds
        if (phase === 'p1-attack') {
          playAttackSound(Number(turn.player1_move.attack) as Attack);
        } else if (phase === 'p2-attack') {
          playAttackSound(Number(turn.player2_move.attack) as Attack);
        }
      }, delay)
    );
    
    // Show winner after last turn completes
    const isLastTurn = currentCinematicTurn === gamePlayback.turn_results.length - 1;
    if (isLastTurn) {
      timeouts.push(setTimeout(() => setShowWinner(true), 10500));
    }
    
    return () => timeouts.forEach(clearTimeout);
  }, [currentCinematicTurn, gamePlayback.turn_results.length]);
  
  if (!turn) return null;

  const p1Attack = ATTACK_CARDS[Number(turn.player1_move.attack) as Attack];
  const p1Defense = DEFENSE_CARDS[Number(turn.player1_move.defense) as Defense];
  const p2Attack = ATTACK_CARDS[Number(turn.player2_move.attack) as Attack];
  const p2Defense = DEFENSE_CARDS[Number(turn.player2_move.defense) as Defense];
  
  const p1DamageTaken = Number(turn.player1_damage_taken);
  const p2DamageTaken = Number(turn.player2_damage_taken);
  const p1HPRemaining = Number(turn.player1_hp_remaining);
  const p2HPRemaining = Number(turn.player2_hp_remaining);
  
  // Determine winner
  const winnerAddress = gamePlayback.winner?.toString();
  const isPlayer1Winner = winnerAddress === gamePlayback.player1.toString();
  const isPlayer2Winner = winnerAddress === gamePlayback.player2.toString();
  const isUserWinner = winnerAddress === userAddress;
  const isDraw = p1HPRemaining === p2HPRemaining;

  return (
    <div className="cinematic-overlay">
      <div className="cinematic-viewport">
        {/* Dramatic Turn Title */}
        <div className={`turn-title-card ${animationPhase !== 'intro' ? 'fade-out' : ''}`}>
          <div className="turn-chapter">ROUND {Number(turn.turn) + 1}</div>
          <div className="turn-subtitle">{['THE OPENING GAMBIT', 'CLASH OF PIRATES', 'THE FINAL RECKONING'][Number(turn.turn)]}</div>
          <div className="turn-ornament">⚔ ⚔ ⚔</div>
        </div>

        {/* Winner Announcement */}
        {showWinner && (
          <div className="winner-announcement">
            <div className="winner-backdrop"></div>
            <div className="winner-content">
              {isDraw ? (
                <>
                  <div className="winner-icon draw-icon">⚖️</div>
                  <div className="winner-title draw-title">DRAW</div>
                  <div className="winner-subtitle">Both warriors stand equal</div>
                  <div className="winner-hp">
                    <span>CAPTAIN RED: {p1HPRemaining} HP</span>
                    <span className="hp-separator">━</span>
                    <span>CAPTAIN BLUE: {p2HPRemaining} HP</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={`winner-icon ${isUserWinner ? 'victory-icon' : 'defeat-icon'}`}>
                    {isUserWinner ? '👑' : '💀'}
                  </div>
                  <div className={`winner-title ${isUserWinner ? 'victory-title' : 'defeat-title'}`}>
                    {isUserWinner ? 'VICTORY!' : 'DEFEAT'}
                  </div>
                  <div className="winner-subtitle">
                    {isPlayer1Winner ? 'CAPTAIN RED' : 'CAPTAIN BLUE'} emerges victorious
                  </div>
                  <div className="winner-hp">
                    <span className={isPlayer1Winner ? 'winner-hp-text' : ''}>
                      CAPTAIN RED: {p1HPRemaining} HP
                    </span>
                    <span className="hp-separator">━</span>
                    <span className={isPlayer2Winner ? 'winner-hp-text' : ''}>
                      CAPTAIN BLUE: {p2HPRemaining} HP
                    </span>
                  </div>
                  {isUserWinner && (
                    <div className="victory-effects">
                      <div className="confetti">🎉</div>
                      <div className="confetti">🎊</div>
                      <div className="confetti">✨</div>
                      <div className="confetti">⭐</div>
                      <div className="confetti">🎉</div>
                    </div>
                  )}
                </>
              )}
              <button 
                className="winner-continue-btn"
                onClick={() => setIsPlayingCinematic(false)}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Combat Arena */}
        <div className="combat-arena">
          {/* Player 1 Side */}
          <div className={`duelist duelist-left ${animationPhase === 'p1-attack' ? 'attacking' : ''} ${animationPhase === 'p1-result' && p1DamageTaken > 0 ? 'taking-damage' : ''} ${showWinner && isPlayer1Winner ? 'winner-glow' : ''} ${showWinner && isPlayer2Winner ? 'loser-fade' : ''}`}>
            <div className="duelist-avatar">
              <div className="avatar-portrait">🏴‍☠️</div>
              <div className="avatar-glow"></div>
            </div>
            <div className="duelist-name">CAPTAIN RED</div>
            <div className="hp-container">
              <div className="hp-label">VITALITY</div>
              <div className="hp-bar-cinematic">
                <div 
                  className="hp-fill-cinematic"
                  style={{ width: `${(p1HPRemaining / 100) * 100}%` }}
                >
                  <div className="hp-shine"></div>
                </div>
                <div className="hp-value">{p1HPRemaining}</div>
              </div>
            </div>
          </div>

          {/* Center Stage - Move Reveals */}
          <div className="center-stage">
            {/* Player 1 Attack Phase */}
            {(animationPhase === 'p1-attack' || animationPhase === 'p1-result') && (
              <div className="move-showcase showcase-p1">
                <div className="move-label mb-5">PLAYER 1 STRIKES</div>
                <div className="showcased-card">
                  <div className="card-glow-ring"></div>
                  <BattleCard
                    type="attack"
                    moveId={Number(turn.player1_move.attack)}
                    isSelected={true}
                    onClick={() => {}}
                  />
                </div>
                <div className="move-arrow">
                  <span>→ → →</span>
                </div>
                <div className="showcased-card flex! space-x-2">
                  <div className="card-glow-ring"></div>
                  <BattleCard
                    type="defense"
                    moveId={Number(turn.player2_move.defense)}
                    isSelected={true}
                    onClick={() => {}}
                  />
                </div>
                <div className="move-label mb-5">PLAYER 2 DEFENDS</div>
              </div>
            )}

            {/* Player 1 Result */}
            {animationPhase === 'p1-result' && (
              <div className="result-explosion">
                {p2DamageTaken > 0 ? (
                  <>
                    <div className="damage-burst">
                      <div className="burst-ring burst-1"></div>
                      <div className="burst-ring burst-2"></div>
                      <div className="burst-ring burst-3"></div>
                      <div className="damage-text">
                        <div className="damage-amount">-{p2DamageTaken}</div>
                        <div className="damage-label">DAMAGE</div>
                      </div>
                    </div>
                    <div className="impact-flash"></div>
                  </>
                ) : (
                  <div className="block-success">
                    <div className="shield-icon">🛡️</div>
                    <div className="block-text">BLOCKED!</div>
                    <div className="block-sparkles">✨ ✨ ✨</div>
                  </div>
                )}
              </div>
            )}

            {/* Player 2 Attack Phase */}
            {(animationPhase === 'p2-attack' || animationPhase === 'p2-result') && (
              <div className="move-showcase showcase-p2">
                <div className="move-label mb-5">PLAYER 2 RETALIATES</div>
                <div className="showcased-card">
                  <div className="card-glow-ring"></div>
                  <BattleCard
                    type="attack"
                    moveId={Number(turn.player2_move.attack)}
                    isSelected={true}
                    onClick={() => {}}
                  />
                </div>
                <div className="move-arrow">
                  <span>← ← ←</span>
                </div>
                <div className="showcased-card">
                  <div className="card-glow-ring"></div>
                  <BattleCard
                    type="defense"
                    moveId={Number(turn.player1_move.defense)}
                    isSelected={true}
                    onClick={() => {}}
                  />
                </div>
                <div className="move-label mb-5">PLAYER 1 DEFENDS</div>
              </div>
            )}

            {/* Player 2 Result */}
            {animationPhase === 'p2-result' && (
              <div className="result-explosion">
                {p1DamageTaken > 0 ? (
                  <>
                    <div className="damage-burst">
                      <div className="burst-ring burst-1"></div>
                      <div className="burst-ring burst-2"></div>
                      <div className="burst-ring burst-3"></div>
                      <div className="damage-text">
                        <div className="damage-amount">-{p1DamageTaken}</div>
                        <div className="damage-label">DAMAGE</div>
                      </div>
                    </div>
                    <div className="impact-flash"></div>
                  </>
                ) : (
                  <div className="block-success">
                    <div className="shield-icon">🛡️</div>
                    <div className="block-text">BLOCKED!</div>
                    <div className="block-sparkles">✨ ✨ ✨</div>
                  </div>
                )}
              </div>
            )}

            {/* Round Complete */}
            {animationPhase === 'complete' && (
              <div className="round-complete">
                <div className="complete-icon">⚡</div>
                <div className="complete-text">ROUND COMPLETE</div>
              </div>
            )}
          </div>

          {/* Player 2 Side */}
          <div className={`duelist duelist-right ${animationPhase === 'p2-attack' ? 'attacking' : ''} ${animationPhase === 'p2-result' && p2DamageTaken > 0 ? 'taking-damage' : ''} ${showWinner && isPlayer2Winner ? 'winner-glow' : ''} ${showWinner && isPlayer1Winner ? 'loser-fade' : ''}`}>
            <div className="duelist-avatar">
              <div className="avatar-portrait">🏴‍☠️</div>
              <div className="avatar-glow"></div>
            </div>
            <div className="duelist-name">CAPTAIN BLUE</div>
            <div className="hp-container">
              <div className="hp-label">VITALITY</div>
              <div className="hp-bar-cinematic">
                <div 
                  className="hp-fill-cinematic"
                  style={{ width: `${(p2HPRemaining / 100) * 100}%` }}
                >
                  <div className="hp-shine"></div>
                </div>
                <div className="hp-value">{p2HPRemaining}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="cinematic-nav">
          <button
            className="nav-btn nav-prev"
            onClick={() => setCurrentCinematicTurn(Math.max(0, currentCinematicTurn - 1))}
            disabled={currentCinematicTurn === 0}
          >
            <span className="nav-icon">◄</span>
            <span className="nav-label">Previous</span>
          </button>
          
          <div className="round-indicator">
            <div className="round-dots">
              {gamePlayback.turn_results.map((_, idx) => (
                <div 
                  key={idx} 
                  className={`round-dot ${idx === currentCinematicTurn ? 'active' : ''} ${idx < currentCinematicTurn ? 'complete' : ''}`}
                  onClick={() => setCurrentCinematicTurn(idx)}
                />
              ))}
            </div>
          </div>

          <button
            className="nav-btn nav-skip"
            onClick={() => setIsPlayingCinematic(false)}
          >
            <span className="nav-icon">✕</span>
            <span className="nav-label">Exit</span>
          </button>
          
          <button
            className="nav-btn nav-next"
            onClick={() => {
              if (currentCinematicTurn < gamePlayback.turn_results.length - 1) {
                setCurrentCinematicTurn(currentCinematicTurn + 1);
              } else {
                setIsPlayingCinematic(false);
              }
            }}
            disabled={currentCinematicTurn >= gamePlayback.turn_results.length - 1}
          >
            <span className="nav-label">Next</span>
            <span className="nav-icon">►</span>
          </button>
        </div>
      </div>
    </div>
  );
};



// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

export function ClashGame({
  userAddress,
  availablePoints,
  initialXDR,
  initialSessionId,
  onStandingsRefresh,
  onGameComplete,
}: ClashGameProps) {
  const DEFAULT_POINTS = '0.1';
  const { getContractSigner, walletType } = useWallet();
  const noirService = useRef(new NoirService());

  const [sessionId,    setSessionId]    = useState<number>(() => createRandomSessionId());
  const [gameState,    setGameState]    = useState<Game | null>(null);
  const [gamePlayback, setGamePlayback] = useState<GamePlayback | null>(null);
  const [gamePhase,    setGamePhase]    = useState<GamePhase>('create');

  const [player1Address,       setPlayer1Address]       = useState(userAddress);
  const [player1Points,        setPlayer1Points]        = useState(DEFAULT_POINTS);
  const [createMode,           setCreateMode]           = useState<CreateMode>('create');
  const [exportedAuthEntryXDR, setExportedAuthEntryXDR] = useState<string | null>(null);
  const [importAuthEntryXDR,   setImportAuthEntryXDR]   = useState('');
  const [importSessionId,      setImportSessionId]      = useState('');
  const [importPlayer1,        setImportPlayer1]        = useState('');
  const [importPlayer1Points,  setImportPlayer1Points]  = useState('');
  const [importPlayer2Points,  setImportPlayer2Points]  = useState(DEFAULT_POINTS);
  const [loadSessionId,        setLoadSessionId]        = useState('');
  const [authEntryCopied,  setAuthEntryCopied]  = useState(false);
  const [shareUrlCopied,   setShareUrlCopied]   = useState(false);
  const [xdrParsing,       setXdrParsing]       = useState(false);
  const [xdrParseError,    setXdrParseError]    = useState<string | null>(null);
  const [xdrParseSuccess,  setXdrParseSuccess]  = useState(false);

  const [selectedMoves,      setSelectedMoves]      = useState<SelectedMove[]>(createEmptyMoves());
  const [storedPublicInputs, setStoredPublicInputs] = useState<Uint8Array | null>(null);
  const [hasCommitted,       setHasCommitted]       = useState(false);
  const [hasRevealed,        setHasRevealed]        = useState(false);

  const [loading,           setLoading]           = useState(false);
  const [quickstartLoading, setQuickstartLoading] = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  const [success,           setSuccess]           = useState<string | null>(null);

  const isBusy     = loading || quickstartLoading;
  const actionLock = useRef(false);

  // Cinematic playback state
  const [isPlayingCinematic,   setIsPlayingCinematic]   = useState(false);
  const [currentCinematicTurn, setCurrentCinematicTurn] = useState(0);

  // Card selection modal state 
  const [cardSelectionMode, setCardSelectionMode] = useState<{ turn: number; type: 'attack' | 'defense' } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const quickstartAvailable =
    walletType === 'dev' &&
    DevWalletService.isDevModeAvailable() &&
    DevWalletService.isPlayerAvailable(1) &&
    DevWalletService.isPlayerAvailable(2);

  // ─── Effects ───────────────────────────────────────────────

  useEffect(() => {
    setPlayer1Address(userAddress);
    setHasCommitted(false);
    setHasRevealed(false);
    const savedInputs = loadPublicInputs(sessionId, userAddress);
    setStoredPublicInputs(savedInputs);
    const savedMoves = loadSelectedMoves(sessionId, userAddress);
    setSelectedMoves(savedMoves);
    if (gamePhase !== 'create' && sessionId) {
      loadGameState();
    }
  }, [userAddress]);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor;
      const isMobileUA = /android|iphone|ipad|ipod|mobile/i.test(userAgent);
      const isSmallScreen = window.innerWidth < 1024; // treat < lg breakpoint as mobile
  
      setIsMobile(isMobileUA || isSmallScreen);
    };
  
    checkMobile();
    window.addEventListener('resize', checkMobile);
  
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 

  useEffect(() => {
    if (createMode === 'import' && !importPlayer2Points.trim()) setImportPlayer2Points(DEFAULT_POINTS);
  }, [createMode]);

  useEffect(() => {
    if (gamePhase === 'create') return;
    loadGameState();
    const interval = setInterval(loadGameState, 5000);
    return () => clearInterval(interval);
  }, [sessionId, gamePhase]);

  useEffect(() => {
    if (gamePhase === 'complete' && gameState?.has_battle_result) onStandingsRefresh();
  }, [gamePhase, gameState?.has_battle_result]);

  useEffect(() => {
    if (initialXDR) {
      try {
        const parsed = clashService.parseAuthEntry(initialXDR);
        const sid = parsed.sessionId;
        clashService.getGame(sid).then(game => {
          if (game) { setGameState(game); setGamePhase('commit'); setSessionId(sid); }
          else {
            setCreateMode('import');
            setImportAuthEntryXDR(initialXDR);
            setImportSessionId(sid.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          }
        }).catch(() => { setCreateMode('import'); setImportAuthEntryXDR(initialXDR); setImportPlayer2Points('0.1'); });
      } catch {
        setCreateMode('import'); setImportAuthEntryXDR(initialXDR); setImportPlayer2Points('0.1');
      }
      return;
    }

    const urlParams  = new URLSearchParams(window.location.search);
    const authEntry  = urlParams.get('auth');
    const urlSession = urlParams.get('session-id');

    if (authEntry) {
      try {
        const parsed = clashService.parseAuthEntry(authEntry);
        const sid = parsed.sessionId;
        clashService.getGame(sid).then(game => {
          if (game) { setGameState(game); setGamePhase('commit'); setSessionId(sid); }
          else {
            setCreateMode('import');
            setImportAuthEntryXDR(authEntry);
            setImportSessionId(sid.toString());
            setImportPlayer1(parsed.player1);
            setImportPlayer1Points((Number(parsed.player1Points) / 10_000_000).toString());
            setImportPlayer2Points('0.1');
          }
        }).catch(() => { setCreateMode('import'); setImportAuthEntryXDR(authEntry); setImportPlayer2Points('0.1'); });
      } catch {
        setCreateMode('import'); setImportAuthEntryXDR(authEntry); setImportPlayer2Points('0.1');
      }
    } else if (urlSession) {
      setCreateMode('load'); setLoadSessionId(urlSession);
    } else if (initialSessionId != null) {
      setCreateMode('load'); setLoadSessionId(initialSessionId.toString());
    }
  }, [initialXDR, initialSessionId]);

  useEffect(() => {
    if (createMode !== 'import' || !importAuthEntryXDR.trim()) {
      if (!importAuthEntryXDR.trim()) {
        setXdrParsing(false); setXdrParseError(null); setXdrParseSuccess(false);
        setImportSessionId(''); setImportPlayer1(''); setImportPlayer1Points('');
      }
      return;
    }
    setXdrParsing(true); setXdrParseError(null); setXdrParseSuccess(false);
    const tid = setTimeout(async () => {
      try {
        const gp = clashService.parseAuthEntry(importAuthEntryXDR.trim());
        if (gp.player1 === userAddress) throw new Error('You cannot play against yourself.');
        setImportSessionId(gp.sessionId.toString());
        setImportPlayer1(gp.player1);
        setImportPlayer1Points((Number(gp.player1Points) / 10_000_000).toString());
        setXdrParseSuccess(true);
      } catch (err) {
        setXdrParseError(err instanceof Error ? err.message : 'Invalid auth entry');
        setImportSessionId(''); setImportPlayer1(''); setImportPlayer1Points('');
      } finally { setXdrParsing(false); }
    }, 500);
    return () => clearTimeout(tid);
  }, [importAuthEntryXDR, createMode, userAddress]);

  // ─── Storage helpers ────────────────────────────────────────

  const getStorageKey = (sid: number, addr: string) =>
    `clash_public_inputs_${sid}_${addr}`;

  const savePublicInputs = (sid: number, addr: string, publicInputs: Uint8Array) => {
    try {
      const base64 = btoa(String.fromCharCode(...publicInputs));
      localStorage.setItem(getStorageKey(sid, addr), base64);
    } catch (err) { console.error('Failed to save public inputs:', err); }
  };

  const loadPublicInputs = (sid: number, addr: string): Uint8Array | null => {
    try {
      const base64 = localStorage.getItem(getStorageKey(sid, addr));
      if (!base64) return null;
      const binary = atob(base64);
      return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
    } catch (err) { console.error('Failed to load public inputs:', err); return null; }
  };

  const clearPublicInputs = (sid: number, addr: string) => {
    try { localStorage.removeItem(getStorageKey(sid, addr)); }
    catch (err) { console.error('Failed to clear public inputs:', err); }
  };

  const getMovesStorageKey = (sid: number, addr: string) =>
    `clash_selected_moves_${sid}_${addr}`;

  const saveSelectedMoves = (sid: number, addr: string, moves: SelectedMove[]) => {
    try { localStorage.setItem(getMovesStorageKey(sid, addr), JSON.stringify(moves)); }
    catch (err) { console.error('Failed to save moves:', err); }
  };

  const loadSelectedMoves = (sid: number, addr: string): SelectedMove[] => {
    try {
      const stored = localStorage.getItem(getMovesStorageKey(sid, addr));
      if (!stored) return createEmptyMoves();
      return JSON.parse(stored);
    } catch (err) { console.error('Failed to load moves:', err); return createEmptyMoves(); }
  };

  const clearSelectedMoves = (sid: number, addr: string) => {
    try { localStorage.removeItem(getMovesStorageKey(sid, addr)); }
    catch (err) { console.error('Failed to clear moves:', err); }
  };

  // ─── Action runner ──────────────────────────────────────────

  const runAction = async (action: () => Promise<void>) => {
    if (actionLock.current || isBusy) return;
    actionLock.current = true;
    try { await action(); } finally { actionLock.current = false; }
  };

  // ─── Handlers ───────────────────────────────────────────────

  const loadGameState = async () => {
    try {
      const game = await clashService.getGame(sessionId);
      if (!game) return;
      setGameState(game);

      const p1committed = game.has_player1_commitment;
      const p2committed = game.has_player2_commitment;
      const p1revealed  = game.player1_commitment?.has_revealed ?? false;
      const p2revealed  = game.player2_commitment?.has_revealed ?? false;
      const hasBattle   = game.has_battle_result;

      const isP1 = game.player1.toString() === userAddress;
      const isP2 = game.player2.toString() === userAddress;
      const myCommitted = isP1 ? p1committed : isP2 ? p2committed : false;

      if (hasBattle) {
        setGamePhase('complete');
        if (!gamePlayback) {
          const pb = await clashService.getGamePlayback(sessionId);
          if (pb) setGamePlayback(pb);
        }
      } else if (p1revealed && p2revealed) {
        setGamePhase('resolve');
      } else if (p1committed && p2committed) {
        setGamePhase('reveal');
      } else if (myCommitted) {
        setGamePhase('waiting_reveal');
      } else {
        setGamePhase('commit');
      }
    } catch (err) {
      console.log('[loadGameState] Error:', err);
    }
  };

  const handleStartNewGame = () => {
    if (gameState?.has_battle_result) onGameComplete();
    if (sessionId && userAddress) {
      clearPublicInputs(sessionId, userAddress);
      clearSelectedMoves(sessionId, userAddress);
    }
    actionLock.current = false;
    setGamePhase('create');
    setSessionId(createRandomSessionId());
    setGameState(null); setGamePlayback(null);
    setSelectedMoves(createEmptyMoves());
    setStoredPublicInputs(null);
    setHasCommitted(false); setHasRevealed(false);
    setLoading(false); setQuickstartLoading(false);
    setError(null); setSuccess(null);
    setCreateMode('create');
    setExportedAuthEntryXDR(null);
    setImportAuthEntryXDR(''); setImportSessionId(''); setImportPlayer1('');
    setImportPlayer1Points(''); setImportPlayer2Points(DEFAULT_POINTS);
    setLoadSessionId('');
    setAuthEntryCopied(false); setShareUrlCopied(false);
    setXdrParsing(false); setXdrParseError(null); setXdrParseSuccess(false);
    setPlayer1Address(userAddress); setPlayer1Points(DEFAULT_POINTS);
    setIsPlayingCinematic(false); setCurrentCinematicTurn(0);
    setCardSelectionMode(null);
  };

  const handlePrepareTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true); setError(null); setSuccess(null);
        const p1Points = parsePoints(player1Points);
        if (!p1Points || p1Points <= 0n) throw new Error('Enter a valid points amount');

        const signer = getContractSigner();
        const placeholderP2 = await getFundedSimulationSourceAddress([player1Address, userAddress]);
        const authEntryXDR = await clashService.prepareStartGame(
          sessionId, player1Address, placeholderP2, p1Points, p1Points, signer
        );
        setExportedAuthEntryXDR(authEntryXDR);
        setSuccess('Auth entry signed! Share the URL or XDR with Player 2.');

        const poll = setInterval(async () => {
          try {
            const game = await clashService.getGame(sessionId);
            if (game) {
              clearInterval(poll);
              setGameState(game);
              setExportedAuthEntryXDR(null);
              setGamePhase('commit');
              onStandingsRefresh();
              setSuccess('Game started! Plan your 3-turn strategy.');
              setTimeout(() => setSuccess(null), 3000);
            }
          } catch { /* keep polling */ }
        }, 3000);
        setTimeout(() => clearInterval(poll), 300_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to prepare transaction');
      } finally { setLoading(false); }
    });
  };

  const handleImportTransaction = async () => {
    await runAction(async () => {
      try {
        setLoading(true); setError(null); setSuccess(null);
        if (!importAuthEntryXDR.trim()) throw new Error('Enter auth entry XDR from Player 1');
        if (!importPlayer2Points.trim()) throw new Error('Enter your points amount');
        const p2Points = parsePoints(importPlayer2Points);
        if (!p2Points || p2Points <= 0n) throw new Error('Invalid points amount');

        const gp = clashService.parseAuthEntry(importAuthEntryXDR.trim());
        if (gp.player1 === userAddress) throw new Error('Cannot play against yourself');
        setImportSessionId(gp.sessionId.toString());
        setImportPlayer1(gp.player1);
        setImportPlayer1Points((Number(gp.player1Points) / 10_000_000).toString());

        const signer = getContractSigner();
        const fullySignedTxXDR = await clashService.importAndSignAuthEntry(
          importAuthEntryXDR.trim(), userAddress, p2Points, signer
        );
        await clashService.finalizeStartGame(fullySignedTxXDR, userAddress, signer);

        setSessionId(gp.sessionId);
        setGamePhase('commit');
        setImportAuthEntryXDR(''); setImportSessionId(''); setImportPlayer1('');
        setImportPlayer1Points(''); setImportPlayer2Points(DEFAULT_POINTS);
        await loadGameState();
        onStandingsRefresh();
        setSuccess('Game started! Plan your 3-turn strategy.');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import transaction');
      } finally { setLoading(false); }
    });
  };

  const handleLoadGame = async () => {
    await runAction(async () => {
      try {
        setLoading(true); setError(null); setSuccess(null);
        const sid = parseInt(loadSessionId.trim());
        if (isNaN(sid) || sid <= 0) throw new Error('Enter a valid session ID');

        const game = await requestCache.dedupe(
          createCacheKey('clash-game', sid),
          () => clashService.getGame(sid),
          5000
        );
        if (!game) throw new Error('Game not found');

        const p1 = game.player1.toString();
        const p2 = game.player2.toString();
        if (p1 !== userAddress && p2 !== userAddress) throw new Error('You are not a player in this game');

        setSessionId(sid); setGameState(game); setLoadSessionId('');

        if (game.has_battle_result) {
          setGamePhase('complete');
          const pb = await clashService.getGamePlayback(sid);
          if (pb) setGamePlayback(pb);
        } else if (game.player1_commitment?.has_revealed && game.player2_commitment?.has_revealed) {
          setGamePhase('resolve');
        } else if (game.has_player1_commitment && game.has_player2_commitment) {
          setGamePhase('reveal');
        } else {
          setGamePhase('commit');
        }
        setSuccess('Game loaded!');
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally { setLoading(false); }
    });
  };

  const handleQuickStart = async () => {
    await runAction(async () => {
      try {
        setQuickstartLoading(true); setError(null); setSuccess(null);
        if (walletType !== 'dev') throw new Error('Quickstart only works with dev wallets');
        if (!DevWalletService.isDevModeAvailable() ||
            !DevWalletService.isPlayerAvailable(1) ||
            !DevWalletService.isPlayerAvailable(2)) {
          throw new Error('Quickstart requires both dev wallets. Run "bun run setup"');
        }
        const p1Points = parsePoints(player1Points);
        if (!p1Points || p1Points <= 0n) throw new Error('Enter a valid points amount');

        const originalPlayer = devWalletService.getCurrentPlayer();
        let p1Addr = '', p2Addr = '';
        let p1Signer: ReturnType<typeof devWalletService.getSigner> | null = null;
        let p2Signer: ReturnType<typeof devWalletService.getSigner> | null = null;

        try {
          await devWalletService.initPlayer(1);
          p1Addr = devWalletService.getPublicKey(); p1Signer = devWalletService.getSigner();
          await devWalletService.initPlayer(2);
          p2Addr = devWalletService.getPublicKey(); p2Signer = devWalletService.getSigner();
        } finally {
          if (originalPlayer) await devWalletService.initPlayer(originalPlayer);
        }
        if (!p1Signer || !p2Signer) throw new Error('Failed to init dev signers');
        if (p1Addr === p2Addr) throw new Error('Quickstart requires two different dev wallets');

        const qsid = createRandomSessionId();
        setSessionId(qsid); setPlayer1Address(p1Addr);

        const placeholder = await getFundedSimulationSourceAddress([p1Addr, p2Addr]);
        const authXDR   = await clashService.prepareStartGame(qsid, p1Addr, placeholder, p1Points, p1Points, p1Signer);
        const signedXDR = await clashService.importAndSignAuthEntry(authXDR, p2Addr, p1Points, p2Signer);
        await clashService.finalizeStartGame(signedXDR, p2Addr, p2Signer);

        try { const game = await clashService.getGame(qsid); if (game) setGameState(game); } catch { /* ok */ }
        setGamePhase('commit');
        onStandingsRefresh();
        setSuccess('Quickstart complete! Plan your strategy.');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Quickstart failed');
      } finally { setQuickstartLoading(false); }
    });
  };

  const handleCommitMoves = async () => {
    const allFilled = selectedMoves.every(m => m.attack !== null && m.defense !== null);
    if (!allFilled) { setError('Select an attack AND defense for all 3 turns.'); return; }

    await runAction(async () => {
      try {
        setLoading(true); setError(null);
        setSuccess('Generating ZK proof… (~5–10s)');

        const attacks  = selectedMoves.map(m => m.attack!)  as [number, number, number];
        const defenses = selectedMoves.map(m => m.defense!) as [number, number, number];

        const proofResult = await noirService.current.generateClashProof(
          'duel_commit_circuit',
          { attacks, defenses, playerAddress: userAddress, sessionId }
        );
        console.log('[commit] Proof generated in', proofResult.proofTime + 's');
        console.log('[commit] Commitment hash:', proofResult.commitmentHash);

        const signer = getContractSigner();
        await clashService.commitMoves(
          sessionId,
          userAddress,
          toBuffer(proofResult.publicInputs),
          toBuffer(proofResult.proofBytes),
          signer
        );

        savePublicInputs(sessionId, userAddress, proofResult.publicInputs);
        setStoredPublicInputs(proofResult.publicInputs);
        setHasCommitted(true);
        setGamePhase('waiting_reveal');
        setSuccess('Moves committed! Waiting for opponent…');
        await loadGameState();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('[commit] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to commit moves');
      } finally { setLoading(false); }
    });
  };

  const handleRevealMoves = async () => {
    if (!storedPublicInputs) {
      setError('No commitment found. You must commit moves from this same browser tab — refreshing or switching devices loses the stored public inputs needed for reveal.');
      return;
    }

    await runAction(async () => {
      try {
        setLoading(true); setError(null); setSuccess(null);

        const contractMoves = toContractMoves(selectedMoves);
        const signer = getContractSigner();
        await clashService.revealMoves(
          sessionId,
          userAddress,
          toBuffer(storedPublicInputs),
          contractMoves,
          signer
        );

        clearPublicInputs(sessionId, userAddress);
        setHasRevealed(true);
        setSuccess('Moves revealed! Waiting for opponent or resolve…');
        await loadGameState();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('[reveal] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to reveal moves');
      } finally { setLoading(false); }
    });
  };

  const handleResolveBattle = async () => {
    await runAction(async () => {
      try {
        setLoading(true); setError(null); setSuccess(null);

        const signer = getContractSigner();
        const result = await clashService.resolveBattle(sessionId, signer, userAddress);
        console.log('[resolve] Result:', result);

        const pb = await clashService.getGamePlayback(sessionId);
        if (pb) setGamePlayback(pb);

        await loadGameState();
        setGamePhase('complete');
        onStandingsRefresh();

        const winnerAddr = result?.winner?.toString() ?? '';
        setSuccess(winnerAddr === userAddress ? '🏆 You won!' : 'Battle resolved. Better luck next time!');
      } catch (err) {
        console.error('[resolve] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to resolve battle');
      } finally { setLoading(false); }
    });
  };

  const copyAuthEntry = async () => {
    if (!exportedAuthEntryXDR) return;
    await navigator.clipboard.writeText(exportedAuthEntryXDR);
    setAuthEntryCopied(true); setTimeout(() => setAuthEntryCopied(false), 2000);
  };

  const copyShareUrlWithAuth = async () => {
    if (!exportedAuthEntryXDR) return;
    const params = new URLSearchParams({ game: 'clash', auth: exportedAuthEntryXDR });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    await navigator.clipboard.writeText(url);
    setShareUrlCopied(true); setTimeout(() => setShareUrlCopied(false), 2000);
  };

  const copyShareUrlWithSession = async () => {
    const url = `${window.location.origin}${window.location.pathname}?game=clash&session-id=${loadSessionId}`;
    await navigator.clipboard.writeText(url);
    setShareUrlCopied(true); setTimeout(() => setShareUrlCopied(false), 2000);
  };

  // Card selection handler — passed down to CardSelectionModal
  const handleCardSelect = (turn: number, type: 'attack' | 'defense', cardId: number) => {
    const newMoves = [...selectedMoves];
    if (type === 'attack') {
      newMoves[turn].attack = cardId;
    } else {
      newMoves[turn].defense = cardId;
    }
    setSelectedMoves(newMoves);
    saveSelectedMoves(sessionId, userAddress, newMoves);
    setCardSelectionMode(null);
  };

  // ─── Derived values ──────────────────────────────────────────

  const isPlayer1 = gameState && gameState.player1.toString() === userAddress;
  const isPlayer2 = gameState && gameState.player2.toString() === userAddress;
  const p1committed = gameState?.has_player1_commitment ?? false;
  const p2committed = gameState?.has_player2_commitment ?? false;
  const p1revealed  = gameState?.player1_commitment?.has_revealed ?? false;
  const p2revealed  = gameState?.player2_commitment?.has_revealed ?? false;
  const myPlayerCommitted = isPlayer1 ? p1committed : isPlayer2 ? p2committed : false;
  const myPlayerRevealed  = isPlayer1 ? p1revealed  : isPlayer2 ? p2revealed  : false;
  const bothRevealed      = p1revealed && p2revealed;

  const winnerAddr = gameState?.has_battle_result
    ? (gameState.battle_result?.winner?.toString() ?? null)
    : null;
  const iWon = winnerAddr === userAddress;

  const movesAllFilled = selectedMoves.every(m => m.attack !== null && m.defense !== null);


  if (isMobile) {
      return (
        <div className="desktop-required-overlay">
          <div className="desktop-required-card">
            <div className="desktop-icon">🖥️</div>
            <h2>Desktop Required</h2>
            <p>
              Clash Pirates is designed for a cinematic desktop experience.
              Please switch to a laptop or desktop browser to play.
            </p>
            <div className="desktop-hint">
              ⚔️ Full animations • 🎬 Cinematic playback • 🎮 Better controls
            </div>
          </div>
        </div>
      );
    }

  // ═══════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="clash-game-container">
      <PhaseHeader phase={gamePhase} sessionId={sessionId} />

      {error   && <AlertBanner type="error"   message={error}   />}
      {/* {success && <AlertBanner type="success" message={success} />} */}

      {/* CREATE PHASE */}
      {gamePhase === 'create' && (
        <CreateGamePanel
          createMode={createMode}
          setCreateMode={mode => {
            setCreateMode(mode);
            setExportedAuthEntryXDR(null);
            if (mode !== 'import') { setImportAuthEntryXDR(''); setImportSessionId(''); setImportPlayer1(''); setImportPlayer1Points(''); setImportPlayer2Points(DEFAULT_POINTS); }
            if (mode !== 'load')   setLoadSessionId('');
          }}
          player1Address={player1Address}
          setPlayer1Address={setPlayer1Address}
          player1Points={player1Points}
          setPlayer1Points={setPlayer1Points}
          availablePoints={availablePoints}
          sessionId={sessionId}
          exportedAuthEntryXDR={exportedAuthEntryXDR}
          authEntryCopied={authEntryCopied}
          shareUrlCopied={shareUrlCopied}
          onPrepareTransaction={handlePrepareTransaction}
          onCopyAuthEntry={copyAuthEntry}
          onCopyShareUrl={copyShareUrlWithAuth}
          importAuthEntryXDR={importAuthEntryXDR}
          setImportAuthEntryXDR={setImportAuthEntryXDR}
          importSessionId={importSessionId}
          importPlayer1={importPlayer1}
          importPlayer1Points={importPlayer1Points}
          importPlayer2Points={importPlayer2Points}
          setImportPlayer2Points={setImportPlayer2Points}
          xdrParsing={xdrParsing}
          xdrParseError={xdrParseError}
          xdrParseSuccess={xdrParseSuccess}
          userAddress={userAddress}
          onImportTransaction={handleImportTransaction}
          loadSessionId={loadSessionId}
          setLoadSessionId={setLoadSessionId}
          onLoadGame={handleLoadGame}
          onCopyLoadShareUrl={copyShareUrlWithSession}
          quickstartAvailable={quickstartAvailable}
          quickstartLoading={quickstartLoading}
          onQuickStart={handleQuickStart}
          loading={loading}
          isBusy={isBusy}
        />
      )}

      {/* COMMIT PHASE */}
      {gamePhase === 'commit' && gameState && (
        <div className="commit-phase-container">
          <div className="player-status-row">
            <PlayerStatusCard label="Player 1" address={gameState.player1.toString()} points={gameState.player1_points as bigint} isYou={!!isPlayer1} committed={p1committed} revealed={p1revealed} />
            <PlayerStatusCard label="Player 2" address={gameState.player2.toString()} points={gameState.player2_points as bigint} isYou={!!isPlayer2} committed={p2committed} revealed={p2revealed} />
          </div>

          {!myPlayerCommitted ? (
            <>
              <div className="strategy-instruction">
                <p className="instruction-title">🔒 Secret Strategy — opponent won't see this until both reveal</p>
                <p className="instruction-text">
                  Select your cards for each turn. A ZK proof locks in your commitment
                  without revealing your moves. <strong>Stay on this tab until you reveal!</strong>
                </p>
              </div>

              <div className="turn-slots-container">
                {[0, 1, 2].map(turnIndex => (
                  <TurnSlot
                    key={turnIndex}
                    turnNumber={turnIndex + 1}
                    attackId={selectedMoves[turnIndex].attack}
                    defenseId={selectedMoves[turnIndex].defense}
                    onSelectAttack={() => setCardSelectionMode({ turn: turnIndex, type: 'attack' })}
                    onSelectDefense={() => setCardSelectionMode({ turn: turnIndex, type: 'defense' })}
                    isLocked={false}
                  />
                ))}
              </div>

              {movesAllFilled && (
                <div className="battle-plan-summary">
                  <h3>📜 YOUR BATTLE PLAN</h3>
                  {selectedMoves.map((move, i) => (
                    <div key={i} className="plan-row">
                      <span>Turn {i + 1}:</span>
                      <span>{ATTACK_CARDS[move.attack! as Attack].emoji} {ATTACK_CARDS[move.attack! as Attack].name}</span>
                      <span>vs</span>
                      <span>{DEFENSE_CARDS[move.defense! as Defense].emoji} {DEFENSE_CARDS[move.defense! as Defense].name}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleCommitMoves}
                disabled={isBusy || !movesAllFilled}
                className="commit-button"
              >
                {loading ? '⚙️ Forging Cryptographic Seal...' : '🔒 Seal Your Fate (ZK Commit)'}
              </button>

              <CardSelectionModal
                cardSelectionMode={cardSelectionMode}
                onClose={() => setCardSelectionMode(null)}
                onSelect={handleCardSelect}
              />
            </>
          ) : (
            <div className="committed-state">
              <p className="committed-title">✓ Strategy Committed!</p>
              <p className="committed-text">Your moves are locked on-chain. Waiting for opponent...</p>
              <div className="locked-turns">
                {[0, 1, 2].map(turnIndex => (
                  <TurnSlot
                    key={turnIndex}
                    turnNumber={turnIndex + 1}
                    attackId={selectedMoves[turnIndex].attack}
                    defenseId={selectedMoves[turnIndex].defense}
                    onSelectAttack={() => {}}
                    onSelectDefense={() => {}}
                    isLocked={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* WAITING PHASE */}
      {gamePhase === 'waiting_reveal' && gameState && (
        <div className="waiting-phase">
          <div className="player-status-row">
            <PlayerStatusCard label="Player 1" address={gameState.player1.toString()} points={gameState.player1_points as bigint} isYou={!!isPlayer1} committed={p1committed} revealed={p1revealed} />
            <PlayerStatusCard label="Player 2" address={gameState.player2.toString()} points={gameState.player2_points as bigint} isYou={!!isPlayer2} committed={p2committed} revealed={p2revealed} />
          </div>
          <div className="waiting-indicator">
            <div className="hourglass">⏳</div>
            <p>Waiting for opponent to commit...</p>
          </div>
        </div>
      )}

      {/* REVEAL PHASE */}
      {gamePhase === 'reveal' && gameState && (
        <div className="reveal-phase">
          <div className="player-status-row">
            <PlayerStatusCard label="Player 1" address={gameState.player1.toString()} points={gameState.player1_points as bigint} isYou={!!isPlayer1} committed={p1committed} revealed={p1revealed} />
            <PlayerStatusCard label="Player 2" address={gameState.player2.toString()} points={gameState.player2_points as bigint} isYou={!!isPlayer2} committed={p2committed} revealed={p2revealed} />
          </div>

          <div className="reveal-instruction">
            <p>⚡ Both committed — time to reveal!</p>
          </div>

          {!myPlayerRevealed ? (
            <>
              <div className="locked-turns">
                {[0, 1, 2].map(turnIndex => (
                  <TurnSlot
                    key={turnIndex}
                    turnNumber={turnIndex + 1}
                    attackId={selectedMoves[turnIndex].attack}
                    defenseId={selectedMoves[turnIndex].defense}
                    onSelectAttack={() => {}}
                    onSelectDefense={() => {}}
                    isLocked={true}
                  />
                ))}
              </div>
              {storedPublicInputs ? (
                <button onClick={handleRevealMoves} disabled={isBusy} className="reveal-button">
                  {loading ? '🔓 Revealing...' : '🔓 Reveal My Arsenal'}
                </button>
              ) : (
                <AlertBanner type="warning" message="⚠️ No commitment found. Must reveal from same tab." />
              )}
            </>
          ) : (
            <div className="revealed-waiting">
              <p className='text-white'>✓ Moves revealed! Waiting for opponent...</p>
            </div>
          )}

          {bothRevealed && (
            <button onClick={handleResolveBattle} disabled={isBusy} className="resolve-button">
              {loading ? 'Resolving...' : '⚔️ Resolve Battle!'}
            </button>
          )}
        </div>
      )}

      {/* RESOLVE PHASE */}
      {gamePhase === 'resolve' && gameState && (
        <div className="resolve-phase">
          <div className="resolve-announcement">
            <div className="swords-icon">⚔️</div>
            <h3 className='text-white'>Both players revealed!</h3>
            <p className='text-white'>Either player can trigger the resolution.</p>
            <button onClick={handleResolveBattle} disabled={isBusy} className="resolve-button-main">
              {loading ? 'Resolving...' : '⚔️ Resolve Battle!'}
            </button>
          </div>
        </div>
      )}

      {/* COMPLETE PHASE */}
      {gamePhase === 'complete' && gameState && (
        <div className="complete-phase">
          {/* <div className={`victory-banner ${iWon ? 'winner' : 'loser'}`}>
            <div className="banner-icon">{iWon ? '🏆' : '💀'}</div>
            <h3>{iWon ? 'VICTORY!' : "SENT TO DAVY JONES' LOCKER"}</h3>
            {winnerAddr && (
              <p className="winner-address">
                Winner: {winnerAddr.slice(0, 8)}…{winnerAddr.slice(-4)}
              </p>
            )}
          </div> */}

          {gamePlayback && !isPlayingCinematic && (
            <div className="playback-options">
              <button
                className="watch-cinematic-btn"
                onClick={() => {
                  setIsPlayingCinematic(true);
                  setCurrentCinematicTurn(0);
                }}
              >
                ⚡ Watch Battle Unfold
              </button>
              {/* <button
                className="skip-to-results-btn"
                onClick={() => setIsPlayingCinematic(false)}
              >
                ⏩ Skip to Results
              </button> */}

              <button
                className="skip-to-results-btn"
                onClick={handleStartNewGame}
              >
               ⚔️ Challenge Another Pirate
              </button>
            </div>
          )}

         <div>

          {isPlayingCinematic && gamePlayback && (
            <CinematicBattlePlayback
              gamePlayback={gamePlayback}
              currentCinematicTurn={currentCinematicTurn}
              setCurrentCinematicTurn={setCurrentCinematicTurn}
              setIsPlayingCinematic={setIsPlayingCinematic}
              userAddress={userAddress}
            />
          )}

          {/* <button onClick={handleStartNewGame} className="new-game-button">
            ⚔️ Challenge Another Pirate
          </button> */}
         </div>

          {gamePlayback && !isPlayingCinematic && (
            <PirateStoryBox 
              gamePlayback={gamePlayback} 
              userAddress={userAddress}
            />
          )}

        </div>
      )}
    </div>
  );
}