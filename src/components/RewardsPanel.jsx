export default function RewardsPanel({ pending, stkrBalance, onClaim, loading }) {
  const pendingFmt = (Number(pending) / 10_000_000).toFixed(4)
  const balanceFmt = (Number(stkrBalance) / 10_000_000).toFixed(4)

  return (
    <div className="panel">
      <h2 className="panel-title">STKR Rewards</h2>

      <div className="rewards-grid">
        <div className="reward-stat">
          <span className="reward-stat__label">Pending Rewards</span>
          <span className="reward-stat__value pending-glow">{pendingFmt}</span>
          <span className="reward-stat__unit">STKR</span>
        </div>
        <div className="reward-stat">
          <span className="reward-stat__label">STKR Balance</span>
          <span className="reward-stat__value">{balanceFmt}</span>
          <span className="reward-stat__unit">STKR</span>
        </div>
      </div>

      <div className="rate-info">
        <span className="rate-badge">⚡ ~720 STKR per XLM per day</span>
        <p className="rate-note">Rewards accrue every second. Claim anytime.</p>
      </div>

      <button
        className={`btn btn-primary btn-full${loading.claim ? ' btn--loading' : ''}`}
        onClick={onClaim}
        disabled={loading.claim || Number(pending) === 0}
      >
        {loading.claim
          ? <><span className="btn-spinner" /> Claiming…</>
          : `Claim ${pendingFmt} STKR`}
      </button>
    </div>
  )
}
