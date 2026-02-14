/**
 * rpcClient.ts
 * 
 * Centralized RPC client creation with automatic allowHttp support
 * Import and use this helper anywhere you need to create an RPC server
 */

import { rpc } from '@stellar/stellar-sdk';

// Type alias for convenience
type SorobanRpcServer = rpc.Server;

/**
 * Create a properly configured Soroban RPC Server instance
 * Automatically handles allowHttp for local development
 * 
 * @param rpcUrl - Optional RPC URL, defaults to RPC_URL from constants
 * @returns Configured rpc.Server instance
 */
export function createSorobanRpcServer(rpcUrl?: string): rpc.Server {
  const url = rpcUrl || import.meta.env.VITE_SOROBAN_RPC_URL || 'http://localhost:8000/soroban/rpc';
  
  return new rpc.Server(url, {
    allowHttp: url.startsWith('http://'),
  });
}

/**
 * Singleton RPC server instance
 * Use this for read-only operations throughout your app
 */
let defaultServerInstance: rpc.Server | null = null;

export function getDefaultRpcServer(): rpc.Server {
  if (!defaultServerInstance) {
    defaultServerInstance = createSorobanRpcServer();
  }
  return defaultServerInstance;
}

/**
 * Reset the default server instance (useful for testing or config changes)
 */
export function resetDefaultRpcServer(): void {
  defaultServerInstance = null;
}

// Export types for convenience
export type { SorobanRpcServer };
export { rpc };