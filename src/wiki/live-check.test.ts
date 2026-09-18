import { describe, expect, it } from 'vitest'
import { createMergedCursor } from './mergedCursor.ts'
import { probeWiki, toFamily } from './probeWiki.ts'
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

describe.skip('live custom wiki probe', () => {
  it(
    'discovers a real third-party wiki from a bare host',
    async () => {
      const probed = await probeWiki('minecraft.wiki')
      expect(probed.sitename).toBe('Minecraft Wiki')
      expect(probed.apiUrl).toBe('https://minecraft.wiki/api.php')
      expect(probed.capabilities).toEqual({ extracts: true, pageImages: true })

      const built = toFamily(probed, '')
      expect(built.sites).toHaveLength(1)
      expect(built.name).toBe('Minecraft Wiki')
    },
    30_000,
  )

  it(
    'discovers a wiki served at /w/api.php and reports it as text-only',
    async () => {
      const probed = await probeWiki('https://wiki.openstreetmap.org/wiki/Main_Page')
      expect(probed.apiPath).toBe('/w/api.php')
      expect(probed.capabilities.pageImages).toBe(false)
    },
    30_000,
  )

  it(
    'rejects a wiki already in the bundled catalogue',
    async () => {
      await expect(probeWiki('en.wikipedia.org')).rejects.toMatchObject({ kind: 'duplicate' })
    },
    30_000,
  )
})
