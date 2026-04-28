import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit'
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull'
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr'

export const WALLET_NETWORK = Networks.TESTNET

let initialized = false

export function initKit() {
  if (initialized) return
  StellarWalletsKit.init({
    network: WALLET_NETWORK,
    modules: [new FreighterModule(), new xBullModule(), new LobstrModule()],
  })
  initialized = true
}

export async function connectWallet() {
  initKit()
  const { address } = await StellarWalletsKit.authModal({})
  return address
}

export async function disconnectWallet() {
  await StellarWalletsKit.disconnect()
}

export async function signTx(xdr, publicKey) {
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address: publicKey,
    networkPassphrase: WALLET_NETWORK,
  })
  return signedTxXdr
}

export function classifyError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('not found') || msg.includes('no wallet') || msg.includes('extension'))
    return { type: 'WALLET_NOT_FOUND', message: 'Wallet extension not found. Install Freighter, xBull, or LOBSTR.' }
  if (msg.includes('rejected') || msg.includes('declined') || msg.includes('cancelled') || msg.includes('closed'))
    return { type: 'USER_REJECTED', message: 'You cancelled the transaction.' }
  if (msg.includes('insufficient') || msg.includes('balance'))
    return { type: 'INSUFFICIENT_FUNDS', message: 'Insufficient XLM balance.' }
  if (err?.code === 'TX_TIMEOUT')
    return { type: 'TX_TIMEOUT', message: 'Transaction timed out. Try again.' }
  if (err?.code === 'CONTRACT_ERROR')
    return { type: 'CONTRACT_ERROR', message: err.message }
  return { type: 'UNKNOWN', message: err?.message || 'An unexpected error occurred.' }
}
