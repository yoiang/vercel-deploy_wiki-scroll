import { describe, expect, it } from 'vitest'
import {
  MediaWikiSource,
  MediaWikiFeedCursor,
  SESSION_DEFAULT_PARAMS,
  mapPagesToItems,
  parseResponseToArticle,
} from './mediawiki.ts'
import type { MediaWikiSourceConfig, RecentChangesResponse } from './mediawiki.ts'
import { recentChangesBatch } from './fixtures/recentchanges.ts'

const pages = recentChangesBatch.query!.pages!

describe('mapPagesToItems', () => {
  it('maps every page to a FeedItem', () => {
    expect(mapPagesToItems('wikipedia-en', pages)).toHaveLength(4)
  })

  it('builds a source-qualified id', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.id)).toContain('wikipedia-en:1')
  })

  it('sorts the batch by updatedAt descending', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.title)).toEqual([
      'List of Toyota engines', // 10:53:55
      'Commonwealth Law Reports', // 10:53:51
      'Apple II (original)', // 10:53:50
      'Alec Smir', // 10:53:49
    ])
  })

  it('maps a thumbnail to an image', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.image).toEqual({
      url: 'https://upload.wikimedia.org/a.jpg',
      width: 800,
      height: 709,
    })
  })

  it('leaves image undefined when the page has no thumbnail', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 2)!
    expect(item.image).toBeUndefined()
  })

  it('uses an empty summary when the page has no extract', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 4)!
    expect(item.summary).toBe('')
  })

  it('parses the revision timestamp into a Date', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.updatedAt.toISOString()).toBe('2026-09-17T10:53:50.000Z')
  })
})

/** Builds an async iterator over canned responses, standing in for m3api. */
async function* fakeResponses(
  ...responses: RecentChangesResponse[]
): AsyncGenerator<RecentChangesResponse> {
  for (const response of responses) yield response
}

describe('MediaWikiFeedCursor', () => {
  it('returns a mapped batch on next()', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    const batch = await cursor.next()
    expect(batch).toHaveLength(4)
  })

  it('returns null once the iterator is exhausted', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    await cursor.next()
    expect(await cursor.next()).toBeNull()
  })

  it('keeps returning null after exhaustion', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses())
    expect(await cursor.next()).toBeNull()
    expect(await cursor.next()).toBeNull()
  })

  it('returns an empty batch rather than null when a response has no pages', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses({ query: {} }))
    expect(await cursor.next()).toEqual([])
  })
})

const testConfig: MediaWikiSourceConfig = {
  id: 'wikipedia-en',
  displayName: 'Wikipedia (English)',
  domain: 'en.wikipedia.org',
  userAgent: 'wiki-scroll/0.1',
}

describe('parseResponseToArticle', () => {
  const updatedAt = new Date('2026-09-17T10:53:50Z')

  it('extracts the title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.title).toBe('Apple II')
  })

  it('sanitises the html', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p><script>alert(1)</script>' } },
      updatedAt,
    )
    expect(article.html).toContain('Hi')
    expect(article.html).not.toContain('script')
  })

  it('builds a canonical url from the config domain and title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II (original)', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.canonicalUrl).toBe('https://en.wikipedia.org/wiki/Apple%20II%20(original)')
  })

  it('carries the updatedAt through', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.updatedAt).toBe(updatedAt)
  })

  it('throws a descriptive error when the response has no parse block', () => {
    expect(() => parseResponseToArticle(testConfig, {}, updatedAt)).toThrow(/no parse/i)
  })
})

describe('SESSION_DEFAULT_PARAMS', () => {
  /**
   * Regression: m3api's README requires `origin: '*'` for anonymous
   * cross-site requests from a browser. Without it every request fails CORS
   * in the WebView — but passes under Node, which does not enforce CORS.
   */
  it("sends origin '*' so anonymous browser requests pass CORS", () => {
    expect(SESSION_DEFAULT_PARAMS.origin).toBe('*')
  })

  it('uses formatversion 2, which the response mapping assumes', () => {
    expect(SESSION_DEFAULT_PARAMS.formatversion).toBe(2)
  })
})

describe('MediaWikiSource request construction', () => {
  /**
   * Intercepts fetch to assert on the URL actually sent. Asserting the
   * constant alone would not catch the session being built with different
   * parameters, which is how the original CORS bug reached the browser.
   */
  async function captureFeedRequestUrl(): Promise<string> {
    const originalFetch = globalThis.fetch
    let captured = ''

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      captured = typeof input === 'string' ? input : input.toString()
      return new Response(JSON.stringify({ batchcomplete: true, query: { pages: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof globalThis.fetch

    try {
      const source = new MediaWikiSource(testConfig)
      await source.openFeed({ sort: 'recently-updated', pageSize: 10 }).next()
    } finally {
      globalThis.fetch = originalFetch
    }

    return captured
  }

  it('includes origin=* in the request URL', async () => {
    const url = await captureFeedRequestUrl()
    expect(decodeURIComponent(url)).toContain('origin=*')
  })

  it('requests the recentchanges generator', async () => {
    const url = await captureFeedRequestUrl()
    expect(url).toContain('generator=recentchanges')
  })
})
