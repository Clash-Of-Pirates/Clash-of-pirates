/**
 * Bundled defaults from repo-root `deployment.bundle.json` (committed).
 * Gitignored `deployment.json` from `bun run deploy` is not imported (would break CI);
 * production uses VITE_* / runtime config. Optional local `deployment.json` can be merged
 * by copying values into env or regenerating this stub if you need bundled IDs.
 */
import rootDeployment from '../../../deployment.bundle.json';

export type RootDeployment = {
  contracts?: Record<string, string>;
  rpcUrl?: string;
  networkPassphrase?: string;
};

export const ROOT_DEPLOYMENT = rootDeployment as RootDeployment;
