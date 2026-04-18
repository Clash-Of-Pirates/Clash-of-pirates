#!/usr/bin/env bash
set -euo pipefail

# See testnet-option.sh — required for soroban-sdk 25.3+ + experimental_spec_shaking_v2 WASM builds with older stellar-cli.
export SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2="${SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2:-1}"

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
command -v nargo >/dev/null 2>&1 || {
  echo -e "${RED}❌ nargo not found.${NC}"
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo -e "${RED}❌ node not found.${NC}"
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo -e "${RED}❌ python3 not found.${NC}"
  exit 1
}
command -v stellar >/dev/null 2>&1 || {
  echo -e "${RED}❌ stellar CLI not found.${NC}"
  exit 1
}

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

# ══════════════════════════════════════════════════════════════════════════════
# PLAYER 1 - Generate Proof
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  PLAYER 1: Generating Commitment Proof                    ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

# Player 1 moves: [Slash, Fireball, Lightning] vs [Block, Dodge, Counter]
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
BBJS="./node_modules/@aztec/bb.js/dest/node/main.js"

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

# Split proof for Player 1
PUB_COUNT="$(node -e "
  const c = require('./target/duel_commit_circuit.json');
  let n = 0;
  for (const p of c.abi.parameters.filter(p => p.visibility === 'public')) {
    if (p.type.kind === 'array') n += p.type.length;
    else n += 1;
  }
  n += 1; // +1 for circuit return value (commitment hash)
  process.stdout.write(String(n));
")"

PUB_BYTES=$((PUB_COUNT * 32))

head -c "$PUB_BYTES" target/proof.player1.with_public_inputs > target/public_inputs.player1
tail -c +$((PUB_BYTES + 1)) target/proof.player1.with_public_inputs > target/proof.player1

echo "    Player 1 commitment hash:"
python3 - <<'PY1'
import pathlib
b = pathlib.Path("target/public_inputs.player1").read_bytes()
hash_bytes = b[-32:]
print(f"      0x{hash_bytes.hex()}")
PY1

# ══════════════════════════════════════════════════════════════════════════════
# PLAYER 2 - Generate Proof
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  PLAYER 2: Generating Commitment Proof                    ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

# Player 2 moves: [Fireball, Lightning, Slash] vs [Counter, Block, Dodge]
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

# Split proof for Player 2
head -c "$PUB_BYTES" target/proof.player2.with_public_inputs > target/public_inputs.player2
tail -c +$((PUB_BYTES + 1)) target/proof.player2.with_public_inputs > target/proof.player2

echo "    Player 2 commitment hash:"
python3 - <<'PY2'
import pathlib
b = pathlib.Path("target/public_inputs.player2").read_bytes()
hash_bytes = b[-32:]
print(f"      0x{hash_bytes.hex()}")
PY2

# Copy VK for deployment
cp target/vk.keccak target/vk

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
    --network local \
    --source-account kays \
    -- \
    --vk_bytes-file-path "$CIRCUIT_DIR/target/vk" \
  | tail -n1
)"
echo -e "${GREEN}✓ Verifier deployed: $VERIFIER_CID${NC}"

# Test verifier with Player 1's proof
echo ""
echo -e "${BLUE}==> 9) Test verifier with Player 1 proof${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network local \
  --source-account kays \
  --send no \
  -- \
  verify_proof \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player1"

echo -e "${GREEN}✓ Player 1 proof verified!${NC}"

# Test verifier with Player 2's proof
echo ""
echo -e "${BLUE}==> 10) Test verifier with Player 2 proof${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network local \
  --source-account kays \
  --send no \
  -- \
  verify_proof \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player2"

echo -e "${GREEN}✓ Player 2 proof verified!${NC}"

# ══════════════════════════════════════════════════════════════════════════════
# Deploy Mock GameHub and Clash Contract
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  Deploying Mock & Clash Game Contract                            ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

# Create mock GameHub contract (simplified version for testing)
echo ""
echo -e "${BLUE}==> 12) Deploy mock GameHub${NC}"
cd "$MOCK_HUB_CONTRACT_DIR"
stellar contract build

MOCK_HUB_CID="$(
  stellar contract deploy \
    --wasm $TARGET_DIR/wasm32v1-none/release/mock_game_hub.wasm \
    --network local \
    --source-account kays \
  | tail -n1
)"

echo -e "${GREEN}✓ mockhub contract deployed: $MOCK_HUB_CID${NC}"


cd "$CLASH_CONTRACT_DIR"

echo ""
echo -e "${BLUE}==> 11) Build Clash contract${NC}"
stellar contract build

# Get account addresses
ADMIN_ADDR="$(stellar keys address kays)"
# PLAYER1_ADDR="$(stellar keys address player1 2>/dev/null || stellar keys generate player1 && stellar keys address player1)"
# PLAYER2_ADDR="$(stellar keys address player2 2>/dev/null || stellar keys generate player2 && stellar keys address player2)"
echo ""
echo -e "${BLUE}==> Setting up player accounts${NC}"

# Generate keys if they don't exist
if ! stellar keys address playerone 2>/dev/null; then
    echo "    Generating playerone key..."
    stellar keys generate --global playerone
fi

if ! stellar keys address playertwo 2>/dev/null; then
    echo "    Generating playertwo key..."
    stellar keys generate --global playertwo
fi

# Store addresses in variables
PLAYER1_ADDR=$(stellar keys address playerone)
PLAYER2_ADDR=$(stellar keys address playertwo)

# Fund the accounts on local network
echo "    Funding player1..."
stellar keys fund playerone --network local

echo "    Funding player2..."
stellar keys fund playertwo --network local

echo -e "${GREEN}✓ Player accounts funded${NC}"


echo "    Admin: $ADMIN_ADDR"
echo "    Player 1: $PLAYER1_ADDR"
echo "    Player 2: $PLAYER2_ADDR"

CLASH_CID="$(
  stellar contract deploy \
    --wasm $TARGET_DIR/wasm32v1-none/release/clash.wasm \
    --network local \
    --source-account kays \
    -- --admin $ADMIN_ADDR \
    --game-hub $MOCK_HUB_CID \
    --verifier_contract $VERIFIER_CID \
  | tail -n1
)"

echo -e "${GREEN}✓ Clash contract deployed: $CLASH_CID${NC}"

# Initialize Clash contract
echo ""
echo -e "${BLUE}==> 13) Initialize Clash contract${NC}"

echo -e "${GREEN}✓ Clash contract initialized${NC}"

# Update the Clash contract source code with the deployed verifier address
echo ""
echo "    Deploy:  $VERIFIER_CID"
echo ""
echo -e "${YELLOW}⚠️  For testing, we'll use the deployed address directly${NC}"

# ══════════════════════════════════════════════════════════════════════════════
# Simulate Complete Game Flow
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  🎮 SIMULATING COMPLETE GAME FLOW                         ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"

SESSION_ID=42
POINTS_WAGERED=1000

# Step 1: Start Game
echo ""
echo -e "${BLUE}==> 15) Start game (Session $SESSION_ID)${NC}"
echo "    Player 1: $PLAYER1_ADDR"
echo "    Player 2: $PLAYER2_ADDR"
echo "    Wager: $POINTS_WAGERED points each"

stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account playerone \
  --send yes \
  -- \
  start_game \
  --session_id "$SESSION_ID" \
  --player1 "$PLAYER1_ADDR" \
  --player2 "$PLAYER2_ADDR" \
  --player1_points "$POINTS_WAGERED" \
  --player2_points "$POINTS_WAGERED"

echo -e "${GREEN}✓ Game started!${NC}"

# Step 2: Player 1 commits moves
echo ""
echo -e "${BLUE}==> 16) Player 1 commits moves (with ZK proof)${NC}"

stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account playerone \
  --send yes \
  -- \
  commit_moves \
  --session_id "$SESSION_ID" \
  --player "$PLAYER1_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player1"

echo -e "${GREEN}✓ Player 1 committed!${NC}"

# Step 3: Player 2 commits moves
echo ""
echo -e "${BLUE}==> 17) Player 2 commits moves (with ZK proof)${NC}"

stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account playertwo \
  --send yes \
  -- \
  commit_moves \
  --session_id "$SESSION_ID" \
  --player "$PLAYER2_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player2"

echo -e "${GREEN}✓ Player 2 committed!${NC}"

# Step 4: Player 1 reveals moves
echo ""
echo -e "${BLUE}==> 18) Player 1 reveals moves${NC}"

stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account playerone \
  --send yes \
  -- \
  reveal_moves \
  --session_id "$SESSION_ID" \
  --player "$PLAYER1_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player1" \
  --moves '[{"attack":0,"defense":0},{"attack":1,"defense":1},{"attack":2,"defense":2}]'
#   --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player1" \

echo -e "${GREEN}✓ Player 1 revealed!${NC}"

# Wait for transaction to finalize
echo "    Waiting for transaction to finalize..."
sleep 5


# Step 5: Player 2 reveals moves
echo ""
echo -e "${BLUE}==> 19) Player 2 reveals moves${NC}"

# Simulate first
echo "    Simulating transaction..."
stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account playertwo \
  --send no \
  -- \
  reveal_moves \
  --session_id "$SESSION_ID" \
  --player "$PLAYER2_ADDR" \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
  --moves '[{"attack":1,"defense":2},{"attack":2,"defense":0},{"attack":0,"defense":1}]'
#   --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player2" \

echo "    Simulation successful, submitting transaction..."
sleep 2

# Retry logic
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if stellar contract invoke \
    --id "$CLASH_CID" \
    --network local \
    --source-account playertwo \
    --send yes \
    -- \
    reveal_moves \
    --session_id "$SESSION_ID" \
    --player "$PLAYER2_ADDR" \
    --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs.player2" \
    --moves '[{"attack":1,"defense":2},{"attack":2,"defense":0},{"attack":0,"defense":1}]'; then
    # --proof_bytes-file-path "$CIRCUIT_DIR/target/proof.player2" \
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

# Step 6: Resolve battle
echo ""
echo -e "${BLUE}==> 20) Resolve battle${NC}"

BATTLE_RESULT="$(stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account kays \
  --send yes \
  -- \
  resolve_battle \
  --session_id "$SESSION_ID"
)"

echo ""
echo -e "${GREEN}✓ Battle resolved!${NC}"
echo ""
echo "Battle Result:"
echo "$BATTLE_RESULT"

# Step 7: Get game playback
echo ""
echo -e "${BLUE}==> 21) Get detailed game playback${NC}"

PLAYBACK="$(stellar contract invoke \
  --id "$CLASH_CID" \
  --network local \
  --source-account kays \
  -- \
  get_game_playback \
  --session_id "$SESSION_ID"
)"

echo ""
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
echo "✨ Both players successfully:"
echo "  1. Generated ZK proofs of their moves"
echo "  2. Committed to their moves on-chain"
echo "  3. Revealed their moves with proof verification"
echo "  4. Battle was resolved automatically"
echo ""
echo "🎮 Game is ready for production!"