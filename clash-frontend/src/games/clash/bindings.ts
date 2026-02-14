import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  standalone: {
    networkPassphrase: "Standalone Network ; February 2017",
    contractId: "CC55FVY5OPATG6G4S3W7FLPONUGHMDP3ZQAKBEYDGQMXU5RCH5VC5JIJ",
  }
} as const


export interface Game {
  battle_result: BattleResult;
  has_battle_result: boolean;
  has_player1_commitment: boolean;
  has_player2_commitment: boolean;
  player1: string;
  player1_commitment: PlayerCommitment;
  player1_points: i128;
  player2: string;
  player2_commitment: PlayerCommitment;
  player2_points: i128;
}


export interface Move {
  attack: Attack;
  defense: Defense;
}

export const Errors = {
  1: {message:"GameNotFound"},
  2: {message:"NotPlayer"},
  3: {message:"AlreadyCommitted"},
  4: {message:"BothPlayersNotCommitted"},
  5: {message:"GameAlreadyEnded"},
  6: {message:"InvalidProof"},
  7: {message:"ProofVerificationFailed"},
  8: {message:"InvalidMoveSequence"},
  9: {message:"UsernameAlreadyTaken"},
  10: {message:"UsernameTooLong"},
  11: {message:"ChallengeNotFound"},
  12: {message:"ChallengeExpired"},
  13: {message:"CannotChallengeSelf"},
  14: {message:"UsernameTooShort"},
  15: {message:"InvalidUsernameFormat"},
  16: {message:"UsernameReserved"},
  17: {message:"AlreadyRevealed"},
  18: {message:"CommitmentMismatch"},
  19: {message:"InvalidPublicInputs"}
}

export enum Attack {
  Slash = 0,
  Fireball = 1,
  Lightning = 2,
}

export type DataKey = {tag: "Game", values: readonly [u32]} | {tag: "GameHubAddress", values: void} | {tag: "Admin", values: void} | {tag: "Ultrahonkverifier", values: void} | {tag: "Username", values: readonly [string]} | {tag: "AddressByUsername", values: readonly [string]} | {tag: "Challenge", values: readonly [u32]} | {tag: "ChallengeCounter", values: void} | {tag: "PlayerChallenges", values: readonly [string]};

export enum Defense {
  Block = 0,
  Dodge = 1,
  Counter = 2,
}


export interface Challenge {
  challenged: string;
  challenger: string;
  created_at: u64;
  expires_at: u64;
  is_accepted: boolean;
  is_completed: boolean;
  points_wagered: i128;
  session_id: Option<u32>;
}

export const ClashError = {
  1: {message:"CommitmentExists"},
  2: {message:"NullifierUsed"},
  3: {message:"VerificationFailed"}
}


export interface TurnResult {
  player1_damage_dealt: i32;
  player1_defense_successful: boolean;
  player1_hp_remaining: i32;
  player2_damage_dealt: i32;
  player2_defense_successful: boolean;
  player2_hp_remaining: i32;
  turn: u32;
}


export interface BattleResult {
  is_draw: boolean;
  player1_hp: i32;
  player2_hp: i32;
  turn_results: Array<TurnResult>;
  winner: Option<string>;
}


export interface GamePlayback {
  final_player1_hp: i32;
  final_player2_hp: i32;
  is_draw: boolean;
  player1: string;
  player1_username: Option<string>;
  player2: string;
  player2_username: Option<string>;
  session_id: u32;
  turn_results: Array<DetailedTurnResult>;
  winner: Option<string>;
}


export interface MoveSequence {
  moves: Array<Move>;
}


export interface PlayerCommitment {
  has_revealed: boolean;
  moves: MoveSequence;
  proof_id: Buffer;
}


export interface DetailedTurnResult {
  player1_damage_dealt: i32;
  player1_damage_taken: i32;
  player1_defense_successful: boolean;
  player1_hp_remaining: i32;
  player1_move: Move;
  player2_damage_dealt: i32;
  player2_damage_taken: i32;
  player2_defense_successful: boolean;
  player2_hp_remaining: i32;
  player2_move: Move;
  turn: u32;
}

export interface Client {
  /**
   * Construct and simulate a get_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_hub: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_hub transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_hub: ({new_hub}: {new_hub: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get game information
   */
  get_game: ({session_id}: {session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Game>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_admin: ({new_admin}: {new_admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a start_game transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start a new game between two players with points
   */
  start_game: ({session_id, player1, player2, player1_points, player2_points}: {session_id: u32, player1: string, player2: string, player1_points: i128, player2_points: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a commit_moves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Commit move sequence with ZK proof
   * Player proves they know valid moves WITHOUT revealing them.
   * The proof's public output (commitment hash) is stored.
   */
  commit_moves: ({session_id, player, public_inputs, proof_bytes}: {session_id: u32, player: string, public_inputs: Buffer, proof_bytes: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a get_username transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get username for an address
   */
  get_username: ({address}: {address: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a reveal_moves transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reveal moves — player re-proves with moves now PUBLIC.
   * The contract verifies the new proof's commitment output
   * matches what was stored at commit time.
   */
  reveal_moves: ({session_id, player, public_inputs, moves}: {session_id: u32, player: string, public_inputs: Buffer, moves: Array<Move>}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_username transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_username: ({caller, username}: {caller: string, username: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve_battle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resolve the battle after both players have revealed their moves
   */
  resolve_battle: ({session_id}: {session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<BattleResult>>>

  /**
   * Construct and simulate a send_challenge transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Send a challenge to another player
   */
  send_challenge: ({challenger, challenged, points_wagered}: {challenger: string, challenged: string, points_wagered: i128}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a accept_challenge transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accept a challenge and start a game
   */
  accept_challenge: ({challenge_id, challenged, session_id}: {challenge_id: u32, challenged: string, session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_game_playback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get detailed game playback with all moves and results
   */
  get_game_playback: ({session_id}: {session_id: u32}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<GamePlayback>>>

  /**
   * Construct and simulate a get_player_challenges transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get all challenges for a player (sorted by status)
   */
  get_player_challenges: ({player}: {player: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [Array<Challenge>, Array<Challenge>, Array<Challenge>]>>

  /**
   * Construct and simulate a get_address_by_username transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get address for a username
   */
  get_address_by_username: ({username}: {username: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Option<string>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, game_hub, verifier_contract}: {admin: string, game_hub: string, verifier_contract: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, game_hub, verifier_contract}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAAKAAAAAAAAAA1iYXR0bGVfcmVzdWx0AAAAAAAH0AAAAAxCYXR0bGVSZXN1bHQAAAAAAAAAEWhhc19iYXR0bGVfcmVzdWx0AAAAAAAAAQAAAAAAAAAWaGFzX3BsYXllcjFfY29tbWl0bWVudAAAAAAAAQAAAAAAAAAWaGFzX3BsYXllcjJfY29tbWl0bWVudAAAAAAAAQAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAABJwbGF5ZXIxX2NvbW1pdG1lbnQAAAAAB9AAAAAQUGxheWVyQ29tbWl0bWVudAAAAAAAAAAOcGxheWVyMV9wb2ludHMAAAAAAAsAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAScGxheWVyMl9jb21taXRtZW50AAAAAAfQAAAAEFBsYXllckNvbW1pdG1lbnQAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAAL",
        "AAAAAQAAAAAAAAAAAAAABE1vdmUAAAACAAAAAAAAAAZhdHRhY2sAAAAAB9AAAAAGQXR0YWNrAAAAAAAAAAAAB2RlZmVuc2UAAAAH0AAAAAdEZWZlbnNlAA==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEwAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAJTm90UGxheWVyAAAAAAAAAgAAAAAAAAAQQWxyZWFkeUNvbW1pdHRlZAAAAAMAAAAAAAAAF0JvdGhQbGF5ZXJzTm90Q29tbWl0dGVkAAAAAAQAAAAAAAAAEEdhbWVBbHJlYWR5RW5kZWQAAAAFAAAAAAAAAAxJbnZhbGlkUHJvb2YAAAAGAAAAAAAAABdQcm9vZlZlcmlmaWNhdGlvbkZhaWxlZAAAAAAHAAAAAAAAABNJbnZhbGlkTW92ZVNlcXVlbmNlAAAAAAgAAAAAAAAAFFVzZXJuYW1lQWxyZWFkeVRha2VuAAAACQAAAAAAAAAPVXNlcm5hbWVUb29Mb25nAAAAAAoAAAAAAAAAEUNoYWxsZW5nZU5vdEZvdW5kAAAAAAAACwAAAAAAAAAQQ2hhbGxlbmdlRXhwaXJlZAAAAAwAAAAAAAAAE0Nhbm5vdENoYWxsZW5nZVNlbGYAAAAADQAAAAAAAAAQVXNlcm5hbWVUb29TaG9ydAAAAA4AAAAAAAAAFUludmFsaWRVc2VybmFtZUZvcm1hdAAAAAAAAA8AAAAAAAAAEFVzZXJuYW1lUmVzZXJ2ZWQAAAAQAAAAAAAAAA9BbHJlYWR5UmV2ZWFsZWQAAAAAEQAAAAAAAAASQ29tbWl0bWVudE1pc21hdGNoAAAAAAASAAAAAAAAABNJbnZhbGlkUHVibGljSW5wdXRzAAAAABM=",
        "AAAAAwAAAAAAAAAAAAAABkF0dGFjawAAAAAAAwAAAAAAAAAFU2xhc2gAAAAAAAAAAAAAAAAAAAhGaXJlYmFsbAAAAAEAAAAAAAAACUxpZ2h0bmluZwAAAAAAAAI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAAAAAAAAAAADkdhbWVIdWJBZGRyZXNzAAAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAAEVVsdHJhaG9ua3ZlcmlmaWVyAAAAAAAAAQAAAAAAAAAIVXNlcm5hbWUAAAABAAAAEwAAAAEAAAAAAAAAEUFkZHJlc3NCeVVzZXJuYW1lAAAAAAAAAQAAABAAAAABAAAAAAAAAAlDaGFsbGVuZ2UAAAAAAAABAAAABAAAAAAAAAAAAAAAEENoYWxsZW5nZUNvdW50ZXIAAAABAAAAAAAAABBQbGF5ZXJDaGFsbGVuZ2VzAAAAAQAAABM=",
        "AAAAAwAAAAAAAAAAAAAAB0RlZmVuc2UAAAAAAwAAAAAAAAAFQmxvY2sAAAAAAAAAAAAAAAAAAAVEb2RnZQAAAAAAAAEAAAAAAAAAB0NvdW50ZXIAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAACUNoYWxsZW5nZQAAAAAAAAgAAAAAAAAACmNoYWxsZW5nZWQAAAAAABMAAAAAAAAACmNoYWxsZW5nZXIAAAAAABMAAAAAAAAACmNyZWF0ZWRfYXQAAAAAAAYAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAAAAAAC2lzX2FjY2VwdGVkAAAAAAEAAAAAAAAADGlzX2NvbXBsZXRlZAAAAAEAAAAAAAAADnBvaW50c193YWdlcmVkAAAAAAALAAAAAAAAAApzZXNzaW9uX2lkAAAAAAPoAAAABA==",
        "AAAABAAAAAAAAAAAAAAACkNsYXNoRXJyb3IAAAAAAAMAAAAAAAAAEENvbW1pdG1lbnRFeGlzdHMAAAABAAAAAAAAAA1OdWxsaWZpZXJVc2VkAAAAAAAAAgAAAAAAAAASVmVyaWZpY2F0aW9uRmFpbGVkAAAAAAAD",
        "AAAAAQAAAAAAAAAAAAAAClR1cm5SZXN1bHQAAAAAAAcAAAAAAAAAFHBsYXllcjFfZGFtYWdlX2RlYWx0AAAABQAAAAAAAAAacGxheWVyMV9kZWZlbnNlX3N1Y2Nlc3NmdWwAAAAAAAEAAAAAAAAAFHBsYXllcjFfaHBfcmVtYWluaW5nAAAABQAAAAAAAAAUcGxheWVyMl9kYW1hZ2VfZGVhbHQAAAAFAAAAAAAAABpwbGF5ZXIyX2RlZmVuc2Vfc3VjY2Vzc2Z1bAAAAAAAAQAAAAAAAAAUcGxheWVyMl9ocF9yZW1haW5pbmcAAAAFAAAAAAAAAAR0dXJuAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADEJhdHRsZVJlc3VsdAAAAAUAAAAAAAAAB2lzX2RyYXcAAAAAAQAAAAAAAAAKcGxheWVyMV9ocAAAAAAABQAAAAAAAAAKcGxheWVyMl9ocAAAAAAABQAAAAAAAAAMdHVybl9yZXN1bHRzAAAD6gAAB9AAAAAKVHVyblJlc3VsdAAAAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT",
        "AAAAAQAAAAAAAAAAAAAADEdhbWVQbGF5YmFjawAAAAoAAAAAAAAAEGZpbmFsX3BsYXllcjFfaHAAAAAFAAAAAAAAABBmaW5hbF9wbGF5ZXIyX2hwAAAABQAAAAAAAAAHaXNfZHJhdwAAAAABAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAEHBsYXllcjFfdXNlcm5hbWUAAAPoAAAAEAAAAAAAAAAHcGxheWVyMgAAAAATAAAAAAAAABBwbGF5ZXIyX3VzZXJuYW1lAAAD6AAAABAAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAADHR1cm5fcmVzdWx0cwAAA+oAAAfQAAAAEkRldGFpbGVkVHVyblJlc3VsdAAAAAAAAAAAAAZ3aW5uZXIAAAAAA+gAAAAT",
        "AAAAAQAAAAAAAAAAAAAADE1vdmVTZXF1ZW5jZQAAAAEAAAAAAAAABW1vdmVzAAAAAAAD6gAAB9AAAAAETW92ZQ==",
        "AAAAAAAAAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAABRHZXQgZ2FtZSBpbmZvcm1hdGlvbgAAAAhnZXRfZ2FtZQAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAB9AAAAAER2FtZQAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
        "AAAAAQAAAAAAAAAAAAAAEFBsYXllckNvbW1pdG1lbnQAAAADAAAAAAAAAAxoYXNfcmV2ZWFsZWQAAAABAAAAAAAAAAVtb3ZlcwAAAAAAB9AAAAAMTW92ZVNlcXVlbmNlAAAAAAAAAAhwcm9vZl9pZAAAA+4AAAAg",
        "AAAAAAAAADBTdGFydCBhIG5ldyBnYW1lIGJldHdlZW4gdHdvIHBsYXllcnMgd2l0aCBwb2ludHMAAAAKc3RhcnRfZ2FtZQAAAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAHcGxheWVyMQAAAAATAAAAAAAAAAdwbGF5ZXIyAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA5wbGF5ZXIyX3BvaW50cwAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAQAAAAAAAAAAAAAAEkRldGFpbGVkVHVyblJlc3VsdAAAAAAACwAAAAAAAAAUcGxheWVyMV9kYW1hZ2VfZGVhbHQAAAAFAAAAAAAAABRwbGF5ZXIxX2RhbWFnZV90YWtlbgAAAAUAAAAAAAAAGnBsYXllcjFfZGVmZW5zZV9zdWNjZXNzZnVsAAAAAAABAAAAAAAAABRwbGF5ZXIxX2hwX3JlbWFpbmluZwAAAAUAAAAAAAAADHBsYXllcjFfbW92ZQAAB9AAAAAETW92ZQAAAAAAAAAUcGxheWVyMl9kYW1hZ2VfZGVhbHQAAAAFAAAAAAAAABRwbGF5ZXIyX2RhbWFnZV90YWtlbgAAAAUAAAAAAAAAGnBsYXllcjJfZGVmZW5zZV9zdWNjZXNzZnVsAAAAAAABAAAAAAAAABRwbGF5ZXIyX2hwX3JlbWFpbmluZwAAAAUAAAAAAAAADHBsYXllcjJfbW92ZQAAB9AAAAAETW92ZQAAAAAAAAAEdHVybgAAAAQ=",
        "AAAAAAAAAJVDb21taXQgbW92ZSBzZXF1ZW5jZSB3aXRoIFpLIHByb29mClBsYXllciBwcm92ZXMgdGhleSBrbm93IHZhbGlkIG1vdmVzIFdJVEhPVVQgcmV2ZWFsaW5nIHRoZW0uClRoZSBwcm9vZidzIHB1YmxpYyBvdXRwdXQgKGNvbW1pdG1lbnQgaGFzaCkgaXMgc3RvcmVkLgAAAAAAAAxjb21taXRfbW92ZXMAAAAEAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAAOAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAABtHZXQgdXNlcm5hbWUgZm9yIGFuIGFkZHJlc3MAAAAADGdldF91c2VybmFtZQAAAAEAAAAAAAAAB2FkZHJlc3MAAAAAEwAAAAEAAAPoAAAAEA==",
        "AAAAAAAAAJhSZXZlYWwgbW92ZXMg4oCUIHBsYXllciByZS1wcm92ZXMgd2l0aCBtb3ZlcyBub3cgUFVCTElDLgpUaGUgY29udHJhY3QgdmVyaWZpZXMgdGhlIG5ldyBwcm9vZidzIGNvbW1pdG1lbnQgb3V0cHV0Cm1hdGNoZXMgd2hhdCB3YXMgc3RvcmVkIGF0IGNvbW1pdCB0aW1lLgAAAAxyZXZlYWxfbW92ZXMAAAAEAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAAAAAAADXB1YmxpY19pbnB1dHMAAAAAAAAOAAAAAAAAAAVtb3ZlcwAAAAAAA+oAAAfQAAAABE1vdmUAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAMc2V0X3VzZXJuYW1lAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAh1c2VybmFtZQAAABAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADZJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEdhbWVIdWIgYWRkcmVzcyBhbmQgYWRtaW4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAAAAAAEXZlcmlmaWVyX2NvbnRyYWN0AAAAAAAAEwAAAAA=",
        "AAAAAAAAAD9SZXNvbHZlIHRoZSBiYXR0bGUgYWZ0ZXIgYm90aCBwbGF5ZXJzIGhhdmUgcmV2ZWFsZWQgdGhlaXIgbW92ZXMAAAAADnJlc29sdmVfYmF0dGxlAAAAAAABAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAQAAA+kAAAfQAAAADEJhdHRsZVJlc3VsdAAAAAM=",
        "AAAAAAAAACJTZW5kIGEgY2hhbGxlbmdlIHRvIGFub3RoZXIgcGxheWVyAAAAAAAOc2VuZF9jaGFsbGVuZ2UAAAAAAAMAAAAAAAAACmNoYWxsZW5nZXIAAAAAABMAAAAAAAAACmNoYWxsZW5nZWQAAAAAABMAAAAAAAAADnBvaW50c193YWdlcmVkAAAAAAALAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAACNBY2NlcHQgYSBjaGFsbGVuZ2UgYW5kIHN0YXJ0IGEgZ2FtZQAAAAAQYWNjZXB0X2NoYWxsZW5nZQAAAAMAAAAAAAAADGNoYWxsZW5nZV9pZAAAAAQAAAAAAAAACmNoYWxsZW5nZWQAAAAAABMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAADVHZXQgZGV0YWlsZWQgZ2FtZSBwbGF5YmFjayB3aXRoIGFsbCBtb3ZlcyBhbmQgcmVzdWx0cwAAAAAAABFnZXRfZ2FtZV9wbGF5YmFjawAAAAAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAB9AAAAAMR2FtZVBsYXliYWNrAAAAAw==",
        "AAAAAAAAADJHZXQgYWxsIGNoYWxsZW5nZXMgZm9yIGEgcGxheWVyIChzb3J0ZWQgYnkgc3RhdHVzKQAAAAAAFWdldF9wbGF5ZXJfY2hhbGxlbmdlcwAAAAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPtAAAAAwAAA+oAAAfQAAAACUNoYWxsZW5nZQAAAAAAA+oAAAfQAAAACUNoYWxsZW5nZQAAAAAAA+oAAAfQAAAACUNoYWxsZW5nZQAAAA==",
        "AAAAAAAAABpHZXQgYWRkcmVzcyBmb3IgYSB1c2VybmFtZQAAAAAAF2dldF9hZGRyZXNzX2J5X3VzZXJuYW1lAAAAAAEAAAAAAAAACHVzZXJuYW1lAAAAEAAAAAEAAAPoAAAAEw==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_hub: this.txFromJSON<string>,
        set_hub: this.txFromJSON<null>,
        upgrade: this.txFromJSON<null>,
        get_game: this.txFromJSON<Result<Game>>,
        get_admin: this.txFromJSON<string>,
        set_admin: this.txFromJSON<null>,
        start_game: this.txFromJSON<Result<void>>,
        commit_moves: this.txFromJSON<Result<Buffer>>,
        get_username: this.txFromJSON<Option<string>>,
        reveal_moves: this.txFromJSON<Result<void>>,
        set_username: this.txFromJSON<Result<void>>,
        resolve_battle: this.txFromJSON<Result<BattleResult>>,
        send_challenge: this.txFromJSON<Result<u32>>,
        accept_challenge: this.txFromJSON<Result<void>>,
        get_game_playback: this.txFromJSON<Result<GamePlayback>>,
        get_player_challenges: this.txFromJSON<readonly [Array<Challenge>, Array<Challenge>, Array<Challenge>]>,
        get_address_by_username: this.txFromJSON<Option<string>>
  }
}