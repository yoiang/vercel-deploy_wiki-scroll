import { describe, expect, it } from 'vitest'
import { createFeedStore } from './feedStore.ts'
import { acceptAll, requireImage } from './policy.ts'
import type { FeedCursor, FeedItem } from '../wiki/types.ts'

function item(pageId: number, withImage = true): FeedItem {
  return {
    id: `fake:${pageId}`,
    pageId,
    title: `Article ${pageId}`,
    updatedAt: new Date('2026-09-17T10:00:00Z'),
    summary: 'A summary.',
    image: withImage ? { url: 'https://example.org/a.jpg', width: 800, height: 600 } : undefined,
  }
}

/** A cursor factory yielding the given batches in order, then null. */
function fakeCursors(batches: FeedItem[][]): {
  open: () => FeedCursor
  batchesRequested: () => number
} {
  let requested = 0
  const cursor: FeedCursor = {
    async next() {
      if (requested >= batches.length) return null
      return batches[requested++]!
    },
  }
  return { open: () => cursor, batchesRequested: () => requested }
}

function failingCursor(): () => FeedCursor {
  return () => ({
    async next(): Promise<FeedItem[] | null> {
      throw new Error('network down')
    },
  })
}

describe('createFeedStore', () => {
  it('starts empty and idle', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('appends accepted items on loadMore', async () => {
    const store = createFeedStore(fakeCursors([[item(1), item(2)]]).open, acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2])
  })

  it('filters items rejected by the policy', async () => {
    const batch = [item(1, true), item(2, false), item(3, true)]
    const store = createFeedStore(fakeCursors([batch]).open, requireImage)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 3])
  })

  it('deduplicates items already in the feed', async () => {
    const store = createFeedStore(
      fakeCursors([
        [item(1), item(2)],
        [item(2), item(3)],
      ]).open,
      acceptAll,
    )
    await store.loadMore()
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2, 3])
  })

  it('deduplicates within a single batch', async () => {
    const store = createFeedStore(fakeCursors([[item(1), item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('keeps pulling batches until the target is met', async () => {
    // Four batches of 3 accepted items; target is 10, so it needs four batches.
    const cursors = fakeCursors([
      [item(1), item(2), item(3)],
      [item(4), item(5), item(6)],
      [item(7), item(8), item(9)],
      [item(10), item(11), item(12)],
    ])
    const store = createFeedStore(cursors.open, acceptAll)
    await store.loadMore()
    expect(store.items().length).toBeGreaterThanOrEqual(10)
    expect(cursors.batchesRequested()).toBe(4)
  })

  it('stops at the batch cap even when the target is unmet', async () => {
    // Ten batches of one rejected item each. Target can never be met.
    const cursors = fakeCursors(Array.from({ length: 10 }, (_, n) => [item(n + 1, false)]))
    const store = createFeedStore(cursors.open, requireImage)
    await store.loadMore()
    expect(cursors.batchesRequested()).toBe(5)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('becomes exhausted when the cursor runs dry', async () => {
    const store = createFeedStore(fakeCursors([[item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('exhausted')
  })

  it('does nothing further once exhausted', async () => {
    const cursors = fakeCursors([[item(1)]])
    const store = createFeedStore(cursors.open, acceptAll)
    await store.loadMore()
    const batchesAfterFirst = cursors.batchesRequested()
    await store.loadMore()
    expect(cursors.batchesRequested()).toBe(batchesAfterFirst)
  })

  it('enters error status when the cursor throws', async () => {
    const store = createFeedStore(failingCursor(), acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.error()?.message).toBe('network down')
  })

  it('keeps already-loaded items when a later load fails', async () => {
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        if (calls === 1) return [item(1)]
        throw new Error('network down')
      },
    })
    const store = createFeedStore(open, acceptAll)
    await store.loadMore()
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('retry clears the error and loads again', async () => {
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        if (calls === 1) throw new Error('network down')
        return [item(1)]
      },
    })
    const store = createFeedStore(open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    await store.retry()
    expect(store.error()).toBeNull()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('ignores a concurrent loadMore while one is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const open = (): FeedCursor => ({
      async next(): Promise<FeedItem[] | null> {
        calls++
        await gate
        return null
      },
    })
    const store = createFeedStore(open, acceptAll)
    const first = store.loadMore()
    const second = store.loadMore()
    release()
    await Promise.all([first, second])
    expect(calls).toBe(1)
  })

  it('remembers a scroll offset', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    store.setScrollOffset(420)
    expect(store.scrollOffset()).toBe(420)
  })

  /**
   * Regression: a real async generator is dead once it throws — every later
   * next() returns { done: true }. A cursor backed by one therefore reports
   * exhaustion forever, so reusing it after a failure turns a transient
   * network error into a permanent "end of feed". The store must discard a
   * cursor that errored and open a fresh one on retry.
   */
  it('opens a fresh cursor after a failure instead of reusing the dead one', async () => {
    let cursorsOpened = 0
    const open = (): FeedCursor => {
      cursorsOpened++
      const failsImmediately = cursorsOpened === 1
      let dead = false
      return {
        async next(): Promise<FeedItem[] | null> {
          // Generator semantics: once it has thrown, it is done forever.
          if (dead) return null
          if (failsImmediately) {
            dead = true
            throw new Error('network down')
          }
          dead = true
          return [item(1)]
        },
      }
    }

    const store = createFeedStore(open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')

    await store.retry()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
    expect(cursorsOpened).toBe(2)
  })
})

describe('feedStore reset', () => {
  it('clears items', async () => {
    const store = createFeedStore(fakeCursors([[item(1), item(2)]]).open, acceptAll)
    await store.loadMore()
    store.reset()
    expect(store.items()).toEqual([])
  })

  it('returns to idle from exhausted', async () => {
    const store = createFeedStore(fakeCursors([[item(1)]]).open, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('exhausted')
    store.reset()
    expect(store.status()).toBe('idle')
  })

  it('clears the scroll offset', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    store.setScrollOffset(500)
    store.reset()
    expect(store.scrollOffset()).toBe(0)
  })

  it('clears the dedupe set, so the same items can load again', async () => {
    // Each call gets a fresh cursor yielding the same item. Without clearing
    // seenIds, the second load would dedupe it away and leave an empty feed.
    const open = (): FeedCursor => {
      let done = false
      return {
        async next() {
          if (done) return null
          done = true
          return [item(1)]
        },
      }
    }
    const store = createFeedStore(open, acceptAll)
    await store.loadMore()
    store.reset()
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('opens a fresh cursor after reset', async () => {
    let opened = 0
    const open = (): FeedCursor => {
      opened++
      let done = false
      return {
        async next() {
          if (done) return null
          done = true
          return [item(opened)]
        },
      }
    }
    const store = createFeedStore(open, acceptAll)
    await store.loadMore()
    store.reset()
    await store.loadMore()
    expect(opened).toBe(2)
  })

  it('clears source errors', async () => {
    const store = createFeedStore(failingCursor(), acceptAll)
    await store.loadMore()
    store.reset()
    expect(store.sourceErrors()).toEqual([])
    expect(store.error()).toBeNull()
  })
})

describe('feedStore sourceErrors', () => {
  it('starts empty', () => {
    expect(createFeedStore(fakeCursors([]).open, acceptAll).sourceErrors()).toEqual([])
  })

  it('records a reported source error', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    expect(store.sourceErrors().map((e) => e.siteId)).toEqual(['wikipedia:ja'])
  })

  it('does not duplicate a repeated error for the same site', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    store.noteSourceError('wikipedia:ja', new Error('still down'))
    expect(store.sourceErrors()).toHaveLength(1)
  })

  it('clears a site on recovery', () => {
    const store = createFeedStore(fakeCursors([]).open, acceptAll)
    store.noteSourceError('wikipedia:ja', new Error('down'))
    store.noteSourceError('wikipedia:de', new Error('down'))
    store.noteSourceRecovered('wikipedia:ja')
    expect(store.sourceErrors().map((e) => e.siteId)).toEqual(['wikipedia:de'])
  })
})
