import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime.ts'

const now = new Date('2026-09-17T12:00:00Z')

function ago(milliseconds: number): Date {
  return new Date(now.getTime() - milliseconds)
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatRelativeTime', () => {
  it('describes the last minute as "just now"', () => {
    expect(formatRelativeTime(ago(30 * SECOND), now)).toBe('just now')
  })

  it('describes a single minute', () => {
    expect(formatRelativeTime(ago(1 * MINUTE), now)).toBe('1 minute ago')
  })

  it('pluralises minutes', () => {
    expect(formatRelativeTime(ago(5 * MINUTE), now)).toBe('5 minutes ago')
  })

  it('describes a single hour', () => {
    expect(formatRelativeTime(ago(1 * HOUR), now)).toBe('1 hour ago')
  })

  it('pluralises hours', () => {
    expect(formatRelativeTime(ago(4 * HOUR), now)).toBe('4 hours ago')
  })

  it('describes a single day', () => {
    expect(formatRelativeTime(ago(1 * DAY), now)).toBe('1 day ago')
  })

  it('pluralises days', () => {
    expect(formatRelativeTime(ago(3 * DAY), now)).toBe('3 days ago')
  })

  it('falls back to an absolute date beyond a week', () => {
    expect(formatRelativeTime(new Date('2026-01-05T12:00:00Z'), now)).toBe('5 Jan 2026')
  })

  it('treats a future timestamp as "just now" rather than negative', () => {
    expect(formatRelativeTime(new Date('2026-09-17T12:00:30Z'), now)).toBe('just now')
  })
})
