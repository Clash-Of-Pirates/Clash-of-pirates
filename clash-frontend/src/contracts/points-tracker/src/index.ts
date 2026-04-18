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
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBGYEIOWGSY6TGM6BFGPEUKM37TKPXAEETDRYACHJKVHOBZRNBIUMD6S",
  }
} as const

export type DataKey = {tag: "Points", values: readonly [string]} | {tag: "Players", values: void} | {tag: "Admin", values: void};

export interface Client {
  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the admin address (for client-side verification).
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
   * Construct and simulate a get_points transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the points for a single player address.
   * Returns 0 if the address has never played.
   */
  get_points: ({player}: {player: string}, options?: {
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
  }) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Called once at deploy time.
   * Sets the admin (the account authorized to record results).
   */
  initialize: ({admin}: {admin: string}, options?: {
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
   * Construct and simulate a record_result transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record the result of a completed duel.
   * Only callable by the admin address set at initialize.
   * winner gets +30 points.
   * loser loses 15 points, floor at 0 (never negative).
   * If winner == loser (should never happen) panic.
   */
  record_result: ({winner, loser}: {winner: string, loser: string}, options?: {
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
   * Construct and simulate a get_leaderboard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns all players and their points as a map.
   */
  get_leaderboard: (options?: {
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
  }) => Promise<AssembledTransaction<Map<string, u64>>>

  /**
   * Construct and simulate a register_players transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-only: register both duelists in the players list before `record_result`
   * (same effect as the internal `ensure_registered` helper).
   */
  register_players: ({player_a, player_b}: {player_a: string, player_b: string}, options?: {
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

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAEAAAAAAAAABlBvaW50cwAAAAAAAQAAABMAAAAAAAAAAAAAAAdQbGF5ZXJzAAAAAAAAAAAAAAAABUFkbWluAAAA",
        "AAAAAAAAADlSZXR1cm5zIHRoZSBhZG1pbiBhZGRyZXNzIChmb3IgY2xpZW50LXNpZGUgdmVyaWZpY2F0aW9uKS4AAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAFpSZXR1cm5zIHRoZSBwb2ludHMgZm9yIGEgc2luZ2xlIHBsYXllciBhZGRyZXNzLgpSZXR1cm5zIDAgaWYgdGhlIGFkZHJlc3MgaGFzIG5ldmVyIHBsYXllZC4AAAAAAApnZXRfcG9pbnRzAAAAAAABAAAAAAAAAAZwbGF5ZXIAAAAAABMAAAABAAAABg==",
        "AAAAAAAAAFZDYWxsZWQgb25jZSBhdCBkZXBsb3kgdGltZS4KU2V0cyB0aGUgYWRtaW4gKHRoZSBhY2NvdW50IGF1dGhvcml6ZWQgdG8gcmVjb3JkIHJlc3VsdHMpLgAAAAAACmluaXRpYWxpemUAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAANhSZWNvcmQgdGhlIHJlc3VsdCBvZiBhIGNvbXBsZXRlZCBkdWVsLgpPbmx5IGNhbGxhYmxlIGJ5IHRoZSBhZG1pbiBhZGRyZXNzIHNldCBhdCBpbml0aWFsaXplLgp3aW5uZXIgZ2V0cyArMzAgcG9pbnRzLgpsb3NlciBsb3NlcyAxNSBwb2ludHMsIGZsb29yIGF0IDAgKG5ldmVyIG5lZ2F0aXZlKS4KSWYgd2lubmVyID09IGxvc2VyIChzaG91bGQgbmV2ZXIgaGFwcGVuKSBwYW5pYy4AAAANcmVjb3JkX3Jlc3VsdAAAAAAAAAIAAAAAAAAABndpbm5lcgAAAAAAEwAAAAAAAAAFbG9zZXIAAAAAAAATAAAAAA==",
        "AAAAAAAAAC5SZXR1cm5zIGFsbCBwbGF5ZXJzIGFuZCB0aGVpciBwb2ludHMgYXMgYSBtYXAuAAAAAAAPZ2V0X2xlYWRlcmJvYXJkAAAAAAAAAAABAAAD7AAAABMAAAAG",
        "AAAAAAAAAIdBZG1pbi1vbmx5OiByZWdpc3RlciBib3RoIGR1ZWxpc3RzIGluIHRoZSBwbGF5ZXJzIGxpc3QgYmVmb3JlIGByZWNvcmRfcmVzdWx0YAooc2FtZSBlZmZlY3QgYXMgdGhlIGludGVybmFsIGBlbnN1cmVfcmVnaXN0ZXJlZGAgaGVscGVyKS4AAAAAEHJlZ2lzdGVyX3BsYXllcnMAAAACAAAAAAAAAAhwbGF5ZXJfYQAAABMAAAAAAAAACHBsYXllcl9iAAAAEwAAAAA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<string>,
        get_points: this.txFromJSON<u64>,
        initialize: this.txFromJSON<null>,
        record_result: this.txFromJSON<null>,
        get_leaderboard: this.txFromJSON<Map<string, u64>>,
        register_players: this.txFromJSON<null>
  }
}