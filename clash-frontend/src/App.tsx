import { config } from './config';
import { Layout } from './components/Layout';
import { ClashGameArena } from './games/clash/ClashGameArena';

const GAME_TITLE = import.meta.env.VITE_GAME_TITLE || 'Clash';
const GAME_TAGLINE = import.meta.env.VITE_GAME_TAGLINE || 'On-chain game on Stellar';

export default function App() {
  const contractId = config.contractIds['clash'] || '';
  const hasContract = contractId && contractId !== 'YOUR_CONTRACT_ID';

  return (
    <Layout title={GAME_TITLE} subtitle={GAME_TAGLINE}>
      {!hasContract ? (
        <div className="arena-card">
          <h3>Contract Not Configured</h3>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '1rem' }}>
            Run <code>bun run setup</code> to deploy and configure testnet contract IDs, or set
            <code>VITE_CLASH_CONTRACT_ID</code> in the root <code>.env</code>.
          </p>
        </div>
      ) : (
        <ClashGameArena />
      )}
    </Layout>
  );
}
