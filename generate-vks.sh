#!/bin/bash

set -e

echo "🔨 Generating Verification Keys for Clash Contract"
echo "=================================================="

# Check dependencies
command -v nargo >/dev/null 2>&1 || { 
  echo "❌ nargo not found. Install Noir: curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash"
  exit 1
}

command -v bb >/dev/null 2>&1 || { 
  echo "❌ bb (Barretenberg) not found. Install from: https://github.com/AztecProtocol/aztec-packages"
  exit 1
}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Step 1: Compiling Commit Circuit${NC}"
echo "-----------------------------------"
cd duel_commit_circuit
nargo compile
echo -e "${GREEN}✓ Commit circuit compiled${NC}"

echo ""
echo -e "${BLUE}Step 2: Generating Commit VK${NC}"
echo "-----------------------------"
bb write_vk -b ./target/duel_commit_circuit.json -o ./target
echo -e "${GREEN}✓ Commit VK generated: duel_commit_circuit/target"

cd ..

echo ""
echo -e "${BLUE}Step 3: Compiling Reveal Circuit${NC}"
echo "-----------------------------------"
cd duel_reveal_circuit
nargo compile
echo -e "${GREEN}✓ Reveal circuit compiled${NC}"

echo ""
echo -e "${BLUE}Step 4: Generating Reveal VK${NC}"
echo "-----------------------------"
bb write_vk -b ./target/duel_reveal_circuit.json -o ./target
echo -e "${GREEN}✓ Reveal VK generated: duel_reveal_circuit_vk/target"

cd ..

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ Verification Keys Generated Successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "VK Locations:"
echo "  📄 duel_commit_circuit/target"
echo "  📄 duel_reveal_circuit/target"
echo ""
echo "Next: Run deployment script to deploy Clash contract"
echo ""