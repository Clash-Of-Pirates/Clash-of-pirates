/**
 * Copies the compiled Noir artifact that matches on-chain VK deployment
 * (duel_commit_circuit/target + testnet-option.sh write_vk_ultra_keccak_honk).
 * Run after: cd duel_commit_circuit && nargo compile
 */
import { copyFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clashFrontend = resolve(__dirname, '..');
const repoRoot = resolve(clashFrontend, '..');
const src = resolve(repoRoot, 'duel_commit_circuit/target/duel_commit_circuit.json');
const dst = resolve(clashFrontend, 'public/circuits/duel_commit_circuit.json');

if (!existsSync(src)) {
  console.warn(
    '[sync-duel-circuit] Skip: not found —',
    src,
    '\n  Compile first: cd duel_commit_circuit && nargo compile',
  );
  process.exit(0);
}

copyFileSync(src, dst);
const hash = createHash('sha256').update(readFileSync(dst)).digest('hex');
console.log('[sync-duel-circuit] OK → public/circuits/duel_commit_circuit.json');
console.log('[sync-duel-circuit] sha256:', hash);
