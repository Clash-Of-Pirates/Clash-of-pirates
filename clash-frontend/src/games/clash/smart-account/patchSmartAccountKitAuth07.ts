import base64url from 'base64url';
import { xdr } from '@stellar/stellar-sdk';
import type { SmartAccountKit } from 'smart-account-kit';
import { WEBAUTHN_TIMEOUT_MS } from 'smart-account-kit';
import type { Signer } from 'smart-account-kit-bindings';
import {
  buildAuthDigest,
  buildSignaturePayload,
  buildWebAuthnSignatureBytes,
  readAuthPayload,
  upsertAuthPayloadSigner,
  writeAuthPayload,
} from './auth-payload';
import { compactSignature } from './compactSignature';

type SignAuthOptions = {
  credentialId?: string;
  expiration?: number;
  contextRuleIds?: number[];
};

/** smart-account-kit hides fields on the class; we only need these for signing. */
type KitInternals = {
  _credentialId?: string;
  webAuthn: {
    startAuthentication: (args: { optionsJSON: Record<string, unknown> }) => Promise<{
      id: string;
      response: {
        signature: string;
        authenticatorData: string;
        clientDataJSON: string;
      };
    }>;
  };
  networkPassphrase: string;
  storage: { update: (id: string, data: { lastUsedAt: number }) => Promise<void> };
  calculateExpiration: () => Promise<number>;
  findKeyDataByCredentialId: (credentialId: Buffer) => Promise<Buffer>;
  webauthnVerifierAddress: string;
  rpId?: string;
  signAuthEntry: (
    entry: xdr.SorobanAuthorizationEntry,
    options?: SignAuthOptions
  ) => Promise<xdr.SorobanAuthorizationEntry>;
};

/**
 * Replaces `signAuthEntry` on the kit instance so WebAuthn signs `auth_digest`
 * (stellar-accounts 0.7) and writes `AuthPayload` map credentials.
 * smart-account-kit@0.2.x still uses the legacy hash-only challenge + vec signature map.
 */
export function patchSmartAccountKitAuth07(kit: SmartAccountKit): void {
  const k = kit as unknown as KitInternals;

  k.signAuthEntry = async (
    entry: xdr.SorobanAuthorizationEntry,
    options?: SignAuthOptions
  ): Promise<xdr.SorobanAuthorizationEntry> => {
    const entryXdrBytes = entry.toXDR();
    const normalizedEntry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdrBytes);
    const credentials = normalizedEntry.credentials().address();
    const expiration = options?.expiration ?? (await k.calculateExpiration());
    credentials.signatureExpirationLedger(expiration);

    const authPayload = readAuthPayload(credentials.signature());

    const credentialId = options?.credentialId ?? k._credentialId;
    if (!credentialId) {
      throw new Error('A credential ID is required to sign smart account auth entries');
    }

    let contextRuleIds = options?.contextRuleIds ?? authPayload.context_rule_ids;
    if (contextRuleIds.length === 0) {
      contextRuleIds = [0];
    }

    if (
      authPayload.context_rule_ids.length > 0 &&
      authPayload.context_rule_ids.join(',') !== contextRuleIds.join(',')
    ) {
      throw new Error('Existing auth payload uses different context rule IDs');
    }

    const signaturePayload = buildSignaturePayload(
      k.networkPassphrase,
      normalizedEntry,
      credentials.signatureExpirationLedger()
    );
    const authDigest = buildAuthDigest(signaturePayload, contextRuleIds);

    const authResponse = await k.webAuthn.startAuthentication({
      optionsJSON: {
        challenge: base64url(authDigest),
        rpId: k.rpId,
        userVerification: 'preferred',
        timeout: WEBAUTHN_TIMEOUT_MS,
        allowCredentials: [{ id: credentialId, type: 'public-key' }],
      },
    });

    const credentialIdBuffer = base64url.toBuffer(authResponse.id);
    const keyData = await k.findKeyDataByCredentialId(credentialIdBuffer);

    const signer: Signer = {
      tag: 'External',
      values: [k.webauthnVerifierAddress, keyData],
    };

    const rawSignature = base64url.toBuffer(authResponse.response.signature);
    const compactedSignature = compactSignature(rawSignature);

    const webAuthnSigData = {
      authenticator_data: base64url.toBuffer(authResponse.response.authenticatorData),
      client_data: base64url.toBuffer(authResponse.response.clientDataJSON),
      signature: Buffer.from(compactedSignature),
    };

    authPayload.context_rule_ids = contextRuleIds;
    upsertAuthPayloadSigner(authPayload, signer, buildWebAuthnSignatureBytes(webAuthnSigData));
    credentials.signature(writeAuthPayload(authPayload));

    await k.storage.update(credentialId, { lastUsedAt: Date.now() });
    return normalizedEntry;
  };
}
