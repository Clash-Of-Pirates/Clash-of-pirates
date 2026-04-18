#!/usr/bin/env bash
# Build OpenZeppelin stellar-accounts WASM (crate: contracts/oz-smart-account), print SHA-256
# hash for VITE_ACCOUNT_WASM_HASH, optionally upload to the network.
#
# Docs: https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account
#
# Usage:
#   ./scripts/build-oz-smart-account-wasm.sh              # build + hash + regen TS bindings (clash-frontend/packages/...)
#   ./scripts/build-oz-smart-account-wasm.sh --patch-env  # also set VITE_ACCOUNT_WASM_HASH in repo-root .env
#   STELLAR_ACCOUNT=alice ./scripts/build-oz-smart-account-wasm.sh --upload   # install wasm on-chain (needs funded key)
#
# Requires: cargo, node, npm (optional: stellar CLI — if missing, WASM still builds but bindings are not regenerated)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2="${SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2:-1}"

WASM_REL="target/wasm32v1-none/release/oz_smart_account.wasm"
WASM_ABS="$ROOT/$WASM_REL"
PATCH_ENV=false
UPLOAD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --patch-env) PATCH_ENV=true; shift ;;
    --upload)    UPLOAD=true; shift ;;
    -h|--help)
      cat <<'EOF'
Build OpenZeppelin stellar-accounts WASM and print VITE_ACCOUNT_WASM_HASH (SHA-256 hex).

  ./scripts/build-oz-smart-account-wasm.sh
  ./scripts/build-oz-smart-account-wasm.sh --patch-env
  STELLAR_ACCOUNT=alice ./scripts/build-oz-smart-account-wasm.sh --upload
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v cargo >/dev/null 2>&1 || { echo "cargo not found" >&2; exit 1; }

echo "==> Building oz-smart-account (OpenZeppelin stellar-accounts ${STELLAR_ACCOUNTS_VERSION:-0.7.1})"
(cd "$ROOT" && cargo build -p oz-smart-account --release --target wasm32v1-none)

if [[ ! -f "$WASM_ABS" ]]; then
  echo "Expected WASM at $WASM_ABS" >&2
  exit 1
fi

BINDINGS_DIR="$ROOT/clash-frontend/packages/oz-smart-account-bindings"
if command -v stellar >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  echo "==> Regenerating smart-account-kit-bindings (TypeScript from WASM)"
  stellar contract bindings typescript --wasm "$WASM_ABS" --output-dir "$BINDINGS_DIR" --overwrite
  node "$ROOT/scripts/patch-smart-account-bindings-package.cjs" "$BINDINGS_DIR/package.json"
  (cd "$BINDINGS_DIR" && npm install --no-audit --no-fund)
else
  echo "⚠️  stellar and/or node not in PATH — skipped TS bindings regen. Install stellar-cli to keep bindings in sync." >&2
fi

# SHA-256 hex (lowercase) — same convention as Stellar / smart-account-kit env examples
if command -v shasum >/dev/null 2>&1; then
  HASH="$(shasum -a 256 "$WASM_ABS" | awk '{print $1}')"
else
  HASH="$(sha256sum "$WASM_ABS" | awk '{print $1}')"
fi

echo ""
echo "WASM: $WASM_ABS"
echo "Bytes: $(wc -c < "$WASM_ABS" | tr -d ' ')"
echo ""
echo "VITE_ACCOUNT_WASM_HASH=$HASH"
echo ""

if $PATCH_ENV; then
  ENV_FILE="$ROOT/.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "No $ENV_FILE — creating with VITE_ACCOUNT_WASM_HASH only (add RPC etc. yourself)" >&2
    echo "VITE_ACCOUNT_WASM_HASH=$HASH" >"$ENV_FILE"
  elif grep -q '^VITE_ACCOUNT_WASM_HASH=' "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname)" == Darwin ]]; then
      sed -i '' "s/^VITE_ACCOUNT_WASM_HASH=.*/VITE_ACCOUNT_WASM_HASH=$HASH/" "$ENV_FILE"
    else
      sed -i "s/^VITE_ACCOUNT_WASM_HASH=.*/VITE_ACCOUNT_WASM_HASH=$HASH/" "$ENV_FILE"
    fi
    echo "Patched VITE_ACCOUNT_WASM_HASH in $ENV_FILE"
  else
    echo "" >>"$ENV_FILE"
    echo "VITE_ACCOUNT_WASM_HASH=$HASH" >>"$ENV_FILE"
    echo "Appended VITE_ACCOUNT_WASM_HASH to $ENV_FILE"
  fi
fi

if $UPLOAD; then
  command -v stellar >/dev/null 2>&1 || { echo "stellar CLI not found; install stellar-cli" >&2; exit 1; }
  SRC="${STELLAR_ACCOUNT:-}"
  if [[ -z "$SRC" ]]; then
    echo "For --upload set STELLAR_ACCOUNT (or passkey identity name) for --source-account" >&2
    exit 1
  fi
  RPC="${STELLAR_RPC_URL:-${VITE_SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}}"
  NET="${STELLAR_NETWORK_PASSPHRASE:-${VITE_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}}"
  echo "==> stellar contract upload (install WASM on ledger)"
  stellar contract upload \
    --source-account "$SRC" \
    --wasm "$WASM_ABS" \
    --rpc-url "$RPC" \
    --network-passphrase "$NET"
  echo ""
  echo "Upload complete. Use the printed wasm hash above for VITE_ACCOUNT_WASM_HASH (should match local SHA-256)."
fi
