/**
 * passkeyService.ts
 *
 *  1. Smart-contract wallet via passkey-kit v0.12.0
 *  2. Smart wallet is pre-funded on deploy
 *  3. TWO biometric prompts at registration:
 *       Prompt 1 → createWallet (deploy)
 *       Prompt 2 → addEd25519 (session key registration)
 *  4. set_username called AFTER session key is registered,
 *     signed by the Ed25519 session key (no extra prompt),
 *     fee paid by admin via fee bump transaction.
 *  5. All gameplay silent via session key for 60 minutes.
 */

import {
    CLASH_CONTRACT,
    NETWORK_PASSPHRASE,
    RPC_URL,
    WALLET_WASM_HASH,
    DEFAULT_METHOD_OPTIONS,
  } from '@/utils/constants';
  
  import { Client as ClashGameClient } from '@/games/clash/bindings';
  import { PasskeyKit, SignerStore, SignerKey } from 'passkey-kit';
  import { Keypair, rpc as SorobanRpc } from '@stellar/stellar-sdk';
  import { calculateValidUntilLedger } from '@/utils/ledgerUtils';
  
  // ─────────────────────────────────────────────────────────────
  // Types
  // ─────────────────────────────────────────────────────────────
  
  export interface AuthUser {
    username:     string;
    address:      string;
    credentialId: string;
    isNewAccount: boolean;
  }
  
  export interface SessionKey {
    publicKey:   string;
    secretKey:   string;
    expiresAt:   number;
    permissions: string[];
  }
  
  // ─────────────────────────────────────────────────────────────
  // Singletons
  // ─────────────────────────────────────────────────────────────
  
  const passkeyKit = new PasskeyKit({
    rpcUrl:            RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    walletWasmHash:    WALLET_WASM_HASH,
    timeoutInSeconds:  30,
  });
  
  const rpc = new SorobanRpc.Server(RPC_URL, {
    allowHttp: RPC_URL.startsWith('http://'),
  });
  
  const baseClient = new ClashGameClient({
    contractId:        CLASH_CONTRACT,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl:            RPC_URL,
    allowHttp:         RPC_URL.startsWith('http://'),
  });
  
  // ─────────────────────────────────────────────────────────────
  // Constants
  // ─────────────────────────────────────────────────────────────
  
  const APP_NAME     = 'Clash of Pirates';
  const STORAGE_KEY  = 'clash_auth_user';
  const CRED_MAP_KEY = 'clash_cred_map';
  
  // ─────────────────────────────────────────────────────────────
  // Binary helpers
  // ─────────────────────────────────────────────────────────────
  
  export function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  
  export function base64ToBuf(b64: string): Uint8Array {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin    = atob(padded);
    return new Uint8Array(bin.split('').map(c => c.charCodeAt(0)));
  }
  
  // ─────────────────────────────────────────────────────────────
  // Core: sign an AssembledTransaction and submit directly
  // Used by addEd25519 (session key registration).
  // passkeyKit builds these transactions internally with its own
  // funded keypair as fee source — no sequence issues.
  // ─────────────────────────────────────────────────────────────
  
  async function signAndSubmit(builtTx: any, credentialId: string): Promise<void> {
    const signedTx = await passkeyKit.sign(builtTx, { keyId: credentialId });
  
    const result = await rpc.sendTransaction(signedTx.built!);
    if (result.status === 'ERROR') {
      throw new Error(`Transaction failed: ${JSON.stringify(result.errorResult)}`);
    }
  
    await waitForConfirmation(result.hash);
    console.info('[passkey] Transaction confirmed ✅', result.hash);
  }
  
  async function waitForConfirmation(hash: string, maxAttempts = 20): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const status = await rpc.getTransaction(hash);
      if (status.status === 'SUCCESS') return;
      if (status.status === 'FAILED')  throw new Error(`Transaction failed on-chain: ${hash}`);
    }
    throw new Error(`Transaction not confirmed after ${maxAttempts} attempts: ${hash}`);
  }
  
  // ─────────────────────────────────────────────────────────────
  // Wait for a newly deployed contract account to be indexed
  // ─────────────────────────────────────────────────────────────
  
  async function waitForAccountIndexed(
    contractAddress: string,
    maxAttempts: number = 20,
    intervalMs:  number = 2000,
  ): Promise<void> {
    console.info('[passkey] Waiting for contract wallet to be indexed…');
  
    const { Contract, xdr } = await import('@stellar/stellar-sdk');
  
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));
      try {
        const contract    = new Contract(contractAddress);
        const instanceKey = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract:   contract.address().toScAddress(),
            key:        xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
          })
        );
  
        const result = await rpc.getLedgerEntries(instanceKey);
        if (result.entries && result.entries.length > 0) {
          console.info(`[passkey] Contract indexed ✅ (attempt ${i + 1})`);
          return;
        }
      } catch {
        // not yet
      }
      console.info(`[passkey] Not indexed yet (attempt ${i + 1}/${maxAttempts})…`);
    }
  
    throw new Error(`Contract ${contractAddress} not indexed after ${maxAttempts} attempts`);
  }
  
  // ─────────────────────────────────────────────────────────────
  // set_username via Ed25519 session key + admin fee bump
  //
  // Called AFTER addEd25519 confirms, so:
  //   - The session keypair is already a trusted signer on the smart wallet
  //   - authorizeEntry with Ed25519 works correctly for Soroban auth
  //   - Admin keypair wraps in a fee bump → no sequence/funding issues
  //   - Zero extra biometric prompts
  // ─────────────────────────────────────────────────────────────
  
  async function setUsernameWithSessionKey(
    smartWalletAddress: string,
    username:           string,
    sessionKeypair:     Keypair,
  ): Promise<void> {
    // Contract is already indexed at this point (we waited before addEd25519),
    // but wait again just in case this is called in isolation.
    await waitForAccountIndexed(smartWalletAddress);
  
    const { authorizeEntry, xdr, TransactionBuilder } = await import('@stellar/stellar-sdk');
    const adminKeypair = Keypair.fromSecret(import.meta.env.VITE_ADMIN_SECRET_KEY);
    const validUntil   = await calculateValidUntilLedger(RPC_URL, 30);
  
    const MAX_RETRIES = 5;
    let lastError: Error | null = null;
  
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, 2000));
  
      try {
        // Build with the session keypair as publicKey so the SDK knows who
        // is signing the auth entries (the smart wallet trusts this key via addEd25519)
        const clashClient = new ClashGameClient({
          contractId:        CLASH_CONTRACT,
          networkPassphrase: NETWORK_PASSPHRASE,
          rpcUrl:            RPC_URL,
          allowHttp:         RPC_URL.startsWith('http://'),
          publicKey:         sessionKeypair.publicKey(),
  
          // Sign Soroban auth entries with the Ed25519 session key.
          // authorizeEntry handles the HashIdPreimage construction correctly.
          signAuthEntry: async (entryXdr: string) => {
            const entry  = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64');
            const signed = await authorizeEntry(
              entry,
              sessionKeypair,
              validUntil,
              NETWORK_PASSPHRASE,
            );
            return { signedAuthEntry: signed.toXDR('base64') };
          },
  
          // Pass through — we sign the envelope ourselves below
          signTransaction: async (txXdr: string) => ({ signedTxXdr: txXdr }),
        });
  
        const tx        = await clashClient.set_username(
          { caller: smartWalletAddress, username },
          { simulate: false, fee: 10_000_000, timeoutInSeconds: 30 },
        );
        const simResult = await tx.simulate();
  
        // signAndSend calls signAuthEntry (session key signs auth entries)
        // then signTransaction (passthrough) — giving us a fully auth-signed tx
        const sent = await simResult.signAndSend();
  
        // The inner tx is now auth-signed but the fee source (session keypair) has no XLM.
        // Wrap in a fee bump so the admin account pays.
        // NOTE: if signAndSend already submitted successfully above, skip the fee bump.
        // If it threw due to no funds, we catch below and wrap manually.
        console.info('[passkey] Username registered via session key ✅', username);
        return;
  
      } catch (err: any) {
        // signAndSend failed because session keypair has no XLM for fees.
        // Fall back to manual fee bump submission.
        const msg = String(err?.message ?? err);
  
        if (
          msg.includes('txInsufficientBalance') ||
          msg.includes('op_no_account') ||
          msg.includes('txBadSeq') ||
          msg.includes('-5') ||
          msg.includes('account not found')
        ) {
          console.info(`[passkey] Fee issue on attempt ${attempt} — trying fee bump…`);
          try {
            // Re-simulate fresh to get a clean built tx
            const clashClient2 = new ClashGameClient({
              contractId:        CLASH_CONTRACT,
              networkPassphrase: NETWORK_PASSPHRASE,
              rpcUrl:            RPC_URL,
              allowHttp:         RPC_URL.startsWith('http://'),
              publicKey:         sessionKeypair.publicKey(),
              signAuthEntry: async (entryXdr: string) => {
                const { authorizeEntry, xdr: xdr2 } = await import('@stellar/stellar-sdk');
                const entry  = xdr2.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64');
                const signed = await authorizeEntry(entry, sessionKeypair, validUntil, NETWORK_PASSPHRASE);
                return { signedAuthEntry: signed.toXDR('base64') };
              },
              signTransaction: async (txXdr: string) => ({ signedTxXdr: txXdr }),
            });
  
            const tx2     = await clashClient2.set_username(
              { caller: smartWalletAddress, username },
              { simulate: false, fee: 10_000_000, timeoutInSeconds: 30 },
            );
            const sim2    = await tx2.simulate();
  
            // Manually sign auth entries
            const validUntil2 = await calculateValidUntilLedger(RPC_URL, 30);
            await sim2.signAuthEntries({ expiration: validUntil2 });
  
            const innerTx = sim2.built!;
  
            // Wrap in fee bump — admin pays
            const feeBump = TransactionBuilder.buildFeeBumpTransaction(
              adminKeypair,
              '10000000',
              innerTx,
              NETWORK_PASSPHRASE,
            );
            feeBump.sign(adminKeypair);
  
            const result = await rpc.sendTransaction(feeBump);
            if (result.status === 'ERROR') {
              throw new Error(`Send failed: ${JSON.stringify(result.errorResult)}`);
            }
  
            await waitForConfirmation(result.hash);
            console.info('[passkey] Username registered via fee bump ✅', username);
            return;
  
          } catch (feeBumpErr: any) {
            lastError = feeBumpErr;
            if (String(feeBumpErr?.message ?? feeBumpErr).includes('txBadSeq')) {
              console.warn(`[passkey] txBadSeq on fee bump attempt ${attempt} — retrying…`);
              continue;
            }
            throw feeBumpErr;
          }
        }
  
        lastError = err;
        throw err;
      }
    }
  
    throw lastError ?? new Error('set_username failed after max retries');
  }
  
  // ─────────────────────────────────────────────────────────────
  // Smart wallet deploy
  // ─────────────────────────────────────────────────────────────
  
  async function deploySmartWallet(username: string): Promise<{
    contractId:   string;
    credentialId: string;
  }> {
    const { keyIdBase64, contractId, signedTx } = await passkeyKit.createWallet(
      APP_NAME,
      username,
    );
  
    const result = await rpc.sendTransaction(signedTx);
    if (result.status === 'ERROR') {
      throw new Error(`Wallet deploy failed: ${JSON.stringify(result.errorResult)}`);
    }
    await waitForConfirmation(result.hash);
  
    console.info('[passkey] Smart wallet deployed:', contractId);
    return { contractId, credentialId: keyIdBase64 };
  }
  
  // ─────────────────────────────────────────────────────────────
  // Username resolution
  // ─────────────────────────────────────────────────────────────
  
  export async function resolveUsername(username: string): Promise<string | null> {
    try {
      const tx     = await baseClient.get_address_by_username({ username });
      const result = await tx.simulate();
      return (result.result as string) ?? null;
    } catch {
      return null;
    }
  }
  
  export async function resolveAddress(address: string): Promise<string | null> {
    try {
      const tx     = await baseClient.get_username({ address });
      const result = await tx.simulate();
      return (result.result as string) ?? null;
    } catch {
      return null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────
  
  export function saveAuthUser(user: AuthUser): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch { /* ignore */ }
  }
  
  export function loadAuthUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  
  export function clearAuthUser(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem('clash_session_key');
    } catch { /* ignore */ }
  }
  
  // ─────────────────────────────────────────────────────────────
  // WebAuthn Registration
  //
  // Flow:
  //   1. Biometric prompt 1 → deploy smart wallet
  //   2. Persist user (isNewAccount: true)
  //   3. Return — caller (useAuth) calls createSessionKey next
  //
  // set_username is called inside createSessionKey after the
  // session key is confirmed on-chain, using that key as signer.
  // ─────────────────────────────────────────────────────────────
  
  export async function registerWithPasskey(username: string): Promise<AuthUser> {
    console.info('[passkey] Creating wallet…');
    const { contractId, credentialId } = await deploySmartWallet(username);
  
    const credMap: Record<string, string> = JSON.parse(
      localStorage.getItem(CRED_MAP_KEY) ?? '{}'
    );
    credMap[username] = credentialId;
    localStorage.setItem(CRED_MAP_KEY, JSON.stringify(credMap));
  
    const user: AuthUser = {
      username,
      address:      contractId,
      credentialId,
      isNewAccount: true,  // ← triggers set_username inside createSessionKey
    };
    saveAuthUser(user);
    return user;
  }
  
  // ─────────────────────────────────────────────────────────────
  // WebAuthn Authentication
  // ─────────────────────────────────────────────────────────────
  
  export async function loginWithPasskey(username: string): Promise<AuthUser> {
    const credMap: Record<string, string> = JSON.parse(
      localStorage.getItem(CRED_MAP_KEY) ?? '{}'
    );
    const knownCredId = credMap[username];
  
    const { keyIdBase64, contractId } = await passkeyKit.connectWallet(
      knownCredId ? { keyId: knownCredId } : undefined
    );
  
    credMap[username] = keyIdBase64;
    localStorage.setItem(CRED_MAP_KEY, JSON.stringify(credMap));
  
    const user: AuthUser = {
      username,
      address:      contractId,
      credentialId: keyIdBase64,
      isNewAccount: false,  // ← skips set_username in createSessionKey
    };
    saveAuthUser(user);
    return user;
  }
  
  // ─────────────────────────────────────────────────────────────
  // Session keys
  //
  // Called by useAuth immediately after register or login.
  //
  // Registration flow:
  //   Biometric prompt 2 → addEd25519 (session key on-chain)
  //   → set_username signed by session key, fee paid by admin
  //   → all gameplay silent for 60 min
  //
  // Login flow:
  //   Biometric prompt 2 → addEd25519 (refresh session key)
  //   → all gameplay silent for 60 min
  // ─────────────────────────────────────────────────────────────
  
  export async function createSessionKey(
    user:            AuthUser,
    durationMinutes: number = 60,
  ): Promise<SessionKey> {
    const tempKeypair = Keypair.random();
    const expiresAt   = Math.floor(Date.now() / 1000) + durationMinutes * 60;
    const permissions = ['commit_moves', 'reveal_moves', 'resolve_battle'];
  
    try {
      console.info('[passkey] Registering session key — biometric prompt…');
  
      const limits: Map<string, SignerKey[] | undefined> = new Map([
        [CLASH_CONTRACT, undefined],
      ]);
  
      const addTx = await passkeyKit.addEd25519(
        tempKeypair.publicKey(),
        limits,
        SignerStore.Temporary,
        expiresAt,
      );
  
      // Biometric prompt happens here — signs the addEd25519 transaction
      await signAndSubmit(addTx, user.credentialId);
      console.info('[passkey] Session key registered on-chain ✅');
  
      // NOW call set_username — session key is confirmed on-chain and trusted
      // by the smart wallet. No extra biometric prompt needed.
      if (user.isNewAccount) {
        console.info('[passkey] Registering username on-chain via session key…');
        await setUsernameWithSessionKey(
          user.address,
          user.username,
          tempKeypair,
        );
        // Mark as no longer new so re-entry doesn't re-register
        user.isNewAccount = false;
        saveAuthUser(user);
      }
  
    } catch (err) {
      console.warn('[passkey] Session key setup failed — will prompt per action:', err);
    }
  
    sessionStorage.setItem(
      'clash_session_key',
      JSON.stringify({ secret: tempKeypair.secret(), expiresAt }),
    );
  
    return {
      publicKey:   tempKeypair.publicKey(),
      secretKey:   tempKeypair.secret(),
      expiresAt,
      permissions,
    };
  }
  
  export function loadSessionKey(): SessionKey | null {
    try {
      const raw = sessionStorage.getItem('clash_session_key');
      if (!raw) return null;
      const { secret, expiresAt } = JSON.parse(raw);
      if (expiresAt < Math.floor(Date.now() / 1000)) {
        sessionStorage.removeItem('clash_session_key');
        return null;
      }
      const kp = Keypair.fromSecret(secret);
      return {
        publicKey:   kp.publicKey(),
        secretKey:   secret,
        expiresAt,
        permissions: ['commit_moves', 'reveal_moves', 'resolve_battle'],
      };
    } catch { return null; }
  }
  
  export function isSessionKeyValid(sk: SessionKey): boolean {
    return sk.expiresAt > Math.floor(Date.now() / 1000);
  }
  
  export function getActiveSigner(user: AuthUser) {
    const sessionKey = loadSessionKey();
    if (sessionKey && isSessionKeyValid(sessionKey)) {
      return {
        type:    'session' as const,
        keypair: Keypair.fromSecret(sessionKey.secretKey),
      };
    }
    return {
      type:    'passkey' as const,
      keypair: null,
      sign:    (tx: any) => passkeyKit.sign(tx, { keyId: user.credentialId }),
    };
  }
  
  export async function getSmartAccountAddress(user: AuthUser): Promise<string> {
    return user.address;
  }