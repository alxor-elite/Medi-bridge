/**
 * Presentation formatters. Centralised so distance / ETA / dates read the
 * same everywhere in the app.
 */

export function formatDistance(km) {
  if (km == null) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function formatEta(minutes) {
  if (minutes == null) return '—'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export function formatCurrency(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-IN').format(value)
}

export function formatDate(input) {
  if (!input) return '—'
  const d = new Date(input)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(input) {
  if (!input) return '—'
  const d = new Date(input)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Relative time such as "2 min ago" / "in 3 days". */
export function timeAgo(input) {
  if (!input) return '—'
  const then = new Date(input).getTime()
  const now = Date.now()
  const diffSec = Math.round((now - then) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  for (const [unit, secs] of units) {
    if (abs >= secs || unit === 'second') {
      const value = Math.round(-diffSec / secs)
      return rtf.format(value, unit)
    }
  }
  return 'just now'
}

/** Whole days from now until the given date (negative = past). */
export function daysUntil(input) {
  if (!input) return null
  const target = new Date(input).getTime()
  const now = Date.now()
  return Math.ceil((target - now) / 86400000)
}

export function pluralize(count, singular, plural) {
  const word = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${formatNumber(count)} ${word}`
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}
