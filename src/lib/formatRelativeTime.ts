const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/**
 * Renders a timestamp as a short relative string for the feed.
 * `now` is injectable so tests need not manipulate the system clock.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < WEEK) return plural(Math.floor(elapsed / DAY), 'day')

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
