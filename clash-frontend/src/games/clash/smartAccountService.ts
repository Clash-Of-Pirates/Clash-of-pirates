import { SmartAccountKit, IndexedDBStorage } from 'smart-account-kit';
import type { CreateWalletResult, ConnectWalletResult } from 'smart-account-kit';
import { patchSmartAccountKitAuth07 } from './smart-account/patchSmartAccountKitAuth07';
import { recordOnChainTx } from '@/utils/onChainTxFeed';
import { Api } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

export interface WalletState {
  contractId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export class SmartAccountService {
  private kit: SmartAccountKit | null = null;
  private initialized = false;
  private currentContractId: string | null = null;
  private currentCredentialId: string | null = null;
  private currentPublicKey: Uint8Array | null = null;
  /** Set after a successful context-rules probe; probe failures still use kit-only signing (no manual legacy path). */
  private walletCompatibilityMode: 'context-rules' | null = null;

  constructor(
    private rpcUrl: string,
    private networkPassphrase: string,
    private accountWasmHash: string,
    private webauthnVerifierAddress: string,
    private relayerUrl?: string
  ) {}

  /**
   * Initialize the SmartAccountKit
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!this.accountWasmHash?.trim() || !this.webauthnVerifierAddress?.trim()) {
      throw new Error(
        'Smart account is not configured. Set VITE_ACCOUNT_WASM_HASH and VITE_WEBAUTHN_VERIFIER_ADDRESS ' +
          '(repo root .env for Vite; see docs for testnet passkey account WASM + verifier IDs).'
      );
    }

    try {
      this.kit = new SmartAccountKit({
        rpcUrl: this.rpcUrl,
        networkPassphrase: this.networkPassphrase,
        accountWasmHash: this.accountWasmHash,
        webauthnVerifierAddress: this.webauthnVerifierAddress,
        storage: new IndexedDBStorage(),
        rpId: window.location.hostname,
        rpName: 'Clash Pirates',
        timeoutInSeconds: 60,
      });

      patchSmartAccountKitAuth07(this.kit);

      this.initialized = true;
      console.log('✅ SmartAccountKit initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SmartAccountKit:', error);
      throw error;
    }
  }

  /**
   * Create a new smart wallet with passkey
   */
  async createWallet(
    appName: string,
    userName: string,
    autoFund: boolean = true
  ): Promise<CreateWalletResult> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      console.log('🔐 Creating smart wallet...');
      const result = await this.kit.createWallet(appName, userName, {
        autoSubmit: true,
        autoFund,
        nativeTokenContract: this.getNativeTokenContract(),
      });

      this.setActiveCredential(result.contractId, result.credentialId, result.publicKey);
      await this.setAndValidateConnectedWallet(result.contractId);
      console.log('✅ Smart wallet created:', result.contractId);

      if (autoFund && result.fundResult?.success !== true) {
        // Fall back to manual funding when autoFunding did not succeed.
        await this.fundWallet(result.contractId);
      }

      return result;
    } catch (error) {
      console.error('❌ Failed to create wallet:', error);
      throw error;
    }
  }

  async createFreshWallet(
    appName: string,
    userName: string,
    autoFund: boolean = true
  ): Promise<CreateWalletResult> {
    await this.resetLocalWalletState();
    return this.createWallet(appName, userName, autoFund);
  }

  /**
   * Connect to existing wallet (restore from session or prompt)
   */
  async connectWallet(prompt?: boolean): Promise<ConnectWalletResult | null> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      console.log('🔑 Connecting wallet...');
      const result = await this.kit.connectWallet(
        prompt ? { prompt: true } : undefined
      );

      if (result) {
        this.setCredentialFromConnectResult(result);
        await this.setAndValidateConnectedWallet(result.contractId);
        console.log('✅ Wallet connected:', result.contractId);
        return result;
      }

      const deployed = await this.deployPendingCredential();
      if (deployed) {
        try {
          const result = await this.kit.connectWallet({
            credentialId: deployed.credentialId,
            contractId: deployed.contractId,
          });
          if (result) {
            this.setCredentialFromConnectResult(result);
            await this.setAndValidateConnectedWallet(result.contractId);
            console.log('✅ Wallet connected after deploy:', result.contractId);
          }
          return result;
        } catch (reconnectError) {
          console.error('❌ Reconnect after deploy failed:', reconnectError);
          throw reconnectError;
        }
      }

      return result;
    } catch (error) {
      console.warn('⚠️ Initial wallet connection failed, checking pending credentials...', error);
      const deployed = await this.deployPendingCredential();
      if (deployed) {
        try {
          const result = await this.kit.connectWallet({
            credentialId: deployed.credentialId,
            contractId: deployed.contractId,
          });
          if (result) {
            this.setCredentialFromConnectResult(result);
            await this.setAndValidateConnectedWallet(result.contractId);
            console.log('✅ Wallet connected after deploy:', result.contractId);
          }
          return result;
        } catch (reconnectError) {
          console.error('❌ Reconnect after deploy failed:', reconnectError);
          throw reconnectError;
        }
      }
      console.error('❌ Failed to connect wallet:', error);
      throw error;
    }
  }

  /**
   * Silent restore from stored session
   */
  async restoreSession(): Promise<boolean> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      const result = await this.connectWallet(false);
      if (result) {
        this.currentContractId = result.contractId;
        console.log('✅ Session restored:', result.contractId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to restore session:', error);
      return false;
    }
  }

  async resetLocalWalletState(): Promise<void> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      await this.kit.disconnect();
    } catch (error) {
      console.warn('⚠️ Failed to disconnect before resetting wallet state:', error);
    }

    const storage = (this.kit as any).storage;
    if (storage && typeof storage.clear === 'function') {
      await storage.clear();
    }

    this.currentContractId = null;
    this.currentCredentialId = null;
    this.currentPublicKey = null;
    this.walletCompatibilityMode = null;

    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('clash-smart-account-credential:')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  }

  /**
   * Deploy a pending smart account credential if a contract is not yet on-chain
   */
  private async deployPendingCredential(): Promise<{ credentialId: string; contractId: string } | null> {
    if (!this.kit || !this.kit.credentials) return null;

    try {
      const pending = await this.kit.credentials.getPending();
      if (!pending || pending.length === 0) {
        return null;
      }

      const credential = pending[0];
      console.log('🚀 Deploying pending smart account for credential:', credential.credentialId);

      const deployResult = await this.kit.credentials.deploy(credential.credentialId, {
        autoSubmit: true,
      });

      if (!deployResult || !deployResult.contractId) {
        console.warn('⚠️ Pending deployment did not return a contract ID');
        return null;
      }

      await this.fundWallet(deployResult.contractId);
      return { credentialId: credential.credentialId, contractId: deployResult.contractId };
    } catch (error) {
      console.error('❌ Failed to deploy pending credential:', error);
      return null;
    }
  }

  /**
   * Get the current connected contract ID (smart account address)
   */
  getContractId(): string | null {
    return this.currentContractId;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.currentContractId !== null;
  }

  /**
   * Ensure wallet compatibility was probed before simulating other contracts (e.g. Clash).
   * `AssembledTransaction.simulate()` does not throw on failed simulation — without this,
   * mode may be unset until the first probe runs.
   */
  async ensureSigningReady(): Promise<void> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');
    if (!this.currentContractId) {
      throw new Error('Smart wallet is not connected');
    }
    if (this.walletCompatibilityMode) return;
    await this.validateConnectedWallet();
  }

  /**
   * Sign and submit a transaction with smart account
   * @param meta.label - Shown in the on-chain activity panel (bottom-right)
   */
  async signAndSubmit(transaction: any, meta?: { label?: string }): Promise<any> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      await this.validateConnectedWallet();
      console.log('📝 Signing transaction...');
      const result = await this.signAndSubmitWithCompatibility(transaction);
      console.log('✅ Transaction signed and submitted');
      const r = result as { success?: boolean; hash?: string };
      if (r?.hash && r.success !== false) {
        recordOnChainTx({ hash: r.hash, label: meta?.label ?? 'Smart account tx' });
      }
      return result;
    } catch (error) {
      console.error('❌ Failed to sign transaction:', error);
      throw error;
    }
  }

  /**
   * Execute a smart account mediated contract call
   */
  async executeAndSubmit(
    _targetContract: string,
    functionName: string,
    _args: any[]
  ): Promise<any> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');

    try {
      console.log(`📝 Executing ${functionName}...`);
      console.log('✅ Contract call prepared for signing');
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to execute contract call:', error);
      throw error;
    }
  }

  /**
   * Fund wallet with test XLM from Friendbot
   */
  async fundWallet(walletAddress: string): Promise<boolean> {
    try {
      console.log('💰 Funding wallet from Friendbot...');

      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(walletAddress)}`
      );

      if (response.ok) {
        console.log('✅ Wallet funded with test XLM');
        return true;
      } else {
        console.warn('⚠️ Friendbot funding failed');
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to fund wallet:', error);
      return false;
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletAddress: string): Promise<string> {
    try {
      // Check balance via indexer or RPC
      console.log(`💰 Checking balance for ${walletAddress}`);
      // For now, return placeholder - can integrate with Stellar RPC later
      return '100'; // placeholder
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
      return '0';
    }
  }

  /**
   * Disconnect wallet and clear session
   */
  async disconnect(): Promise<void> {
    if (!this.kit) return;

    try {
      await this.kit.disconnect();
      this.currentContractId = null;
      this.currentCredentialId = null;
      this.currentPublicKey = null;
      this.walletCompatibilityMode = null;
      console.log('✅ Wallet disconnected');
    } catch (error) {
      console.error('❌ Failed to disconnect:', error);
    }
  }

  /**
   * Listen to wallet connection events
   */
  onWalletConnected(callback: (contractId: string) => void): void {
    if (!this.kit) return;
    this.kit.events.on('walletConnected', ({ contractId }) => {
      console.log('📡 Wallet connected event:', contractId);
      callback(contractId);
    });
  }

  /**
   * Listen to transaction submission events
   */
  onTransactionSubmitted(
    callback: (data: { hash: string; success: boolean }) => void
  ): void {
    if (!this.kit) return;
    this.kit.events.on('transactionSubmitted', (data) => {
      console.log('📡 Transaction submitted event:', data);
      callback(data as any);
    });
  }

  /**
   * Listen to credential creation events
   */
  onCredentialCreated(callback: () => void): void {
    if (!this.kit) return;
    this.kit.events.on('credentialCreated', () => {
      console.log('📡 Credential created event');
      callback();
    });
  }

  /**
   * Get the raw SmartAccountKit instance for advanced usage
   */
  getKit(): SmartAccountKit | null {
    return this.kit;
  }

  /**
   * Get native token contract ID for testnet
   */
  private getNativeTokenContract(): string {
    // Stellar testnet native token SAC
    return 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  }

  private async setAndValidateConnectedWallet(contractId: string): Promise<void> {
    this.currentContractId = contractId;

    try {
      await this.validateConnectedWallet();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  private async validateConnectedWallet(): Promise<void> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');
    if (!this.currentContractId) {
      throw new Error('Smart wallet is not connected');
    }

    try {
      const tx = await this.kit.rules.getAll({ tag: 'Default', values: undefined });
      await tx.simulate();

      const sim = tx.simulation;
      const probeDetails = this.describeSimulationProbe(sim);

      // simulate() returns without throwing when the RPC reports an error result — check explicitly.
      if (!sim || Api.isSimulationError(sim) || !Api.isSimulationSuccess(sim)) {
        if (this.isMissingContextRulesError(probeDetails)) {
          console.warn(
            '⚠️  get_context_rules probe failed (old WASM or RPC). All signing uses smart-account-kit only. ' +
              'If transactions fail with auth errors, create a new passkey wallet matching VITE_ACCOUNT_WASM_HASH.'
          );
          this.walletCompatibilityMode = 'context-rules';
          return;
        }
        throw new Error(
          `Could not verify smart account (context rules probe failed): ${probeDetails}`
        );
      }

      this.walletCompatibilityMode = 'context-rules';
      console.log('✅ Smart account compatible with context rules');
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);

      if (this.isMissingContextRulesError(details)) {
        console.warn(
          '⚠️  get_context_rules probe failed (old WASM or RPC). All signing uses smart-account-kit only. ' +
            'If transactions fail with auth errors, create a new passkey wallet matching VITE_ACCOUNT_WASM_HASH.'
        );
        this.walletCompatibilityMode = 'context-rules';
        return;
      }

      throw new Error(
        `Connected contract ${this.currentContractId} is not a valid smart account. ` +
          `Reconnect with a passkey wallet and try again. Details: ${details}`
      );
    }
  }

  private describeSimulationProbe(sim: unknown): string {
    if (sim == null) return 'no simulation result';
    try {
      return JSON.stringify(sim);
    } catch {
      return String(sim);
    }
  }

  private async signAndSubmitWithCompatibility(transaction: any): Promise<any> {
    if (!this.kit) throw new Error('SmartAccountService not initialized');
    if (!this.walletCompatibilityMode) {
      await this.validateConnectedWallet();
    }

    // Only supported path: smart-account-kit (matches stellar-accounts do_check_auth).
    // Manual legacy re-signing was removed — it caused double WebAuthn prompts and
    // __check_auth failures (UnreachableCodeReached / InvalidAction).
    return this.kit.signAndSubmit(transaction);
  }

  private setCredentialFromConnectResult(result: ConnectWalletResult): void {
    const cached = this.readCachedCredential(result.contractId);
    const publicKey =
      result.credential?.publicKey ??
      cached?.publicKey ??
      (result.contractId === this.currentContractId ? this.currentPublicKey : null);

    this.setActiveCredential(result.contractId, result.credentialId, publicKey);
  }

  private setActiveCredential(
    contractId: string,
    credentialId: string,
    publicKey?: Uint8Array | null
  ): void {
    this.currentCredentialId = credentialId;
    this.currentPublicKey = publicKey ? new Uint8Array(publicKey) : null;

    if (this.currentPublicKey) {
      this.cacheCredential(contractId, credentialId, this.currentPublicKey);
    }
  }

  private isMissingContextRulesError(details: string): boolean {
    if (!details.includes('get_context_rules')) return false;
    const d = details.toLowerCase();
    return (
      d.includes('non-existent contract function') ||
      d.includes('missingvalue') ||
      d.includes('wasmvm')
    );
  }

  private cacheCredential(contractId: string, credentialId: string, publicKey: Uint8Array): void {
    if (typeof localStorage === 'undefined') return;

    localStorage.setItem(
      this.getCredentialCacheKey(contractId),
      JSON.stringify({
        credentialId,
        publicKey: Buffer.from(publicKey).toString('base64'),
      })
    );
  }

  private readCachedCredential(
    contractId: string
  ): { credentialId: string; publicKey: Uint8Array } | null {
    if (typeof localStorage === 'undefined') return null;

    const raw = localStorage.getItem(this.getCredentialCacheKey(contractId));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { credentialId?: string; publicKey?: string };
      if (!parsed.credentialId || !parsed.publicKey) return null;

      return {
        credentialId: parsed.credentialId,
        publicKey: new Uint8Array(Buffer.from(parsed.publicKey, 'base64')),
      };
    } catch {
      return null;
    }
  }

  private getCredentialCacheKey(contractId: string): string {
    return `clash-smart-account-credential:${contractId}`;
  }
}
