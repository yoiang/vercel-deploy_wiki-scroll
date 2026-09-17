import { describe, expect, it } from 'vitest'
import { getActiveSource } from './registry.ts'

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
      const source = getActiveSource()
      const batch = await source.openFeed({ sort: 'recently-updated', pageSize: 5 }).next()
      expect(batch).not.toBeNull()
      expect(batch!.length).toBeGreaterThan(0)

      const article = await source.fetchArticle(batch![0]!)
      expect(article.html.length).toBeGreaterThan(100)
    },
    30_000,
  )
})
