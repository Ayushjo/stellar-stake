import { useState } from 'react'

const STROOP = 10_000_000n

export default function StakePanel({ staked, onStake, onUnstake, loading }) {
  const [stakeAmt, setStakeAmt]   = useState('')
  const [unstakeAmt, setUnstakeAmt] = useState('')

  function handleStake(e) {
    e.preventDefault()
    const xlm = parseFloat(stakeAmt)
    if (!xlm || xlm <= 0) return
    onStake(Math.floor(xlm * 10_000_000))
    setStakeAmt('')
  }

  function handleUnstake(e) {
    e.preventDefault()
    const xlm = parseFloat(unstakeAmt)
    if (!xlm || xlm <= 0) return
    onUnstake(Math.floor(xlm * 10_000_000))
    setUnstakeAmt('')
  }

  const stakedXlm = (Number(staked) / 10_000_000).toFixed(4)

  return (
    <div className="panel">
      <h2 className="panel-title">Stake XLM</h2>

      <div className="staked-display">
        <span className="staked-label">Your Stake</span>
        <span className="staked-value">{stakedXlm} <span className="unit">XLM</span></span>
      </div>

      <form className="stake-form" onSubmit={handleStake}>
        <label className="form-label">Amount to stake</label>
        <div className="input-row">
          <input
            className="form-input"
            type="number"
            min="0.0000001"
            step="1"
            placeholder="10"
            value={stakeAmt}
            onChange={e => setStakeAmt(e.target.value)}
          />
          <span className="input-unit">XLM</span>
        </div>
        <div className="preset-row">
          {[10, 50, 100].map(n => (
            <button
              key={n}
              type="button"
              className="preset-btn"
              onClick={() => setStakeAmt(String(n))}
            >
              {n} XLM
            </button>
          ))}
        </div>
        <button
          type="submit"
          className={`btn btn-primary${loading.stake ? ' btn--loading' : ''}`}
          disabled={loading.stake || loading.unstake}
        >
          {loading.stake ? <><span className="btn-spinner" /> Staking…</> : 'Stake XLM'}
        </button>
      </form>

      <div className="divider" />

      <form className="stake-form" onSubmit={handleUnstake}>
        <label className="form-label">Amount to unstake</label>
        <div className="input-row">
          <input
            className="form-input"
            type="number"
            min="0.0000001"
            step="1"
            placeholder="10"
            value={unstakeAmt}
            onChange={e => setUnstakeAmt(e.target.value)}
          />
          <span className="input-unit">XLM</span>
        </div>
        <button
          type="button"
          className="preset-btn preset-btn--max"
          onClick={() => setUnstakeAmt(stakedXlm)}
        >
          Max
        </button>
        <button
          type="submit"
          className={`btn btn-secondary${loading.unstake ? ' btn--loading' : ''}`}
          disabled={loading.stake || loading.unstake || staked === 0}
        >
          {loading.unstake ? <><span className="btn-spinner" /> Unstaking…</> : 'Unstake & Claim'}
        </button>
      </form>
    </div>
  )
}
