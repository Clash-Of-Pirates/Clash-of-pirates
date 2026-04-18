/**
 * Shared app config (env + bundled deployment.json + runtime inject).
 */

import {
  getAllContractIds,
  getContractId,
  NETWORK_PASSPHRASE,
  RPC_URL,
} from './utils/constants';

export const config = {
  rpcUrl: RPC_URL,
  networkPassphrase: NETWORK_PASSPHRASE,
  contractIds: getAllContractIds(),

  // Backwards-compatible aliases for built-in games
  mockGameHubId: getContractId('mock-game-hub'),
  twentyOneId: getContractId('twenty-one'),
  clashId: getContractId('clash'),
  diceDuelId: getContractId('dice-duel'),

  devPlayer1Address: import.meta.env.VITE_DEV_PLAYER1_ADDRESS || '',
  devPlayer2Address: import.meta.env.VITE_DEV_PLAYER2_ADDRESS || '',
};

if (Object.keys(config.contractIds).length === 0) {
  console.warn('Contract IDs not configured. Run `bun run setup` from the repo root.');
}
