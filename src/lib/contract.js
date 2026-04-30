import { rpc as SorobanRpc, TransactionBuilder, Networks, Contract, scValToNative, nativeToScVal, Address } from '@stellar/stellar-sdk'
import { signTx } from './wallets.js'

export const POOL_ID    = import.meta.env.VITE_POOL_ID    || ''
export const TOKEN_ID   = import.meta.env.VITE_TOKEN_ID   || ''
export const NATIVE_TOKEN = import.meta.env.VITE_NATIVE_TOKEN || ''

const RPC_URL = 'https://soroban-testnet.stellar.org'
const NETWORK = Networks.TESTNET
const FEE = '100000'

export const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false })

// ─── helpers ────────────────────────────────────────────────────────────────

async function buildTx(publicKey, contractId, method, args = []) {
  const account = await rpc.getAccount(publicKey)
  const op = new Contract(contractId).call(method, ...args)
  return new TransactionBuilder(account, { fee: FEE, networkPassphrase: NETWORK })
    .addOperation(op)
    .setTimeout(300)
    .build()
}

async function queryContract(publicKey, contractId, method, args = []) {
  const tx = await buildTx(publicKey, contractId, method, args)
  const sim = await rpc.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  return scValToNative(sim.result.retval)
}

async function invokeContract(publicKey, contractId, method, args = []) {
  const tx = await buildTx(publicKey, contractId, method, args)
  const sim = await rpc.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const assembled = SorobanRpc.assembleTransaction(tx, sim).build()
  const signedXdr = await signTx(assembled.toXDR(), publicKey)
  const submitted = await rpc.sendTransaction(
    TransactionBuilder.fromXDR(signedXdr, NETWORK)
  )
  if (submitted.status === 'ERROR')
    throw Object.assign(new Error('Transaction failed on submission'), { code: 'CONTRACT_ERROR' })
  return pollTx(submitted.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 40; i++) {
    await sleep(2000)
    const res = await rpc.getTransaction(hash)
    if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS)
      return { hash, result: res.returnValue }
    if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw Object.assign(new Error('Contract call failed'), { code: 'CONTRACT_ERROR', hash })
  }
  throw Object.assign(new Error('Transaction timed out.'), { code: 'TX_TIMEOUT' })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const addr = pk => new Address(pk).toScVal()
const i128 = n => nativeToScVal(BigInt(n), { type: 'i128' })

// ─── pool reads ─────────────────────────────────────────────────────────────

export const getTotalStaked    = pk => queryContract(pk, POOL_ID, 'total_staked', [])
export const getStake          = pk => queryContract(pk, POOL_ID, 'get_stake',    [addr(pk)])
export const getPendingRewards = pk => queryContract(pk, POOL_ID, 'pending_rewards', [addr(pk)])
export const getRewardRate     = pk => queryContract(pk, POOL_ID, 'reward_rate',  [])
export const getStkrBalance    = pk => queryContract(pk, TOKEN_ID, 'balance',     [addr(pk)])

// ─── pool writes ────────────────────────────────────────────────────────────

export const stakeXlm    = (pk, amount) => invokeContract(pk, POOL_ID, 'stake',   [addr(pk), i128(amount)])
export const unstakeXlm  = (pk, amount) => invokeContract(pk, POOL_ID, 'unstake', [addr(pk), i128(amount)])
export const claimRewards = pk          => invokeContract(pk, POOL_ID, 'claim',   [addr(pk)])

// ─── events ─────────────────────────────────────────────────────────────────

export async function fetchPoolEvents() {
  try {
    const latest = await rpc.getLatestLedger()
    const startLedger = Math.max(1, latest.sequence - 17280)
    const res = await rpc.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [POOL_ID] }],
      limit: 25,
    })
    return (res.events || [])
      .map(e => ({
        id: e.id,
        type: scValToNative(e.topic[0]) || 'event',
        ledger: e.ledger,
        time: e.ledgerClosedAt,
      }))
      .reverse()
  } catch {
    return []
  }
}
