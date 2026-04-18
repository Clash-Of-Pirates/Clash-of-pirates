# points-tracker (TypeScript)

TypeScript client for the `points-tracker` Soroban contract on Stellar testnet. Contract ID and passphrase live in [`src/index.ts`](./src/index.ts) under `networks`.

## Regenerate bindings

From the repo root (adjust paths as needed):

```bash
soroban contract bindings ts \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  --contract-id CBGYEIOWGSY6TGM6BFGPEUKM37TKPXAEETDRYACHJKVHOBZRNBIUMD6S \
  --output-dir ./path/to/points-tracker
```

## Use

```js
import { Contract, networks } from "points-tracker";

const contract = new Contract({
  ...networks.testnet,
  rpcUrl: "https://soroban-testnet.stellar.org",
});
```
