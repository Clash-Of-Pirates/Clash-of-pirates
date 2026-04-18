# oz-smart-account-bindings (TypeScript)

TypeScript client for the OpenZeppelin smart-account Soroban contract. Network and contract metadata are in [`src/index.ts`](./src/index.ts) under `networks`.

## Regenerate bindings

```bash
soroban contract bindings ts \
  --rpc-url INSERT_RPC_URL_HERE \
  --network-passphrase "INSERT_NETWORK_PASSPHRASE_HERE" \
  --contract-id INSERT_CONTRACT_ID_HERE \
  --output-dir ./path/to/oz-smart-account-bindings
```

## Local package

This folder is consumed via `file:./packages/oz-smart-account-bindings` in the app `package.json`.
