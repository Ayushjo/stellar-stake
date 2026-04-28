export default function TxToast({ toast, onDismiss }) {
  if (!toast) return null
  const explorerBase = 'https://stellar.expert/explorer/testnet/tx/'

  return (
    <div className={`tx-toast tx-toast--${toast.type}`} role="alert">
      <div className="toast-body">
        {toast.type === 'pending' && <span className="toast-spinner" />}
        {toast.type === 'success' && <span className="toast-icon">✓</span>}
        {toast.type === 'error'   && <span className="toast-icon toast-icon--err">✕</span>}
        <div className="toast-text">
          <span className="toast-title">
            {toast.type === 'pending' ? 'Waiting for confirmation…' :
             toast.type === 'success' ? 'Transaction confirmed' : 'Transaction failed'}
          </span>
          {toast.message && <span className="toast-msg">{toast.message}</span>}
          {toast.hash && (
            <a
              href={explorerBase + toast.hash}
              target="_blank"
              rel="noreferrer"
              className="toast-link"
            >
              View on Explorer ↗
            </a>
          )}
        </div>
        <button className="toast-close" onClick={onDismiss}>✕</button>
      </div>
      {toast.type === 'pending' && <div className="toast-progress" />}
    </div>
  )
}
