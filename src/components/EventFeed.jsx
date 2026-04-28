export default function EventFeed({ events, loading }) {
  if (loading) {
    return (
      <div className="panel">
        <h2 className="panel-title">Live Events</h2>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="event-skeleton" />
        ))}
      </div>
    )
  }

  return (
    <div className="panel">
      <h2 className="panel-title">
        Live Events
        <span className="live-dot" title="Updates every 15s" />
      </h2>
      {events.length === 0 ? (
        <p className="empty-events">No events yet. Stake XLM to get started.</p>
      ) : (
        <ul className="event-list">
          {events.map(ev => (
            <li key={ev.id} className={`event-item event-item--${ev.type}`}>
              <span className={`event-badge event-badge--${ev.type}`}>
                {ev.type === 'stake'   ? '↑ Stake'   :
                 ev.type === 'unstake' ? '↓ Unstake' :
                 ev.type === 'claim'   ? '✦ Claim'   :
                 ev.type === 'mint'    ? '✦ Mint'    : ev.type}
              </span>
              <span className="event-time">
                {ev.time ? new Date(ev.time).toLocaleTimeString() : `Ledger ${ev.ledger}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
