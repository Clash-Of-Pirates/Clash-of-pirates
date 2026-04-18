import { useEffect, useState } from 'react';
import {
  getTxFeedSnapshot,
  subscribeTxFeed,
  updateTxFeedEntry,
  type OnChainTxEntry,
} from '@/utils/onChainTxFeed';
import { pollTransactionMeta } from '@/utils/sorobanTxMeta';
import { NETWORK } from '@/utils/constants';
import './OnChainTxPanel.css';

function stroopsToXlmString(stroops: string | null): string {
  if (stroops == null || stroops === '') return '—';
  try {
    const n = BigInt(stroops);
    const whole = n / 10_000_000n;
    const frac = n % 10_000_000n;
    if (frac === 0n) return `${whole} XLM`;
    const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
    return `${whole}.${fracStr} XLM`;
  } catch {
    return '—';
  }
}

function statusLabel(e: OnChainTxEntry): string {
  if (e.source === 'local') return 'Synced';
  switch (e.status) {
    case 'submitting':
      return 'Submitting';
    case 'pending':
      return 'Confirming…';
    case 'success':
      return 'Included';
    case 'failed':
      return 'Failed';
    case 'not_found':
      return 'Unknown';
    default:
      return e.status;
  }
}

function explorerTxUrl(hash: string): string {
  const net = NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

export function OnChainTxPanel() {
  const [rows, setRows] = useState<OnChainTxEntry[]>(getTxFeedSnapshot);

  useEffect(() => subscribeTxFeed(() => setRows(getTxFeedSnapshot())), []);

  useEffect(() => {
    const tick = async () => {
      const list = getTxFeedSnapshot();
      for (const e of list) {
        if (e.source !== 'chain' || e.hash == null || e.status !== 'pending') continue;
        try {
          const m = await pollTransactionMeta(e.hash);
          if (m.status === 'pending') continue;
          updateTxFeedEntry(e.hash, {
            status: m.status,
            feeStroops: m.feeStroops,
            ledger: m.ledger,
          });
        } catch {
          /* RPC hiccup — retry next tick */
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="onchain-tx-panel" aria-label="On-chain transactions">
      <div className="onchain-tx-panel__header">
        <span className="onchain-tx-panel__title">On-chain activity</span>
        <span className="onchain-tx-panel__hint">Chain + session sync</span>
      </div>
      <ul className="onchain-tx-panel__list">
        {rows.length === 0 ? (
          <li className="onchain-tx-panel__empty">No transactions yet</li>
        ) : (
          rows.map((e) => (
            <li key={e.id} className="onchain-tx-panel__row">
              <div className="onchain-tx-panel__row-top">
                <span className="onchain-tx-panel__label">{e.label}</span>
                <span
                  className={`onchain-tx-panel__status onchain-tx-panel__status--${e.source === 'local' ? 'local' : e.status}`}
                >
                  {statusLabel(e)}
                </span>
              </div>
              {e.detail && <div className="onchain-tx-panel__detail">{e.detail}</div>}
              <div className="onchain-tx-panel__row-meta">
                <span
                  className="onchain-tx-panel__fee"
                  title={
                    e.source === 'local'
                      ? 'No transaction — loaded game state via RPC'
                      : 'Max fee (stroops) authorized by this transaction'
                  }
                >
                  Fee: {e.source === 'local' ? '—' : stroopsToXlmString(e.feeStroops)}
                </span>
                {e.ledger != null && (
                  <span className="onchain-tx-panel__ledger">Ldg {e.ledger}</span>
                )}
              </div>
              {e.hash ? (
                <a
                  className="onchain-tx-panel__hash"
                  href={explorerTxUrl(e.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {e.hash.slice(0, 10)}…{e.hash.slice(-6)}
                </a>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
