import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getTotalStaked, getStake, getPendingRewards, getStkrBalance,
  stakeXlm, unstakeXlm, claimRewards, fetchPoolEvents, POOL_ID
} from './lib/contract.js'
import { connectWallet, disconnectWallet, classifyError } from './lib/wallets.js'
import { cacheGet, cacheSet, cacheDelete } from './lib/cache.js'
import StakePanel from './components/StakePanel.jsx'
import RewardsPanel from './components/RewardsPanel.jsx'
import EventFeed from './components/EventFeed.jsx'
import TxToast from './components/TxToast.jsx'

const REFRESH_INTERVAL = 15_000
const REWARDS_INTERVAL = 10_000

export default function App() {
  const [address, setAddress]     = useState(null)
  const [tab, setTab]             = useState('stake')
  const [toast, setToast]         = useState(null)
  const [events, setEvents]       = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const [poolStats, setPoolStats] = useState({ totalStaked: 0 })
  const [userStats, setUserStats] = useState({ staked: 0, pending: 0, stkrBalance: 0 })
  const [loading, setLoading]     = useState({ stake: false, unstake: false, claim: false })

  const pollRef    = useRef(null)
  const rewardRef  = useRef(null)

  // ── data loading ──────────────────────────────────────────────────────────

  const loadUserStats = useCallback(async (pk) => {
    const cacheKey = `stats_${pk}`
    const cached = cacheGet(cacheKey)
    if (cached) { setUserStats(cached); return }
    try {
      const [staked, pending, stkrBalance, totalStaked] = await Promise.all([
        getStake(pk),
        getPendingRewards(pk),
        getStkrBalance(pk),
        getTotalStaked(pk),
      ])
      const stats = {
        staked:      Number(staked)      || 0,
        pending:     Number(pending)     || 0,
        stkrBalance: Number(stkrBalance) || 0,
      }
      setUserStats(stats)
      setPoolStats({ totalStaked: Number(totalStaked) || 0 })
      cacheSet(cacheKey, stats, 15_000)
    } catch (err) {
      console.error('loadUserStats', err)
    }
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    const evts = await fetchPoolEvents()
    setEvents(evts)
    setEventsLoading(false)
  }, [])

  // Tick pending rewards locally between blockchain refreshes
  const tickRewards = useCallback(() => {
    if (!address) return
    setUserStats(prev => {
      if (prev.staked === 0) return prev
      // rate=10, denom=1200, interval=10s → delta = staked * 10 * 10 / 1200
      const delta = Math.floor((prev.staked * 10 * (REWARDS_INTERVAL / 1000)) / 1200)
      return { ...prev, pending: prev.pending + delta }
    })
  }, [address])

  useEffect(() => {
    if (!address) return
    loadUserStats(address)
    loadEvents()

    pollRef.current   = setInterval(() => loadUserStats(address), REFRESH_INTERVAL)
    rewardRef.current = setInterval(tickRewards, REWARDS_INTERVAL)

    return () => {
      clearInterval(pollRef.current)
      clearInterval(rewardRef.current)
    }
  }, [address, loadUserStats, loadEvents, tickRewards])

  // ── wallet ────────────────────────────────────────────────────────────────

  async function handleConnect() {
    try {
      const addr = await connectWallet()
      setAddress(addr)
    } catch (err) {
      const e = classifyError(err)
      showToast('error', e.message)
    }
  }

  async function handleDisconnect() {
    await disconnectWallet()
    setAddress(null)
    setUserStats({ staked: 0, pending: 0, stkrBalance: 0 })
    setPoolStats({ totalStaked: 0 })
    clearInterval(pollRef.current)
    clearInterval(rewardRef.current)
  }

  // ── tx helpers ────────────────────────────────────────────────────────────

  function showToast(type, message, hash) {
    setToast({ type, message, hash })
    if (type !== 'pending') setTimeout(() => setToast(null), 6000)
  }

  function invalidateCache() {
    cacheDelete(`stats_${address}`)
  }

  async function runTx(key, fn) {
    setLoading(l => ({ ...l, [key]: true }))
    showToast('pending')
    try {
      const { hash } = await fn()
      invalidateCache()
      await loadUserStats(address)
      showToast('success', null, hash)
    } catch (err) {
      const e = classifyError(err)
      showToast('error', e.message)
    } finally {
      setLoading(l => ({ ...l, [key]: false }))
    }
  }

  const handleStake   = amount => runTx('stake',   () => stakeXlm(address, amount))
  const handleUnstake = amount => runTx('unstake', () => unstakeXlm(address, amount))
  const handleClaim   = ()     => runTx('claim',   () => claimRewards(address))

  // ── render ────────────────────────────────────────────────────────────────

  const totalXlm = (poolStats.totalStaked / 10_000_000).toFixed(2)

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">◆</span>
            <span className="brand-name">StellarStake</span>
          </div>
          <div className="header-right">
            {address ? (
              <div className="wallet-info">
                <span className="wallet-addr">
                  {address.slice(0, 4)}…{address.slice(-4)}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleConnect}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero / Stats bar */}
      <section className="hero">
        <h1 className="hero-title">Stake XLM. Earn STKR.</h1>
        <p className="hero-sub">
          Lock XLM in the on-chain pool. Rewards accrue every second via inter-contract call.
        </p>
        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">Total Staked</span>
            <span className="stat-value">{totalXlm} <span className="stat-unit">XLM</span></span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Reward Token</span>
            <span className="stat-value">STKR</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Daily Rate</span>
            <span className="stat-value">720 <span className="stat-unit">STKR/XLM</span></span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Network</span>
            <span className="stat-value">Testnet</span>
          </div>
        </div>
      </section>

      {!address ? (
        <div className="connect-prompt">
          <div className="connect-card">
            <span className="connect-icon">◆</span>
            <h2>Connect your wallet to start staking</h2>
            <p>Supports Freighter, xBull, and LOBSTR wallets</p>
            <button className="btn btn-primary btn-lg" onClick={handleConnect}>
              Connect Wallet
            </button>
          </div>
        </div>
      ) : (
        <main className="main">
          {/* Tab nav */}
          <nav className="tab-nav">
            {['stake', 'rewards', 'events'].map(t => (
              <button
                key={t}
                className={`tab-btn${tab === t ? ' tab-btn--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'stake'   ? '⬡ Stake / Unstake' :
                 t === 'rewards' ? '✦ Rewards'          :
                                   '⟳ Live Events'}
              </button>
            ))}
          </nav>

          {/* User summary strip */}
          <div className="user-strip">
            <div className="user-stat">
              <span>Staked</span>
              <strong>{(userStats.staked / 10_000_000).toFixed(4)} XLM</strong>
            </div>
            <div className="user-stat">
              <span>Pending</span>
              <strong className="pending-glow">
                {(userStats.pending / 10_000_000).toFixed(4)} STKR
              </strong>
            </div>
            <div className="user-stat">
              <span>STKR Balance</span>
              <strong>{(userStats.stkrBalance / 10_000_000).toFixed(4)} STKR</strong>
            </div>
          </div>

          {/* Tab panels */}
          <div className="tab-content">
            {tab === 'stake' && (
              <StakePanel
                staked={userStats.staked}
                onStake={handleStake}
                onUnstake={handleUnstake}
                loading={loading}
              />
            )}
            {tab === 'rewards' && (
              <RewardsPanel
                pending={userStats.pending}
                stkrBalance={userStats.stkrBalance}
                onClaim={handleClaim}
                loading={loading}
              />
            )}
            {tab === 'events' && (
              <EventFeed events={events} loading={eventsLoading} />
            )}
          </div>
        </main>
      )}

      {/* Contract info footer */}
      {POOL_ID && (
        <footer className="footer">
          <span className="footer-label">Pool Contract:</span>
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${POOL_ID}`}
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            {POOL_ID.slice(0, 8)}…{POOL_ID.slice(-8)}
          </a>
        </footer>
      )}

      <TxToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
