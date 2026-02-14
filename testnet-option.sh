#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CIRCUIT_DIR="$ROOT/duel_commit_circuit"
CONTRACT_DIR="$ROOT/contracts/rs-soroban-ultrahonk"
CLASH_CONTRACT_DIR="$ROOT/contracts/clash"
MOCK_HUB_CONTRACT_DIR="$ROOT/contracts/mock-game-hub"
TARGET_DIR="$ROOT/target"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🎮 Building & Testing Complete Clash Game Flow"
echo "==============================================="

# ── Dependency checks ────────────────────────────────────────────────────────
command -v nargo   >/dev/null 2>&1 || { echo -e "${RED}❌ nargo not found.${NC}";   exit 1; }
command -v node    >/dev/null 2>&1 || { echo -e "${RED}❌ node not found.${NC}";    exit 1; }
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}❌ python3 not found.${NC}"; exit 1; }
command -v stellar >/dev/null 2>&1 || { echo -e "${RED}❌ stellar CLI not found.${NC}"; exit 1; }

echo "    nargo: $(nargo --version | head -1)"

# ── Step 0: Clean artifacts ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 0) Clean artifacts${NC}"
rm -rf "$CIRCUIT_DIR/target"
rm -rf "$CONTRACT_DIR/target"
rm -rf "$CLASH_CONTRACT_DIR/target" 2>/dev/null || true

# ── Step 1: Navigate to circuit directory ────────────────────────────────────
echo ""
echo -e "${BLUE}==> 1) cd $CIRCUIT_DIR${NC}"
cd "$CIRCUIT_DIR"

# ── Step 2: Install dependencies ─────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 2) Install bb.js${NC}"
npm i -D @aztec/bb.js@0.87.0 source-map-support

BBJS="./node_modules/@aztec/bb.js/dest/node/main.js"

# ══════════════════════════════════════════════════════════════════════════════
# PLAYER 1 - Generate Proof
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  PLAYER 1: Generating Commitment Proof                    ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

cat > Prover.toml <<'PLAYER1'
attacks = ["0", "1", "2"]
defenses = ["0", "1", "2"]
player_address = "0x0000000000000000000000000000000000000000000000000000000000000001"
session_id = "0x0000000000000000000000000000000000000000000000000000000000000042"
PLAYER1

echo "    Player 1 Moves:"
echo "      Turn 1: Slash (0) + Block (0)"
echo "      Turn 2: Fireball (1) + Dodge (1)"
echo "      Turn 3: Lightning (2) + Counter (2)"

echo ""
echo -e "${BLUE}==> 3) Compile circuit + execute witness (Player 1)${NC}"
nargo compile
nargo execute
echo -e "${GREEN}✓ Player 1 witness generated${NC}"

echo ""
echo -e "${BLUE}==> 4) Generate VK (first time only)${NC}"
if [ ! -f "./target/vk.keccak" ]; then
  node "$BBJS" write_vk_ultra_keccak_honk \
    -b ./target/duel_commit_circuit.json \
    -o ./target/vk.keccak
  echo -e "${GREEN}✓ VK generated${NC}"
else
  echo -e "${GREEN}✓ VK already exists${NC}"
fi

echo ""
echo -e "${BLUE}==> 5) Generate Player 1 proof${NC}"
node "$BBJS" prove_ultra_keccak_honk \
  -b ./target/duel_commit_circuit.json \
  -w ./target/duel_commit_circuit.gz \
  -o ./target/proof.player1.with_public_inputs
echo -e "${GREEN}✓ Player 1 proof generated${NC}"

# ── Split proof for Player 1 ─────────────────────────────────────────────────
PUB_COUNT="$(node -e "
  const c = require('./target/duel_commit_circuit.json');
  let n = 0;
  for (const p of c.abi.parameters.filter(p => p.visibility === 'public')) {
    if (p.type.kind === 'array') n += p.type.length;
    else n += 1;
  }
  n += 1; // return value (commitment hash)
  process.stdout.write(String(n));
")"
PUB_BYTES=$((PUB_COUNT * 32))

head -c "$PUB_BYTES"         target/proof.player1.with_public_inputs > target/public_inputs.player1
tail -c +$((PUB_BYTES + 1))  target/proof.player1.with_public_inputs > target/proof.player1

echo "    Player 1 commitment hash:"
python3 - <<'PY1'
import pathlib
b = pathlib.Path("target/public_inputs.player1").read_bytes()
print(f"      0x{b[-32:].hex()}")
PY1

# ══════════════════════════════════════════════════════════════════════════════
# PLAYER 2 - Generate Proof
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  PLAYER 2: Generating Commitment Proof                    ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

cat > Prover.toml <<'PLAYER2'
attacks = ["1", "2", "0"]
defenses = ["2", "0", "1"]
player_address = "0x0000000000000000000000000000000000000000000000000000000000000002"
session_id = "0x0000000000000000000000000000000000000000000000000000000000000042"
PLAYER2

echo "    Player 2 Moves:"
echo "      Turn 1: Fireball (1) + Counter (2)"
echo "      Turn 2: Lightning (2) + Block (0)"
echo "      Turn 3: Slash (0) + Dodge (1)"

echo ""
echo -e "${BLUE}==> 6) Execute witness (Player 2)${NC}"
nargo execute
echo -e "${GREEN}✓ Player 2 witness generated${NC}"

echo ""
echo -e "${BLUE}==> 7) Generate Player 2 proof${NC}"
node "$BBJS" prove_ultra_keccak_honk \
  -b ./target/duel_commit_circuit.json \
  -w ./target/duel_commit_circuit.gz \
  -o ./target/proof.player2.with_public_inputs
echo -e "${GREEN}✓ Player 2 proof generated${NC}"

head -c "$PUB_BYTES"         target/proof.player2.with_public_inputs > target/public_inputs.player2
tail -c +$((PUB_BYTES + 1))  target/proof.player2.with_public_inputs > target/proof.player2

echo "    Player 2 commitment hash:"
python3 - <<'PY2'
import pathlib
b = pathlib.Path("target/public_inputs.player2").read_bytes()
print(f"      0x{b[-32:].hex()}")
PY2

# Copy VK for deployment
cp target/vk.keccak target/vk

# ── Build and extract moves_raw bytes for the reveal attestation calls ───────
# moves_raw = 6 bytes: [atk0,atk1,atk2,def0,def1,def2]
# Written as binary files so --*-file-path can be used in the CLI.
python3 - <<'MOVESRAW'
import pathlib, struct

# Player 1: attacks=[0,1,2] defenses=[0,1,2]
raw1 = bytes([0,1,2, 0,1,2])
pathlib.Path("target/moves_raw.player1").write_bytes(raw1)

# Player 2: attacks=[1,2,0] defenses=[2,0,1]
raw2 = bytes([1,2,0, 2,0,1])
pathlib.Path("target/moves_raw.player2").write_bytes(raw2)

print("    moves_raw files written.")
MOVESRAW

# ══════════════════════════════════════════════════════════════════════════════
# Deploy UltraHonk Verifier Contract
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Deploying UltraHonk Verifier Contract                    ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

cd "$CONTRACT_DIR"

echo ""
echo -e "${BLUE}==> 8) Build UltraHonk verifier contract${NC}"
stellar contract build

VERIFIER_CID="$(
  stellar contract deploy \
    --wasm target/wasm32v1-none/release/rs_soroban_ultrahonk.wasm \
    --network testnet \
    --source-account kaysT \
    -- \
    --vk_bytes-file-path "$CIRCUIT_DIR/target/vk" \
  | tail -n1
)"
echo -e "${GREEN}✓ Verifier deployed: $VERIFIER_CID${NC}"

# ── Smoke-test: verify_proof still works standalone ──────────────────────────
# echo ""
# echo -e "${BLUE}==> 9) Smoke-test: verify_proof (Player 1) — no state written${NC}"
# stellar contract invoke \
#   --id "$VERIFIER_CID" \
#   --network testnet \
#   --source-account kaysT \
#   --send no \
#   -- \
#   verify_proof \
#   --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
#   --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player1"
# echo -e "${GREEN}✓ verify_proof smoke-test passed${NC}"

# echo ""
# echo -e "${BLUE}==> 10) Smoke-test: verify_proof (Player 2)${NC}"
# stellar contract invoke \
#   --id "$VERIFIER_CID" \
#   --network testnet \
#   --source-account kaysT \
#   --send no \
#   -- \
#   verify_proof \
#   --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
#   --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player2"
# echo -e "${GREEN}✓ verify_proof smoke-test passed${NC}"

# ══════════════════════════════════════════════════════════════════════════════
# Deploy Mock GameHub and Clash Contract
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Deploying Mock GameHub & Clash Game Contract             ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${BLUE}==> 11) Deploy mock GameHub${NC}"
cd "$MOCK_HUB_CONTRACT_DIR"
stellar contract build

MOCK_HUB_CID="$(
  stellar contract deploy \
    --wasm $TARGET_DIR/wasm32v1-none/release/mock_game_hub.wasm \
    --network testnet \
    --source-account kaysT \
  | tail -n1
)"
echo -e "${GREEN}✓ Mock hub deployed: $MOCK_HUB_CID${NC}"

echo ""
echo -e "${BLUE}==> 12) Build Clash contract${NC}"
cd "$CLASH_CONTRACT_DIR"
stellar contract build

echo ""
echo -e "${BLUE}==> 13) Set up player accounts${NC}"
if ! stellar keys address playerone 2>/dev/null; then
  stellar keys generate --global playerone
fi
if ! stellar keys address playertwo 2>/dev/null; then
  stellar keys generate --global playertwo
fi

ADMIN_ADDR="$(stellar keys address kaysT)"
PLAYER1_ADDR="$(stellar keys address playerone)"
PLAYER2_ADDR="$(stellar keys address playertwo)"

stellar keys fund playerone --network testnet
stellar keys fund playertwo --network testnet
echo -e "${GREEN}✓ Player accounts funded${NC}"
echo "    Admin:    $ADMIN_ADDR"
echo "    Player 1: $PLAYER1_ADDR"
echo "    Player 2: $PLAYER2_ADDR"

CLASH_CID="$(
  stellar contract deploy \
    --wasm $TARGET_DIR/wasm32v1-none/release/clash.wasm \
    --network testnet \
    --source-account kaysT \
    -- \
    --admin "$ADMIN_ADDR" \
    --game-hub "$MOCK_HUB_CID" \
    --verifier_contract "$VERIFIER_CID" \
  | tail -n1
)"
echo -e "${GREEN}✓ Clash contract deployed: $CLASH_CID${NC}"

# ══════════════════════════════════════════════════════════════════════════════
# Complete Game Flow
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  🎮 SIMULATING COMPLETE GAME FLOW                         ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

SESSION_ID=42
POINTS_WAGERED=1000

# ── Start Game ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 14) Start game (Session $SESSION_ID)${NC}"
stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account playerone \
  --send yes \
  -- \
  start_game \
  --session_id    "$SESSION_ID" \
  --player1       "$PLAYER1_ADDR" \
  --player2       "$PLAYER2_ADDR" \
  --player1_points "$POINTS_WAGERED" \
  --player2_points "$POINTS_WAGERED"
echo -e "${GREEN}✓ Game started!${NC}"

# ============================================================================
# COMMIT PHASE
# Each player does TWO transactions:
#   Tx A  →  verifier::verify_and_attest_commit  (expensive — all the crypto)
#   Tx B  →  clash::commit_moves                 (cheap — reads attestation)
# ============================================================================

# ── Player 1: Tx A — attest commit ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 15a) Player 1: verify_and_attest_commit (Tx A — ZK verification)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network testnet \
  --source-account playerone \
  --send yes \
  -- \
  verify_and_attest_commit \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player1"
echo -e "${GREEN}✓ Player 1 commit attestation written${NC}"

# ── Player 1: Tx B — commit moves ───────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 15b) Player 1: commit_moves (Tx B — reads attestation, no crypto)${NC}"
stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account playerone \
  --send yes \
  -- \
  commit_moves \
  --session_id              "$SESSION_ID" \
  --player                  "$PLAYER1_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player1"
echo -e "${GREEN}✓ Player 1 committed!${NC}"

# ── Player 2: Tx A — attest commit ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 16a) Player 2: verify_and_attest_commit (Tx A — ZK verification)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network testnet \
  --source-account playertwo \
  --send yes \
  -- \
  verify_and_attest_commit \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player2"
echo -e "${GREEN}✓ Player 2 commit attestation written${NC}"

# ── Player 2: Tx B — commit moves ───────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 16b) Player 2: commit_moves (Tx B — reads attestation, no crypto)${NC}"
stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account playertwo \
  --send yes \
  -- \
  commit_moves \
  --session_id              "$SESSION_ID" \
  --player                  "$PLAYER2_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player2"
echo -e "${GREEN}✓ Player 2 committed!${NC}"

# ============================================================================
# REVEAL PHASE
# Same pattern — two transactions per player:
#   Tx C  →  verifier::verify_and_attest_reveal  (expensive)
#   Tx D  →  clash::reveal_moves                 (cheap)
#
# verify_and_attest_reveal takes the same public_inputs + proof as commit,
# PLUS moves_raw (6 bytes: [atk0,atk1,atk2,def0,def1,def2]).
# ============================================================================

# ── Player 1: Tx C — attest reveal ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 17a) Player 1: verify_and_attest_reveal (Tx C — ZK verification)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network testnet \
  --source-account playerone \
  --send yes \
  -- \
  verify_and_attest_reveal \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player1" \
  --moves_raw-file-path     "$CIRCUIT_DIR/target/moves_raw.player1"
echo -e "${GREEN}✓ Player 1 reveal attestation written${NC}"

# ── Player 1: Tx D — reveal moves ───────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 17b) Player 1: reveal_moves (Tx D — reads attestation, no crypto)${NC}"
stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account playerone \
  --send yes \
  -- \
  reveal_moves \
  --session_id              "$SESSION_ID" \
  --player                  "$PLAYER1_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --moves '[{"attack":0,"defense":0},{"attack":1,"defense":1},{"attack":2,"defense":2}]'
echo -e "${GREEN}✓ Player 1 revealed!${NC}"

sleep 3

# ── Player 2: Tx C — attest reveal ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 18a) Player 2: verify_and_attest_reveal (Tx C — ZK verification)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network testnet \
  --source-account playertwo \
  --send yes \
  -- \
  verify_and_attest_reveal \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --proof_bytes-file-path   "$CIRCUIT_DIR/target/proof.player2" \
  --moves_raw-file-path     "$CIRCUIT_DIR/target/moves_raw.player2"
echo -e "${GREEN}✓ Player 2 reveal attestation written${NC}"

# ── Player 2: Tx D — reveal moves ───────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 18b) Player 2: reveal_moves (Tx D — reads attestation, no crypto)${NC}"

MAX_RETRIES=3
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if stellar contract invoke \
    --id "$CLASH_CID" \
    --network testnet \
    --source-account playertwo \
    --send yes \
    -- \
    reveal_moves \
    --session_id              "$SESSION_ID" \
    --player                  "$PLAYER2_ADDR" \
    --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
    --moves '[{"attack":1,"defense":2},{"attack":2,"defense":0},{"attack":0,"defense":1}]'; then
    echo -e "${GREEN}✓ Player 2 revealed!${NC}"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo -e "${YELLOW}⚠️  Retry $RETRY_COUNT/$MAX_RETRIES...${NC}"
      sleep 5
    else
      echo -e "${RED}❌ Failed after $MAX_RETRIES attempts${NC}"
      exit 1
    fi
  fi
done

# ── Resolve Battle ───────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 19) Resolve battle${NC}"
BATTLE_RESULT="$(stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account kaysT \
  --send yes \
  -- \
  resolve_battle \
  --session_id "$SESSION_ID"
)"
echo -e "${GREEN}✓ Battle resolved!${NC}"
echo ""
echo "Battle Result:"
echo "$BATTLE_RESULT"

# ── Game Playback ────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 20) Get detailed game playback${NC}"
PLAYBACK="$(stellar contract invoke \
  --id "$CLASH_CID" \
  --network testnet \
  --source-account kaysT \
  -- \
  get_game_playback \
  --session_id "$SESSION_ID"
)"
echo -e "${GREEN}✓ Game playback retrieved!${NC}"
echo ""
echo "Detailed Playback:"
echo "$PLAYBACK"

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ COMPLETE GAME FLOW TEST SUCCESSFUL!                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "📊 Summary:"
echo "  • UltraHonk Verifier: $VERIFIER_CID"
echo "  • Clash Contract:     $CLASH_CID"
echo "  • Session ID:         $SESSION_ID"
echo "  • Player 1:           $PLAYER1_ADDR"
echo "  • Player 2:           $PLAYER2_ADDR"
echo ""
echo "💡 Budget strategy:"
echo "  Each commit/reveal is split across 2 transactions:"
echo "  • Tx A/C → verifier::verify_and_attest_* (all crypto, ~95% budget)"
echo "  • Tx B/D → clash::commit_moves / reveal_moves (storage only, ~5% budget)"
echo ""
echo "🎮 Game is ready for production!"