import './HowToPlay.css';

type Props = {
  onBack: () => void;
};

export function HowToPlay({ onBack }: Props) {
  return (
    <div className="howto-page">
      <header className="howto-header">
        <button type="button" className="howto-back" onClick={onBack}>
          ← BACK TO ARENA
        </button>
        <h1 className="howto-title">📜 HOW TO PLAY</h1>
      </header>

      <p className="howto-lead">
        Clash is a three-round Soroban duel where your plan is hidden until both captains commit. Read the flow below,
        learn the move triangle, and stack combos when the coast is clear.
      </p>

      <section className="howto-section" aria-labelledby="howto-flow">
        <h2 id="howto-flow" className="howto-h2">
          Duel flow
        </h2>
        <ol className="howto-steps">
          <li>
            <strong>Challenge</strong> — agree on a points wager with your opponent.
          </li>
          <li>
            <strong>Plan three rounds</strong> — each round you pick one attack and one defense.
          </li>
          <li>
            <strong>Commit with proof</strong> — a zero-knowledge proof locks in your plan without revealing it.
          </li>
          <li>
            <strong>Both commit</strong> — neither side can see the other&apos;s moves beforehand.
          </li>
          <li>
            <strong>Reveal</strong> — moves are published and verified on-chain.
          </li>
          <li>
            <strong>Playback</strong> — the arena runs a cinematic round-by-round fight.
          </li>
          <li>
            <strong>Settle</strong> — the winner takes the pot; points may update on the leaderboard when configured.
          </li>
        </ol>
      </section>

      <section className="howto-section" aria-labelledby="howto-combat">
        <h2 id="howto-combat" className="howto-h2">
          Combat: attacks &amp; defenses
        </h2>
        <p className="howto-p">
          Everyone starts at <strong>100 HP</strong>. Each attack deals its base damage unless the defender plays the{' '}
          <strong>one</strong> defense that fully stops it (0 damage). Any other defense fails — you eat full damage.
        </p>

        <div className="howto-table-wrap">
          <table className="howto-table">
            <caption className="howto-caption">
              Attacks
            </caption>
            <thead>
              <tr>
                <th scope="col">Move</th>
                <th scope="col">Icon</th>
                <th scope="col">Damage</th>
                <th scope="col">Stopped by</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cutlass Slash</td>
                <td>⚔️</td>
                <td>30</td>
                <td>Quick Sidestep (Dodge)</td>
              </tr>
              <tr>
                <td>Cannon Blast</td>
                <td>🔥</td>
                <td>40</td>
                <td>Riposte (Counter)</td>
              </tr>
              <tr>
                <td>Lightning Strike</td>
                <td>⚡</td>
                <td>35</td>
                <td>Raised Shield (Block)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="howto-table-wrap">
          <table className="howto-table">
            <caption className="howto-caption">
              Defenses
            </caption>
            <thead>
              <tr>
                <th scope="col">Move</th>
                <th scope="col">Icon</th>
                <th scope="col">Stops</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Raised Shield — Block</td>
                <td>🛡️</td>
                <td>Lightning Strike</td>
              </tr>
              <tr>
                <td>Quick Sidestep — Dodge</td>
                <td>🏃</td>
                <td>Cutlass Slash</td>
              </tr>
              <tr>
                <td>Riposte — Counter</td>
                <td>🔄</td>
                <td>Cannon Blast</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="howto-p howto-note">
          Example: if you Dodge but they Lightning Strike, Dodge does <strong>not</strong> stop lightning — you take 35.
        </p>
      </section>

      <section className="howto-section" aria-labelledby="howto-combo">
        <h2 id="howto-combo" className="howto-h2">
          Combo damage
        </h2>
        <p className="howto-p">
          Repeating the <strong>same attack</strong> in consecutive rounds adds bonus damage (still respect blocks):
        </p>
        <ul className="howto-bullets">
          <li>
            <strong>2 in a row:</strong> +10 damage on the second hit
          </li>
          <li>
            <strong>3 in a row:</strong> +25 damage on the third hit
          </li>
        </ul>
        <p className="howto-p">
          Example line (all unblocked): Lightning → Lightning → Lightning can reach <strong>35 → 45 → 60</strong> with
          full combo scaling.
        </p>
      </section>

      <section className="howto-section" aria-labelledby="howto-strategy">
        <h2 id="howto-strategy" className="howto-h2">
          Strategy tips
        </h2>
        <ul className="howto-bullets">
          <li>
            <strong>Risk vs reward:</strong> Cannon Blast hits hardest but is easier to shut down with Counter.
          </li>
          <li>
            <strong>Prediction:</strong> try to read their attack pattern across three rounds — commit phase hides it,
            so experience and mind-games matter.
          </li>
          <li>
            <strong>HP math:</strong> three big hits can end a fight; one wrong defense on a combo turn swings the duel.
          </li>
          <li>
            <strong>Mix-ups:</strong> pure combo lines are explosive but predictable; blending moves denies their perfect
            counters.
          </li>
        </ul>
      </section>

      <section className="howto-section" aria-labelledby="howto-cinematic">
        <h2 id="howto-cinematic" className="howto-h2">
          Cinematic playback
        </h2>
        <p className="howto-p">
          After reveal, the client plays a round-by-round scene: turn titles, card reveals, damage or BLOCKED floats,
          pirate reactions, and a victory or defeat banner. Use it to review exactly how each exchange resolved.
        </p>
      </section>

      <section className="howto-section howto-section--zk" aria-labelledby="howto-fair">
        <h2 id="howto-fair" className="howto-h2">
          Fair play
        </h2>
        <p className="howto-p">
          Commitments are enforced by a verifier contract: you cannot change picks after committing, and the proof
          does not leak your moves until you choose to reveal.
        </p>
      </section>
    </div>
  );
}
