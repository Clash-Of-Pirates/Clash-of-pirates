import { 
  Client as ClashGameClient, 
  type Game, 
  type Challenge, 
  type GamePlayback, 
  type Move,
  type BattleResult,
  Attack,
  Defense
} from './bindings';
import { NETWORK_PASSPHRASE, RPC_URL, DEFAULT_METHOD_OPTIONS, DEFAULT_AUTH_TTL_MINUTES, MULTI_SIG_AUTH_TTL_MINUTES } from '@/utils/constants';
import { contract, TransactionBuilder, StrKey, xdr, Address, authorizeEntry, rpc } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { calculateValidUntilLedger } from '@/utils/ledgerUtils';
import { injectSignedAuthEntry } from '@/utils/authEntryUtils';

type ClientOptions = contract.ClientOptions;

/**
 * Service for interacting with the ClashGame contract

 */
export class ClashGameService {
  private baseClient: ClashGameClient;
  private contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;   
    this.baseClient = new ClashGameClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      allowHttp: RPC_URL.startsWith('http://'),
    });
  }

  /**
   * Create a client with signing capabilities
   */
  private createSigningClient(
    publicKey: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>
  ): ClashGameClient {
    const options: ClientOptions = {
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL, 
      allowHttp: RPC_URL.startsWith('http://'), 
      publicKey,
      ...signer,
    };
    return new ClashGameClient(options);
  }

  // ========================================================================
  // Username Management
  // ========================================================================

  async setUsername(
    caller: string,
    username: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(caller, signer);
    const tx = await client.set_username({
      caller,
      username,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to set username - it may already be taken or invalid');
      }
      throw err;
    }
  }

  async getUsername(address: string): Promise<string | null> {
    try {
      const tx = await this.baseClient.get_username({ address });
      const result = await tx.simulate();
      return result.result || null;
    } catch (err) {
      console.log('[getUsername] Error querying username:', err);
      return null;
    }
  }

  async getAddressByUsername(username: string): Promise<string | null> {
    try {
      const tx = await this.baseClient.get_address_by_username({ username });
      const result = await tx.simulate();
      return result.result || null;
    } catch (err) {
      console.log('[getAddressByUsername] Error querying address:', err);
      return null;
    }
  }

  // ========================================================================
  // Challenge System
  // ========================================================================

  async sendChallenge(
    challenger: string,
    challenged: string,
    pointsWagered: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(challenger, signer);
    const tx = await client.send_challenge({
      challenger,
      challenged,
      points_wagered: pointsWagered,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to send challenge - cannot challenge yourself');
      }
      throw err;
    }
  }

  async acceptChallenge(
    challengeId: number,
    challenged: string,
    sessionId: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(challenged, signer);
    const tx = await client.accept_challenge({
      challenge_id: challengeId,
      challenged,
      session_id: sessionId,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to accept challenge - it may have expired or not exist');
      }
      throw err;
    }
  }

  async getPlayerChallenges(player: string): Promise<{
    active: Challenge[];
    completed: Challenge[];
    expired: Challenge[];
  }> {
    try {
      const tx = await this.baseClient.get_player_challenges({ player });
      const result = await tx.simulate();

      const [active, completed, expired] = result.result;

      return {
        active: active || [],
        completed: completed || [],
        expired: expired || [],
      };
    } catch (err) {
      console.log('[getPlayerChallenges] Error querying challenges:', err);
      return {
        active: [],
        completed: [],
        expired: [],
      };
    }
  }

  // ========================================================================
  // Game Flow 
  // ========================================================================

  async getGame(sessionId: number): Promise<Game | null> {
    try {
      const tx = await this.baseClient.get_game({ session_id: sessionId });
      const result = await tx.simulate();

      if (result.result.isOk()) {
        return result.result.unwrap();
      } else {
        console.log('[getGame] Game not found for session:', sessionId);
        return null;
      }
    } catch (err) {
      console.log('[getGame] Error querying game:', err);
      return null;
    }
  }

  async startGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(player1, signer);
    const tx = await client.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const sentTx = await signAndSendViaLaunchtube(
      tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntilLedgerSeq
    );
    const txHash = sentTx.sendTransactionResponse?.hash;
    console.log(`[Start_game] ✅ tx hash: ${txHash}`);
    return sentTx.result;
  }

  /**
   * Commit moves with ZK proof
   *  
   * @param publicInputs - The public inputs from the ZK proof (includes commitment hash)
   * @param proofBytes - The proof bytes
   */
  async commitMoves(
    sessionId: number,
    player: string,
    publicInputs: Uint8Array | Buffer,
    proofBytes: Uint8Array | Buffer,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(player, signer);
    
    // Convert to Buffer if needed
    const publicInputsBuffer = Buffer.isBuffer(publicInputs) ? publicInputs : Buffer.from(publicInputs);
    const proofBytesBuffer = Buffer.isBuffer(proofBytes) ? proofBytes : Buffer.from(proofBytes);
    
    const tx = await client.commit_moves({
      session_id: sessionId,
      player,
      public_inputs: publicInputsBuffer,
      proof_bytes: proofBytesBuffer,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }
      console.log(`[commitMoves] ✅ tx hash: ${sentTx.sendTransactionResponse?.hash}`);
      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to commit moves - proof may be invalid or you already committed');
      }
      throw err;
    }
  }

  /**
   * Reveal moves after both players have committed
 
   * NO proof_bytes parameter - contract re-derives hash from public_inputs and compares to stored commitment
   * 
   * @param publicInputs - The SAME public inputs from commit phase
   * @param moves - Array of 3 moves (attack + defense pairs) in plaintext
   */
  async revealMoves(
    sessionId: number,
    player: string,
    publicInputs: Uint8Array | Buffer,
    moves: Move[],
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    if (moves.length !== 3) {
      throw new Error('Must provide exactly 3 moves');
    }

    const client = this.createSigningClient(player, signer);
    
    // Convert to Buffer if needed
    const publicInputsBuffer = Buffer.isBuffer(publicInputs) ? publicInputs : Buffer.from(publicInputs);
    
    const tx = await client.reveal_moves({
      session_id: sessionId,
      player,
      public_inputs: publicInputsBuffer,
      moves,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }
      console.log(`[revealMoves] ✅ tx hash: ${sentTx.sendTransactionResponse?.hash}`);
      return sentTx.result;
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to reveal moves - both players must commit first and commitment must match');
      }
      throw err;
    }
  }

  /**
   * Resolve the battle after both players have revealed
   * NO player/callerAddress parameter needed - anyone can call once both players have revealed
   * But we still need a signer to sign the transaction
   */
  async resolveBattle(
    sessionId: number,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    callerAddress?: string,
    authTtlMinutes?: number
  ): Promise<BattleResult> {

    const address = callerAddress || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    
    const client = this.createSigningClient(address, signer);
    const tx = await client.resolve_battle({ 
      session_id: sessionId 
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    try {
      const sentTx = await signAndSendViaLaunchtube(
        tx,
        DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
        validUntilLedgerSeq
      );

      if (sentTx.getTransactionResponse?.status === 'FAILED') {
        const errorMessage = this.extractErrorFromDiagnostics(sentTx.getTransactionResponse);
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      
      if (sentTx.result.isOk && sentTx.result.isOk()) {
        console.log(`[resolveBattle] ✅ tx hash: ${sentTx.sendTransactionResponse?.hash}`);
        return sentTx.result.unwrap();
      }

      throw new Error('Failed to resolve battle');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Transaction failed!')) {
        throw new Error('Failed to resolve battle - both players must reveal their moves first');
      }
      throw err;
    }
  }

  async getGamePlayback(sessionId: number): Promise<GamePlayback | null> {
    try {
      const tx = await this.baseClient.get_game_playback({ session_id: sessionId });
      const result = await tx.simulate();

      if (result.result.isOk && result.result.isOk()) {
        return result.result.unwrap();
      } else {
        console.log('[getGamePlayback] Playback not available for session:', sessionId);
        return null;
      }
    } catch (err) {
      console.log('[getGamePlayback] Error querying playback:', err);
      return null;
    }
  }

  // ========================================================================
  // Multi-Sig Game Start 
  // ========================================================================

  async prepareStartGame(
    sessionId: number,
    player1: string,
    player2: string,
    player1Points: bigint,
    player2Points: bigint,
    player1Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<string> {
    const buildClient = new ClashGameClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      allowHttp: RPC_URL.startsWith('http://'),
      publicKey: player2,
    });

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1,
      player2,
      player1_points: player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    console.log('[prepareStartGame] Transaction built and simulated, extracting auth entries');

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries found in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    console.log('[prepareStartGame] Found', authEntries.length, 'auth entries in simulation');

    let player1AuthEntry = null;

    for (let i = 0; i < authEntries.length; i++) {
      const entry = authEntries[i];
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();

        if (entryAddressString === player1) {
          player1AuthEntry = entry;
          console.log(`[prepareStartGame] Found Player 1 auth entry at index ${i}`);
          break;
        }
      } catch (err) {
        continue;
      }
    }

    if (!player1AuthEntry) {
      throw new Error(`No auth entry found for Player 1 (${player1})`);
    }

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    if (!player1Signer.signAuthEntry) {
      throw new Error('signAuthEntry function not available');
    }

    const signedAuthEntry = await authorizeEntry(
      player1AuthEntry,
      async (preimage) => {
        if (!player1Signer.signAuthEntry) {
          throw new Error('Wallet does not support auth entry signing');
        }

        const signResult = await player1Signer.signAuthEntry(
          preimage.toXDR('base64'),
          {
            networkPassphrase: NETWORK_PASSPHRASE,
            address: player1,
          }
        );

        if (signResult.error) {
          throw new Error(`Failed to sign auth entry: ${signResult.error.message}`);
        }

        return Buffer.from(signResult.signedAuthEntry, 'base64');
      },
      validUntilLedgerSeq,
      NETWORK_PASSPHRASE,
    );

    const signedAuthEntryXdr = signedAuthEntry.toXDR('base64');
    console.log('[prepareStartGame] ✅ Successfully signed and exported Player 1 auth entry');
    return signedAuthEntryXdr;
  }

  parseAuthEntry(authEntryXdr: string): {
    sessionId: number;
    player1: string;
    player1Points: bigint;
    functionName: string;
  } {
    try {
      const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');

      const credentials = authEntry.credentials();
      const addressCreds = credentials.address();
      const player1Address = addressCreds.address();
      const player1 = Address.fromScAddress(player1Address).toString();

      const rootInvocation = authEntry.rootInvocation();
      const authorizedFunction = rootInvocation.function();
      const contractFn = authorizedFunction.contractFn();
      const functionName = contractFn.functionName().toString();

      if (functionName !== 'start_game') {
        throw new Error(`Unexpected function: ${functionName}. Expected start_game.`);
      }

      const args = contractFn.args();

      if (args.length !== 2) {
        throw new Error(`Expected 2 arguments for start_game auth entry, got ${args.length}`);
      }

      const sessionId = args[0].u32();
      const player1Points = args[1].i128().lo().toBigInt();

      return {
        sessionId,
        player1,
        player1Points,
        functionName,
      };
    } catch (err: any) {
      console.error('[parseAuthEntry] Error parsing auth entry:', err);
      throw new Error(`Failed to parse auth entry: ${err.message}`);
    }
  }

  async importAndSignAuthEntry(
    player1SignedAuthEntryXdr: string,
    player2Address: string,
    player2Points: bigint,
    player2Signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ): Promise<string> {
    console.log('[importAndSignAuthEntry] Parsing Player 1 signed auth entry...');

    const gameParams = this.parseAuthEntry(player1SignedAuthEntryXdr);

    if (player2Address === gameParams.player1) {
      throw new Error('Cannot play against yourself. Player 2 must be different from Player 1.');
    }

    const buildClient = new ClashGameClient({
      contractId: this.contractId,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      allowHttp: RPC_URL.startsWith('http://'),
      publicKey: player2Address,
    });

    const tx = await buildClient.start_game({
      session_id: gameParams.sessionId,
      player1: gameParams.player1,
      player2: player2Address,
      player1_points: gameParams.player1Points,
      player2_points: player2Points,
    }, DEFAULT_METHOD_OPTIONS);

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);

    const txWithInjectedAuth = await injectSignedAuthEntry(
      tx,
      player1SignedAuthEntryXdr,
      player2Address,
      player2Signer,
      validUntilLedgerSeq
    );

    const player2Client = this.createSigningClient(player2Address, player2Signer);
    const player2Tx = player2Client.txFromXDR(txWithInjectedAuth.toXDR());

    const needsSigning = await player2Tx.needsNonInvokerSigningBy();

    if (needsSigning.includes(player2Address)) {
      console.log('[importAndSignAuthEntry] Signing Player 2 auth entry');
      await player2Tx.signAuthEntries({ expiration: validUntilLedgerSeq });
    }

    return player2Tx.toXDR();
  }

  async finalizeStartGame(
    xdr: string,
    signerAddress: string,
    signer: Pick<contract.ClientOptions, 'signTransaction' | 'signAuthEntry'>,
    authTtlMinutes?: number
  ) {
    const client = this.createSigningClient(signerAddress, signer);
    const tx = client.txFromXDR(xdr);

    await tx.simulate();

    const validUntilLedgerSeq = authTtlMinutes
      ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
      : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);

    const sentTx = await signAndSendViaLaunchtube(
      tx,
      DEFAULT_METHOD_OPTIONS.timeoutInSeconds,
      validUntilLedgerSeq
    );
    console.log(`[finalizeStartGame] ✅ tx hash: ${sentTx.sendTransactionResponse?.hash}`);
    return sentTx.result;
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  createMove(attack: Attack, defense: Defense): Move {
    return { attack, defense };
  }

  async checkRequiredSignatures(
    xdr: string,
    publicKey: string
  ): Promise<string[]> {
    const client = this.createSigningClient(publicKey, {
      signTransaction: async (xdr: string) => ({ signedTxXdr: xdr }),
      signAuthEntry: async (xdr: string) => ({ signedAuthEntry: xdr }),
    });

    const tx = client.txFromXDR(xdr);
    const needsSigning = await tx.needsNonInvokerSigningBy();
    return needsSigning;
  }

  private extractErrorFromDiagnostics(transactionResponse: any): string {
    try {
      console.error('Transaction response:', JSON.stringify(transactionResponse, null, 2));

      const diagnosticEvents = transactionResponse?.diagnosticEventsXdr ||
                              transactionResponse?.diagnostic_events || [];

      for (const event of diagnosticEvents) {
        if (event?.topics) {
          const topics = Array.isArray(event.topics) ? event.topics : [];

          const hasErrorTopic = topics.some((topic: any) =>
            topic?.symbol === 'error' ||
            topic?.error
          );

          if (hasErrorTopic && event.data) {
            if (typeof event.data === 'string') {
              return event.data;
            } else if (event.data.vec && Array.isArray(event.data.vec)) {
              const messages = event.data.vec
                .filter((item: any) => item?.string)
                .map((item: any) => item.string);
              if (messages.length > 0) {
                return messages.join(': ');
              }
            }
          }
        }
      }

      const status = transactionResponse?.status || 'Unknown';
      return `Transaction ${status}. Check console for details.`;
    } catch (err) {
      console.error('Failed to extract error from diagnostics:', err);
      return 'Transaction failed with unknown error';
    }
  }
}


export { Attack, Defense };
export type { Move, Challenge, GamePlayback, BattleResult, Game };