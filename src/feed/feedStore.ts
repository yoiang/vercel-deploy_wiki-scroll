import { createSignal } from 'solid-js'
import type { FeedCursor, FeedItem } from '../wiki/types.ts'
import type { FeedPolicy } from './policy.ts'

export type FeedStatus = 'idle' | 'loading' | 'exhausted' | 'error'

/** How many accepted items one loadMore() aims to add. */
export const TARGET_ITEMS_PER_LOAD = 10

/**
 * Hard cap on cursor batches consumed per loadMore(). Without this, a long run
 * of policy-rejected items (e.g. imageless articles) would spin indefinitely.
 */
export const MAX_BATCHES_PER_LOAD = 5

export interface FeedStore {
  items: () => FeedItem[]
  status: () => FeedStatus
  error: () => Error | null
  sourceErrors: () => Array<{ siteId: string; error: Error }>
  scrollOffset: () => number
  setScrollOffset: (offset: number) => void
  loadMore: () => Promise<void>
  retry: () => Promise<void>
  reset: () => void
  /** Fed by the cursor factory's onSourceError / onSourceRecovered hooks. */
  noteSourceError: (siteId: string, sourceError: Error) => void
  noteSourceRecovered: (siteId: string) => void
}

/**
 * The feed's accumulated items and pagination state. Deals only in cursors —
 * it has no knowledge of wikis, sources, or how many of them there are.
 */
export function createFeedStore(openCursor: () => FeedCursor, policy: FeedPolicy): FeedStore {
  const [items, setItems] = createSignal<FeedItem[]>([])
  const [status, setStatus] = createSignal<FeedStatus>('idle')
  const [error, setError] = createSignal<Error | null>(null)
  const [sourceErrors, setSourceErrors] = createSignal<Array<{ siteId: string; error: Error }>>([])
  const [scrollOffset, setScrollOffset] = createSignal(0)

  let seenIds = new Set<string>()
  let cursor: FeedCursor | null = null
  let inFlight = false

  function currentCursor(): FeedCursor {
    cursor ??= openCursor()
    return cursor
  }

  async function loadMore(): Promise<void> {
    if (inFlight) return
    if (status() === 'exhausted' || status() === 'error') return

    inFlight = true
    setStatus('loading')

    // Declared outside the try so that a failure partway through a multi-batch
    // load still commits the batches that did succeed. Without this, one bad
    // request discards up to four batches of good items.
    const accepted: FeedItem[] = []

    try {
      let batches = 0
      let exhausted = false

      while (accepted.length < TARGET_ITEMS_PER_LOAD && batches < MAX_BATCHES_PER_LOAD) {
        const batch = await currentCursor().next()
        batches++

        if (batch === null) {
          exhausted = true
          break
        }

        for (const candidate of batch) {
          if (seenIds.has(candidate.id)) continue
          if (!policy.accept(candidate)) continue
          seenIds.add(candidate.id)
          accepted.push(candidate)
        }
      }

      setStatus(exhausted ? 'exhausted' : 'idle')
    } catch (cause) {
      // Discard the cursor. A cursor backed by an async generator is dead once
      // it throws — every later next() returns { done: true }, which reads as
      // exhaustion. Reusing it would turn a transient network error into a
      // permanent "end of feed"; the next load opens a fresh cursor instead.
      cursor = null
      setError(cause instanceof Error ? cause : new Error(String(cause)))
      setStatus('error')
    } finally {
      if (accepted.length > 0) {
        setItems((previous) => [...previous, ...accepted])
      }
      inFlight = false
    }
  }

  async function retry(): Promise<void> {
    if (status() !== 'error') return
    setError(null)
    setStatus('idle')
    await loadMore()
  }

  /** Everything loaded is invalid — for instance when the followed set changes. */
  function reset(): void {
    cursor = null
    seenIds = new Set<string>()
    setItems([])
    setStatus('idle')
    setError(null)
    setSourceErrors([])
    setScrollOffset(0)
  }

  function noteSourceError(siteId: string, sourceError: Error): void {
    setSourceErrors((previous) => [
      ...previous.filter((entry) => entry.siteId !== siteId),
      { siteId, error: sourceError },
    ])
  }

  function noteSourceRecovered(siteId: string): void {
    setSourceErrors((previous) => previous.filter((entry) => entry.siteId !== siteId))
  }

  return {
    items,
    status,
    error,
    sourceErrors,
    scrollOffset,
    setScrollOffset,
    loadMore,
    retry,
    reset,
    noteSourceError,
    noteSourceRecovered,
  }
}
