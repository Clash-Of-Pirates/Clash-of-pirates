import { rpc, xdr } from '@stellar/stellar-sdk';
import { Api } from '@stellar/stellar-sdk/rpc';
import { RPC_URL } from '@/utils/constants';

let server: rpc.Server | null = null;

function getServer(): rpc.Server {
  if (!server) {
    server = new rpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
  }
  return server;
}

/** Max fee (stroops) encoded in the transaction envelope (authorization cap). */
export function maxFeeStroopsFromEnvelope(env: xdr.TransactionEnvelope): bigint | null {
  try {
    const sw = env.switch();
    if (sw === xdr.EnvelopeType.envelopeTypeTxV0()) {
      return BigInt(env.v0().tx().fee().toString());
    }
    if (sw === xdr.EnvelopeType.envelopeTypeTx()) {
      return BigInt(env.v1().tx().fee().toString());
    }
    if (sw === xdr.EnvelopeType.envelopeTypeTxFeeBump()) {
      return BigInt(env.feeBump().tx().fee().toString());
    }
  } catch {
    return null;
  }
  return null;
}

export type PolledTxMeta = {
  status: 'pending' | 'success' | 'failed' | 'not_found';
  feeStroops: string | null;
  ledger: number | null;
};

export async function pollTransactionMeta(txHash: string): Promise<PolledTxMeta> {
  const res = await getServer().getTransaction(txHash);

  if (res.status === Api.GetTransactionStatus.NOT_FOUND) {
    return { status: 'pending', feeStroops: null, ledger: null };
  }

  if (res.status === Api.GetTransactionStatus.FAILED) {
    let fee: bigint | null = null;
    try {
      fee = maxFeeStroopsFromEnvelope(res.envelopeXdr);
    } catch {
      fee = null;
    }
    return {
      status: 'failed',
      feeStroops: fee != null ? fee.toString() : null,
      ledger: res.ledger ?? null,
    };
  }

  if (res.status !== Api.GetTransactionStatus.SUCCESS) {
    return { status: 'pending', feeStroops: null, ledger: null };
  }

  let fee: bigint | null = null;
  try {
    fee = maxFeeStroopsFromEnvelope(res.envelopeXdr);
  } catch {
    fee = null;
  }

  return {
    status: 'success',
    feeStroops: fee != null ? fee.toString() : null,
    ledger: res.ledger ?? null,
  };
}
