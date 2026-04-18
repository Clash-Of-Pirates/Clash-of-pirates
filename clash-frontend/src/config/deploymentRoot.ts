/**
 * Bundled repo-root deployment.json (copy in sync with ../../deployment.json after deploy).
 * Lets `bun run setup` / env-less dev work when VITE_* vars are not set.
 */
import rootDeployment from '../../../deployment.json';

export type RootDeployment = {
  contracts?: Record<string, string>;
  rpcUrl?: string;
  networkPassphrase?: string;
};

export const ROOT_DEPLOYMENT = rootDeployment as RootDeployment;
