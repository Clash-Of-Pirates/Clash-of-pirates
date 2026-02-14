#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CIRCUIT_DIR="$ROOT/duel_commit_circuit"
CONTRACT_DIR="$ROOT/contracts/rs-soroban-ultrahonk"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔨 Building & Deploying Clash Contract"
echo "========================================"

# ── Dependency checks ────────────────────────────────────────────────────────
command -v nargo >/dev/null 2>&1 || {
  echo -e "${RED}❌ nargo not found.${NC}"
  echo "   curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash"
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

# ── Step 1: Navigate to circuit directory ────────────────────────────────────
echo ""
echo -e "${BLUE}==> 1) cd $CIRCUIT_DIR${NC}"
cd "$CIRCUIT_DIR"

# ── Step 2: Build circuit + witness ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 2) Build circuit + witness${NC}"
npm i -D @aztec/bb.js@0.87.0 source-map-support
nargo compile
nargo execute
echo -e "${GREEN}✓ Circuit compiled and witness generated${NC}"

# ── Step 3: Generate UltraHonk (keccak) VK + proof ───────────────────────────
echo ""
echo -e "${BLUE}==> 3) Generate UltraHonk (keccak) VK + proof${NC}"
BBJS="./node_modules/@aztec/bb.js/dest/node/main.js"

node "$BBJS" write_vk_ultra_keccak_honk \
  -b ./target/duel_commit_circuit.json \
  -o ./target/vk.keccak

node "$BBJS" prove_ultra_keccak_honk \
  -b ./target/duel_commit_circuit.json \
  -w ./target/duel_commit_circuit.gz \
  -o ./target/proof.with_public_inputs

echo -e "${GREEN}✓ VK and proof generated${NC}"

# ── Step 4: Split proof into public_inputs + proof bytes ─────────────────────
echo ""
echo -e "${BLUE}==> 4) Split proof into public_inputs + proof bytes${NC}"

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

# Split the proof: first PUB_BYTES go to public_inputs, rest goes to proof
head -c "$PUB_BYTES" target/proof.with_public_inputs > target/public_inputs
tail -c +$((PUB_BYTES + 1)) target/proof.with_public_inputs > target/proof

# Copy VK for contract deployment
cp target/vk.keccak target/vk

echo "    PUB_COUNT=$PUB_COUNT"
echo "    PUB_BYTES=$PUB_BYTES"
echo -e "${GREEN}✓ Proof split complete${NC}"

# ── Optional sanity check ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==> Optional sanity check (public inputs)${NC}"
python3 - <<'PY'
import pathlib, sys
b = pathlib.Path("target/public_inputs").read_bytes()
print("public_inputs_len:", len(b), "bytes")
if len(b) == 0:
    print("ERROR: public_inputs is empty!")
    sys.exit(1)
labels = ["player_address", "session_id", "commitment_hash"]
for i in range(0, len(b), 32):
    chunk = b[i:i+32]
    label = labels[i//32] if i//32 < len(labels) else f"field[{i//32}]"
    print(f"  {label} = 0x{chunk.hex()}")
PY

# ── Step 5: Build + deploy contract ──────────────────────────────────────────
echo ""
echo -e "${BLUE}==> 5) cd $CONTRACT_DIR${NC}"
cd "$CONTRACT_DIR"

echo ""
echo -e "${BLUE}==> Build + deploy contract with VK bytes${NC}"
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

# ── Step 6: Verify proof on-chain (simulation) ───────────────────────────────
echo ""
echo -e "${BLUE}==> 6) Verify proof (simulation, --send no)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network local \
  --source-account kays \
  --send no \
  -- \
  verify_proof \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof"

echo -e "${GREEN}✓ Simulation passed${NC}"

# ── Step 7: Verify proof on-chain (send) ─────────────────────────────────────
echo ""
echo -e "${BLUE}==> 7) Verify proof on-chain (--send yes)${NC}"
stellar contract invoke \
  --id "$VERIFIER_CID" \
  --network local \
  --source-account kays \
  --send yes \
  -- \
  verify_proof \
  --public_inputs-file-path "$CIRCUIT_DIR/target/public_inputs" \
  --proof_bytes-file-path "$CIRCUIT_DIR/target/proof"

echo -e "${GREEN}✓ On-chain verification succeeded${NC}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ All steps completed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "📄 VK:            $CIRCUIT_DIR/target/vk"
echo "📄 public_inputs: $CIRCUIT_DIR/target/public_inputs"
echo "📄 proof:         $CIRCUIT_DIR/target/proof"
echo "🔗 Verifier:      $VERIFIER_CID"