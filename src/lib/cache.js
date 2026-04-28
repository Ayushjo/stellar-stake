const PREFIX = 'stellar_stake_'

export function cacheSet(key, value, ttl = 20_000) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ value, expires: Date.now() + ttl }))
  } catch {}
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { value, expires } = JSON.parse(raw)
    if (Date.now() > expires) { localStorage.removeItem(PREFIX + key); return null }
    return value
  } catch { return null }
}

export function cacheDelete(key) {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}
