import { describe, expect, it, vi } from 'vitest'
import { createMergedCursor } from './mergedCursor.ts'
import type { FeedCursor, FeedItem } from './types.ts'

/** An item whose id and timestamp are both derived from `minute`. */
function item(siteId: string, minute: number): FeedItem {
  return {
    id: `${siteId}:${minute}`,
    pageId: minute,
    title: `${siteId} @${minute}`,
    updatedAt: new Date(Date.UTC(2026, 8, 17, 12, minute)),
    summary: 'A summary.',
    image: { url: 'https://example.org/a.jpg', width: 800, height: 600 },
  }
}

/** A cursor yielding the given batches in order, then null forever. */
function cursorOf(batches: FeedItem[][]): FeedCursor {
  let index = 0
  return {
    async next() {
      if (index >= batches.length) return null
      return batches[index++]!
    },
  }
}

/** A cursor that throws on its first next() and is dead thereafter. */
function throwingCursor(message = 'network down'): FeedCursor {
  let dead = false
  return {
    async next(): Promise<FeedItem[] | null> {
      if (dead) return null
      dead = true
      throw new Error(message)
    },
  }
}

describe('createMergedCursor', () => {
  it('returns null immediately when there are no children', async () => {
    expect(await createMergedCursor([]).next()).toBeNull()
  })

  it('passes a single child through unchanged', async () => {
    const batch = [item('a', 5), item('a', 3)]
    const merged = createMergedCursor([{ siteId: 'a', open: () => cursorOf([batch]) }])
    expect(await merged.next()).toEqual(batch)
  })

  it('emits newest-first across two children', async () => {
    const merged = createMergedCursor([
      { siteId: 'a', open: () => cursorOf([[item('a', 9), item('a', 5)]]) },
      { siteId: 'b', open: () => cursorOf([[item('b', 7), item('b', 6)]]) },
    ])
    const batch = await merged.next()
    // a@5 is deliberately withheld: b's buffer emptied, and b's *next* batch
    // could contain something between 5 and 6. It arrives on the next call.
    expect(batch!.map((i) => i.title)).toEqual(['a @9', 'b @7', 'b @6'])
  })

  it('stops the batch when a healthy child runs dry, rather than guessing', async () => {
    // 'b' has only one item. Once it is consumed, anything further from 'a'
    // might be older than b's *next* item, which is not yet known.
    const merged = createMergedCursor([
      { siteId: 'a', open: () => cursorOf([[item('a', 9), item('a', 1)]]) },
      { siteId: 'b', open: () => cursorOf([[item('b', 5)], [item('b', 4)]]) },
    ])
    const batch = await merged.next()
    expect(batch!.map((i) => i.title)).toEqual(['a @9', 'b @5'])
  })

  it('returns null only once every child is exhausted', async () => {
    const merged = createMergedCursor([
      { siteId: 'a', open: () => cursorOf([[item('a', 2)]]) },
      { siteId: 'b', open: () => cursorOf([[item('b', 1)]]) },
    ])
    // Strict ordering makes batches small: 'a' empties after one item, and
    // whether 'a' has more is unknown until the next top-up.
    expect((await merged.next())!.map((i) => i.title)).toEqual(['a @2'])
    expect((await merged.next())!.map((i) => i.title)).toEqual(['b @1'])
    expect(await merged.next()).toBeNull()
  })

  it('keeps emitting from healthy children when one fails', async () => {
    const merged = createMergedCursor([
      { siteId: 'good', open: () => cursorOf([[item('good', 8), item('good', 2)]]) },
      { siteId: 'bad', open: () => throwingCursor() },
    ])
    const batch = await merged.next()
    expect(batch!.map((i) => i.title)).toEqual(['good @8', 'good @2'])
  })

  it('reports the failing site through onSourceError', async () => {
    const onSourceError = vi.fn()
    const merged = createMergedCursor(
      [
        { siteId: 'good', open: () => cursorOf([[item('good', 1)]]) },
        { siteId: 'bad', open: () => throwingCursor('boom') },
      ],
      { onSourceError },
    )
    await merged.next()
    expect(onSourceError).toHaveBeenCalledWith('bad', expect.objectContaining({ message: 'boom' }))
  })

  it('throws when every child has failed', async () => {
    const merged = createMergedCursor([
      { siteId: 'a', open: () => throwingCursor('a down') },
      { siteId: 'b', open: () => throwingCursor('b down') },
    ])
    await expect(merged.next()).rejects.toThrow()
  })

  it('never reports total failure as end-of-feed', async () => {
    const merged = createMergedCursor([{ siteId: 'a', open: () => throwingCursor() }])
    // Returning null here would tell the reader "that's everything" when in
    // fact nothing could be loaded.
    await expect(merged.next()).rejects.toThrow()
  })

  it('reopens a failed child on the next call and reports recovery', async () => {
    const onSourceRecovered = vi.fn()
    let opened = 0
    const merged = createMergedCursor(
      [
        {
          siteId: 'flaky',
          open: () => (++opened === 1 ? throwingCursor() : cursorOf([[item('flaky', 4)]])),
        },
        { siteId: 'steady', open: () => cursorOf([[item('steady', 9)], [item('steady', 3)]]) },
      ],
      { onSourceRecovered },
    )

    const first = await merged.next()
    expect(first!.map((i) => i.title)).toEqual(['steady @9'])

    const second = await merged.next()
    expect(second!.map((i) => i.title)).toContain('flaky @4')
    expect(onSourceRecovered).toHaveBeenCalledWith('flaky')
    expect(opened).toBe(2)
  })

  it('stops retrying a child after maxConsecutiveFailures', async () => {
    let opened = 0
    const merged = createMergedCursor(
      [
        {
          siteId: 'dead',
          open: () => {
            opened++
            return throwingCursor()
          },
        },
        {
          siteId: 'alive',
          open: () =>
            cursorOf([
              [item('alive', 9)],
              [item('alive', 8)],
              [item('alive', 7)],
              [item('alive', 6)],
              [item('alive', 5)],
            ]),
        },
      ],
      { maxConsecutiveFailures: 2 },
    )

    for (let i = 0; i < 5; i++) await merged.next()

    // loadMore() calls next() five times per load; without a budget a down
    // wiki would be hit on every one of them.
    expect(opened).toBe(2)
  })

  it('honours the concurrency cap', async () => {
    let inFlight = 0
    let peak = 0
    const slow = (siteId: string): FeedCursor => ({
      async next() {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return [item(siteId, 1)]
      },
    })

    const children = Array.from({ length: 10 }, (_, n) => ({
      siteId: `s${n}`,
      open: () => slow(`s${n}`),
    }))

    await createMergedCursor(children, { concurrency: 3 }).next()
    expect(peak).toBeLessThanOrEqual(3)
  })
})
