/**
 * Submit Clash txs with a delegated session key using stellar-accounts 0.7 {@link AuthPayload}
 * (scvMap). smart-account-kit's multiSigners.operation uses a legacy signature shape that
 * breaks {@link patchSmartAccountKitAuth07} / __check_auth when no passkey signer runs.
 */
import { BASE_FEE } from 'smart-account-kit';
import type { SmartAccountKit } from 'smart-account-kit';
import type { Signer } from 'smart-account-kit-bindings';
import type { AssembledTransaction } from '@stellar/stellar-sdk/contract';
import {
  Address,
  hash,
  Keypair,
  Operation,
  TransactionBuilder,
  xdr,
  rpc as rpcModule,
} from '@stellar/stellar-sdk';

import {
  buildAuthDigest,
  buildSignaturePayload,
  emptyAuthPayload,
  readAuthPayload,
  upsertAuthPayloadSigner,
  writeAuthPayload,
} from './auth-payload';

const { assembleTransaction } = rpcModule;

/** Matches smart-account-kit `kit.js` deployer derivation. */
export function getKitDeployerKeypair(): Keypair {
  return Keypair.fromRawEd25519Seed(hash(Buffer.from('openzeppelin-smart-account-kit')));
}

export type ClashSessionSubmitOptions = {
  delegateAddress: string;
  clashContextRuleId: number;
};

function tryReadAuthPayload(sig: xdr.ScVal) {
  try {
    return readAuthPayload(sig);
  } catch {
    return emptyAuthPayload();
  }
}

type SubmitResult = { success: boolean; hash: string; error?: string; ledger?: number };

export async function submitClashSessionTransaction<T>(
  kit: SmartAccountKit,
  assembledTx: AssembledTransaction<T>,
  opts: ClashSessionSubmitOptions
): Promise<SubmitResult> {
  const contractId = kit.contractId;
  if (!contractId) {
    return { success: false, hash: '', error: 'Not connected to a wallet' };
  }

  const built = assembledTx.built;
  if (!built) {
    return { success: false, hash: '', error: 'Transaction not built' };
  }

  const ops = built.operations;
  if (!ops?.length) {
    return { success: false, hash: '', error: 'No operations in transaction' };
  }

  const op = ops[0] as {
    func?: xdr.HostFunction;
    auth?: xdr.SorobanAuthorizationEntry[];
  };
  const hostFunc = op.func;
  if (!hostFunc) {
    return { success: false, hash: '', error: 'First operation has no host function' };
  }

  const authEntries = op.auth ?? [];

  const rpc = kit.rpc;
  const networkPassphrase = kit.networkPassphrase;
  const deployerPublicKey = kit.deployerPublicKey;
  const timeoutInSeconds = (kit as unknown as { timeoutInSeconds?: number }).timeoutInSeconds ?? 60;

  const signedAuthEntries: xdr.SorobanAuthorizationEntry[] = [];
  const { sequence } = await rpc.getLatestLedger();
  const expiration = sequence + 100;

  const delegatedSigner: Signer = {
    tag: 'Delegated',
    values: [opts.delegateAddress],
  };

  for (const entry of authEntries) {
    const credentials = entry.credentials();
    if (credentials.switch().name !== 'sorobanCredentialsAddress') {
      signedAuthEntries.push(entry);
      continue;
    }

    const addressCreds = credentials.address();
    const authAddress = Address.fromScAddress(addressCreds.address()).toString();

    if (authAddress !== contractId) {
      signedAuthEntries.push(entry);
      continue;
    }

    let signedEntry = xdr.SorobanAuthorizationEntry.fromXDR(entry.toXDR());
    signedEntry.credentials().address().signatureExpirationLedger(expiration);

    const credSig = signedEntry.credentials().address().signature();
    const authPayload = tryReadAuthPayload(credSig);
    authPayload.context_rule_ids = [opts.clashContextRuleId];
    upsertAuthPayloadSigner(authPayload, delegatedSigner, Buffer.alloc(0));
    signedEntry.credentials().address().signature(writeAuthPayload(authPayload));

    signedAuthEntries.push(signedEntry);

    // Delegated verify uses require_auth_for_args((auth_digest,)); delegated entry must authorize __check_auth([auth_digest]), not hash(parent_preimage) alone.
    const signaturePayloadForDigest = buildSignaturePayload(
      networkPassphrase,
      signedEntry,
      expiration
    );
    const authDigest = buildAuthDigest(signaturePayloadForDigest, authPayload.context_rule_ids);

    const delegatedNonce = xdr.Int64.fromString(Date.now().toString());
    const delegatedInvocation = new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(contractId).toScAddress(),
          functionName: '__check_auth',
          args: [xdr.ScVal.scvBytes(authDigest)],
        })
      ),
      subInvocations: [],
    });
    const delegatedPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: hash(Buffer.from(networkPassphrase)),
        nonce: delegatedNonce,
        signatureExpirationLedger: expiration,
        invocation: delegatedInvocation,
      })
    );

    const { signedAuthEntry: sigB64 } = await kit.externalSigners.signAuthEntry(
      delegatedPreimage.toXDR('base64'),
      opts.delegateAddress
    );
    const signatureBytes = Buffer.from(sigB64, 'base64');
    const walletPublicKeyBytes = Address.fromString(opts.delegateAddress)
      .toScAddress()
      .accountId()
      .ed25519();
    const signatureScVal = xdr.ScVal.scvVec([
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('public_key'),
          val: xdr.ScVal.scvBytes(walletPublicKeyBytes),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('signature'),
          val: xdr.ScVal.scvBytes(signatureBytes),
        }),
      ]),
    ]);
    const walletSignedEntry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: Address.fromString(opts.delegateAddress).toScAddress(),
          nonce: delegatedNonce,
          signatureExpirationLedger: expiration,
          signature: signatureScVal,
        })
      ),
      rootInvocation: delegatedInvocation,
    });
    signedAuthEntries.push(walletSignedEntry);
  }

  const freshSourceAccount = await rpc.getAccount(deployerPublicKey);
  const resimTx = new TransactionBuilder(freshSourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: hostFunc,
        auth: signedAuthEntries,
      })
    )
    .setTimeout(timeoutInSeconds)
    .build();

  const resimResult = await rpc.simulateTransaction(resimTx);
  if ('error' in resimResult) {
    return {
      success: false,
      hash: '',
      error: `Re-simulation failed: ${resimResult.error}`,
    };
  }

  const resimTxXdr = resimTx.toXDR();
  const normalizedTx = TransactionBuilder.fromXDR(resimTxXdr, networkPassphrase);
  const assembled = assembleTransaction(normalizedTx, resimResult);
  const preparedTx = assembled.build();

  const deployerKp = getKitDeployerKeypair();
  const k = kit as unknown as {
    shouldUseLaunchtube?: (o?: { skipLaunchtube?: boolean }) => boolean;
    sendAndPoll?: (tx: unknown, o?: { skipLaunchtube?: boolean }) => Promise<SubmitResult>;
  };

  const submissionOpts = { skipLaunchtube: false as boolean | undefined };
  if (!k.shouldUseLaunchtube?.(submissionOpts)) {
    preparedTx.sign(deployerKp);
  }

  if (!k.sendAndPoll) {
    return { success: false, hash: '', error: 'SmartAccountKit sendAndPoll unavailable' };
  }
  return k.sendAndPoll(preparedTx, submissionOpts) as Promise<SubmitResult>;
}
