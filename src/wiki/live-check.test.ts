import { describe, expect, it } from 'vitest'
import { createMergedCursor } from './mergedCursor.ts'
import { getSource } from './sources.ts'

/**
 * Hits the network. Run explicitly, not as part of `npm test`.
 *
 * LIMITATION — read before trusting this: Node does NOT enforce CORS, so this
 * test passing does not mean the app works in a browser or WebView. It once
 * passed while every request in the real app failed CORS for want of
 * `origin: '*'`. CORS correctness is pinned by the request-URL test in
 * `mediawiki.test.ts`; this test only proves the query shape and response
 * mapping still match the live API.
 */
describe.skip('live Wikipedia integration', () => {
  it(
    'fetches a feed batch and an article',
    async () => {
      const source = getSource('wikipedia:en')
      const batch = await source.openFeed({ sort: 'recently-updated', pageSize: 5 }).next()
      expect(batch).not.toBeNull()
      expect(batch!.length).toBeGreaterThan(0)

      const article = await source.fetchArticle(batch![0]!)
      expect(article.html.length).toBeGreaterThan(100)
    },
    30_000,
  )
})

describe.skip('live multi-wiki merge', () => {
  it(
    'interleaves three sites in newest-first order',
    async () => {
      const siteIds = ['wikipedia:en', 'wikipedia:ja', 'wiktionary:en']
      const merged = createMergedCursor(
        siteIds.map((siteId) => ({
          siteId,
          open: () => getSource(siteId).openFeed({ sort: 'recently-updated', pageSize: 10 }),
        })),
      )

      const seen: string[] = []
      for (let i = 0; i < 6; i++) {
        const batch = await merged.next()
        if (batch === null) break
        for (const article of batch) seen.push(article.id)
      }

      expect(seen.length).toBeGreaterThan(0)
      // Every followed site should contribute something over six batches.
      for (const siteId of siteIds) {
        expect(seen.some((id) => id.startsWith(siteId)), `${siteId} contributed nothing`).toBe(true)
      }
    },
    60_000,
  )
})
