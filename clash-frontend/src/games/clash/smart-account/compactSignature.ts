/**
 * DER ECDSA (P-256) → compact low-S, same as smart-account-kit internal utils.
 */
export function compactSignature(derSignature: Buffer | Uint8Array): Uint8Array {
  const der = Buffer.from(derSignature);
  let offset = 2;
  const rLength = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  const sLength = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLength);
  const rBigInt = BigInt(`0x${r.toString('hex')}`);
  let sBigInt = BigInt(`0x${s.toString('hex')}`);
  const n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const halfN = n / 2n;
  if (sBigInt > halfN) {
    sBigInt = n - sBigInt;
  }
  const rPadded = Buffer.from(rBigInt.toString(16).padStart(64, '0'), 'hex');
  const sLowS = Buffer.from(sBigInt.toString(16).padStart(64, '0'), 'hex');
  return new Uint8Array(Buffer.concat([rPadded, sLowS]));
}
