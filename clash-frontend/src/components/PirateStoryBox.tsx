/**
 * PirateStoryBox.tsx
 */

import React from 'react';
import type { GamePlayback, DetailedTurnResult } from '@/games/clash/bindings';
import { Attack, Defense } from '@/games/clash/bindings';

const ATTACK_NAMES = {
  [Attack.Slash]: 'Cutlass Slash',
  [Attack.Fireball]: 'Cannon Blast',
  [Attack.Lightning]: 'Lightning Strike',
};

const DEFENSE_NAMES = {
  [Defense.Block]: 'Raised Shield',
  [Defense.Dodge]: 'Quick Sidestep',
  [Defense.Counter]: 'Riposte',
};

// Pirate narrative flavors
const TURN_INTROS = [
  "⚓ The battle begins as the ships close in...",
  "🌊 The tide turns as both captains steel themselves...",
  "⚡ In the final clash, desperation fills the air...",
];

const DAMAGE_PHRASES = [
  "strikes true, dealing",
  "connects with devastating force, inflicting",
  "lands a solid hit for",
  "tears through defenses, causing",
  "finds its mark, delivering",
];

const BLOCK_PHRASES = [
  "but it's deflected by a well-timed",
  "only to be thwarted by a masterful",
  "yet is countered expertly with a",
  "but the defender's swift",
  "though a precise",
];

const SURVIVE_PHRASES = [
  "stands firm with",
  "remains standing at",
  "holds steady with",
  "endures, left with",
  "weathers the storm, maintaining",
];

const getRandomPhrase = (phrases: string[]) => {
  return phrases[Math.floor(Math.random() * phrases.length)];
};

interface PirateStoryBoxProps {
  gamePlayback: GamePlayback;
  userAddress: string;
}

export function PirateStoryBox({ gamePlayback, userAddress }: PirateStoryBoxProps) {
  const isPlayer1 = gamePlayback.player1.toString() === userAddress;
  const player1Name = "Captain Redbeard";
  const player2Name = "Captain Blackwater";
  
  const winnerAddress = gamePlayback.winner?.toString();
  const isPlayer1Winner = winnerAddress === gamePlayback.player1.toString();
  const isPlayer2Winner = winnerAddress === gamePlayback.player2.toString();
  
  return (
    <div className="pirate-story-scroll">
      <div className="scroll-header">
        <div className="scroll-seal">🏴‍☠️</div>
        <h3 className="scroll-title">The Tale of Battle</h3>
        <div className="scroll-subtitle">As recorded in the Captain's Log</div>
      </div>

      <div className="story-content">
        {gamePlayback.turn_results.map((turn, idx) => {
          const p1Attack = ATTACK_NAMES[Number(turn.player1_move.attack) as Attack];
          const p1Defense = DEFENSE_NAMES[Number(turn.player1_move.defense) as Defense];
          const p2Attack = ATTACK_NAMES[Number(turn.player2_move.attack) as Attack];
          const p2Defense = DEFENSE_NAMES[Number(turn.player2_move.defense) as Defense];
          
          const p1DamageDealt = Number(turn.player1_damage_dealt);
          const p2DamageDealt = Number(turn.player2_damage_dealt);
          const p1HP = Number(turn.player1_hp_remaining);
          const p2HP = Number(turn.player2_hp_remaining);

          return (
            <div key={idx} className="story-chapter">
              <div className="chapter-header">
                <span className="chapter-number">Round {Number(turn.turn) + 1}</span>
                <span className="chapter-ornament">⚔</span>
              </div>
              
              <div className="chapter-intro">{TURN_INTROS[idx]}</div>

              <div className="battle-narrative">
                {/* Player 1's Attack */}
                <div className="narrative-block">
                  <span className="narrator-icon">🗡️</span>
                  <p className="narrative-text">
                    <strong className="captain-name">{player1Name}</strong> unleashes a{' '}
                    <span className="move-name">{p1Attack}</span>
                    {p2DamageDealt > 0 ? (
                      <>
                        {' '}{getRandomPhrase(DAMAGE_PHRASES)}{' '}
                        <span className="damage-dealt">{p2DamageDealt} damage</span>!{' '}
                        <strong className="captain-name">{player2Name}</strong>{' '}
                        {getRandomPhrase(SURVIVE_PHRASES)}{' '}
                        <span className="hp-remaining">{p2HP} HP</span>.
                      </>
                    ) : (
                      <>
                        , {getRandomPhrase(BLOCK_PHRASES)}{' '}
                        <span className="move-name">{p2Defense}</span> from{' '}
                        <strong className="captain-name">{player2Name}</strong>!{' '}
                        <span className="block-success">No damage dealt!</span>
                      </>
                    )}
                  </p>
                </div>

                {/* Player 2's Attack */}
                <div className="narrative-block">
                  <span className="narrator-icon">💥</span>
                  <p className="narrative-text">
                    In retaliation, <strong className="captain-name">{player2Name}</strong> strikes with a{' '}
                    <span className="move-name">{p2Attack}</span>
                    {p1DamageDealt > 0 ? (
                      <>
                        , {getRandomPhrase(DAMAGE_PHRASES)}{' '}
                        <span className="damage-dealt">{p1DamageDealt} damage</span>!{' '}
                        <strong className="captain-name">{player1Name}</strong>{' '}
                        {getRandomPhrase(SURVIVE_PHRASES)}{' '}
                        <span className="hp-remaining">{p1HP} HP</span>.
                      </>
                    ) : (
                      <>
                        , {getRandomPhrase(BLOCK_PHRASES)}{' '}
                        <span className="move-name">{p1Defense}</span> from{' '}
                        <strong className="captain-name">{player1Name}</strong>!{' '}
                        <span className="block-success">The attack is rebuffed!</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="chapter-summary">
                <div className="summary-hp">
                  <div className="hp-bar-container">
                    <span className="captain-label">{player1Name}</span>
                    <div className="story-hp-bar">
                      <div 
                        className="story-hp-fill red-crew"
                        style={{ width: `${(p1HP / 100) * 100}%` }}
                      >
                        <span className="hp-text">{p1HP}</span>
                      </div>
                    </div>
                  </div>
                  <div className="vs-divider-small">⚓</div>
                  <div className="hp-bar-container">
                    <span className="captain-label">{player2Name}</span>
                    <div className="story-hp-bar">
                      <div 
                        className="story-hp-fill blue-crew"
                        style={{ width: `${(p2HP / 100) * 100}%` }}
                      >
                        <span className="hp-text">{p2HP}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Final Outcome */}
        <div className="story-epilogue">
          <div className="epilogue-divider">
            <span>⚔ ⚔ ⚔</span>
          </div>
          <div className="epilogue-text">
            {isPlayer1Winner ? (
              <>
                <p className="outcome-main">
                  <strong className="victor-name">{player1Name}</strong> emerges victorious,{' '}
                  standing tall as the opponent's ship lists in the water.
                </p>
                <p className="outcome-flavor">
                  "Another day, another treasure!" roars the triumphant captain,{' '}
                  as their crew raises the Jolly Roger high.
                </p>
              </>
            ) : isPlayer2Winner ? (
              <>
                <p className="outcome-main">
                  <strong className="victor-name">{player2Name}</strong> claims the day,{' '}
                  their superior tactics leaving the enemy battered and broken.
                </p>
                <p className="outcome-flavor">
                  The victorious crew celebrates as their captain sheathes their blade,{' '}
                  another legend to tell in the taverns.
                </p>
              </>
            ) : (
              <>
                <p className="outcome-main">
                  Both captains stand exhausted, neither able to claim victory.{' '}
                  Honor is satisfied, and both crews live to sail another day.
                </p>
                <p className="outcome-flavor">
                  "Well fought," they nod to each other, mutual respect earned through steel and sweat.
                </p>
              </>
            )}
          </div>
          <div className="epilogue-signature">
            <span>— Recorded by the ship's scribe</span>
            <span className="signature-seal">🔱</span>
          </div>
        </div>
      </div>

      <div className="scroll-footer">
        <div className="scroll-aged-mark"></div>
      </div>
    </div>
  );
}