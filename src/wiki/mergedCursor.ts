import type { FeedCursor, FeedItem } from './types.ts'

export interface MergedCursorChild {
  siteId: string
  open: () => FeedCursor
}

export interface MergedCursorOptions {
  concurrency?: number
  maxConsecutiveFailures?: number
  onSourceError?: (siteId: string, error: Error) => void
  onSourceRecovered?: (siteId: string) => void
}

export const DEFAULT_CONCURRENCY = 6
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3

interface ChildState {
  siteId: string
  open: () => FeedCursor
  cursor: FeedCursor | null
  buffer: FeedItem[]
  exhausted: boolean
  failures: number
}

/**
 * Combines several FeedCursors into one, emitting the globally newest item
 * across them. Implements FeedCursor itself, so feedStore needs no knowledge
 * of multi-source feeds.
 *
 * Batches are often small — a batch ends as soon as any healthy child's buffer
 * empties, because the merge cannot know whether that child's next batch holds
 * something newer. feedStore calls next() repeatedly and accumulates, so this
 * costs nothing in practice.
 */
export function createMergedCursor(
  children: MergedCursorChild[],
  options: MergedCursorOptions = {},
): FeedCursor {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const maxFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES

  const states: ChildState[] = children.map((child) => ({
    siteId: child.siteId,
    open: child.open,
    cursor: null,
    buffer: [],
    exhausted: false,
    failures: 0,
  }))

  let lastError: Error | null = null

  const givenUp = (state: ChildState): boolean => state.failures >= maxFailures

  /** Healthy: still expected to produce items, so the merge must wait for it. */
  const healthy = (state: ChildState): boolean => !state.exhausted && state.failures === 0

  async function advance(state: ChildState): Promise<void> {
    const wasFailing = state.failures > 0
    try {
      // A cursor that threw is dead — every later next() returns done — so a
      // failed child is reopened rather than resumed.
      state.cursor ??= state.open()
      const batch = await state.cursor.next()

      if (batch === null) {
        state.exhausted = true
      } else {
        state.buffer.push(...batch)
      }

      if (wasFailing) {
        state.failures = 0
        options.onSourceRecovered?.(state.siteId)
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      state.cursor = null
      state.failures += 1
      lastError = error
      options.onSourceError?.(state.siteId, error)
    }
  }

  async function topUp(): Promise<void> {
    const pending = states.filter(
      (state) => !state.exhausted && !givenUp(state) && state.buffer.length === 0,
    )

    for (let start = 0; start < pending.length; start += concurrency) {
      await Promise.all(pending.slice(start, start + concurrency).map(advance))
    }
  }

  function emit(): FeedItem[] {
    const batch: FeedItem[] = []

    for (;;) {
      // An item can only be emitted while every healthy child has something
      // buffered — an empty one might be holding something newer.
      if (states.some((state) => healthy(state) && state.buffer.length === 0)) break

      const contributing = states.filter((state) => state.buffer.length > 0)
      if (contributing.length === 0) break

      let newest = contributing[0]!
      for (const state of contributing) {
        if (state.buffer[0]!.updatedAt.getTime() > newest.buffer[0]!.updatedAt.getTime()) {
          newest = state
        }
      }

      batch.push(newest.buffer.shift()!)
    }

    return batch
  }

  return {
    async next(): Promise<FeedItem[] | null> {
      if (states.length === 0) return null

      await topUp()

      const batch = emit()
      if (batch.length > 0) return batch

      if (states.every((state) => state.exhausted)) return null

      // Nothing healthy produced anything, so every non-exhausted child is
      // failing. Reporting null here would claim the feed had ended.
      throw lastError ?? new Error('Every followed wiki failed to load')
    },
  }
}
