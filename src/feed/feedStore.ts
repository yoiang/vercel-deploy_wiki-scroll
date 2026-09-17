import { createSignal } from 'solid-js'
import type { FeedCursor, FeedItem, WikiSource } from '../wiki/types.ts'
import type { FeedPolicy } from './policy.ts'

export type FeedStatus = 'idle' | 'loading' | 'exhausted' | 'error'

/** How many accepted items one loadMore() aims to add. */
export const TARGET_ITEMS_PER_LOAD = 10

/**
 * Hard cap on API batches consumed per loadMore(). Without this, a long run of
 * policy-rejected items (e.g. imageless articles) would spin indefinitely.
 */
export const MAX_BATCHES_PER_LOAD = 5

export interface FeedStore {
  items: () => FeedItem[]
  status: () => FeedStatus
  error: () => Error | null
  scrollOffset: () => number
  setScrollOffset: (offset: number) => void
  loadMore: () => Promise<void>
  retry: () => Promise<void>
}

export function createFeedStore(source: WikiSource, policy: FeedPolicy): FeedStore {
  const [items, setItems] = createSignal<FeedItem[]>([])
  const [status, setStatus] = createSignal<FeedStatus>('idle')
  const [error, setError] = createSignal<Error | null>(null)
  const [scrollOffset, setScrollOffset] = createSignal(0)

  const seenIds = new Set<string>()
  let cursor: FeedCursor | null = null
  let inFlight = false

  function openCursor(): FeedCursor {
    cursor ??= source.openFeed({ sort: 'recently-updated', pageSize: TARGET_ITEMS_PER_LOAD })
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
        const batch = await openCursor().next()
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

  return { items, status, error, scrollOffset, setScrollOffset, loadMore, retry }
}
