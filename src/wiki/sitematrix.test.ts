import { describe, expect, it } from 'vitest'
import { applySitematrix, sitesForCode } from './sitematrix.ts'
import type { SitematrixResponse } from './sitematrix.ts'
import type { Catalogue } from './catalogueTypes.ts'

const response: SitematrixResponse = {
  sitematrix: {
    count: 2,
    '0': {
      code: 'en',
      name: 'English',
      localname: 'English',
      site: [
        { url: 'https://en.wikipedia.org', dbname: 'enwiki', code: 'wiki', sitename: 'Wikipedia' },
        {
          url: 'https://en.wiktionary.org',
          dbname: 'enwiktionary',
          code: 'wiktionary',
          sitename: 'Wiktionary',
        },
        {
          url: 'https://en.wikinews.org',
          dbname: 'enwikinews',
          code: 'wikinews',
          sitename: 'Wikinews',
          closed: true,
        },
      ],
    },
    '1': {
      code: 'ja',
      name: '日本語',
      localname: 'Japanese',
      site: [
        { url: 'https://ja.wikipedia.org', dbname: 'jawiki', code: 'wiki', sitename: 'Wikipedia' },
      ],
    },
    specials: [
      {
        url: 'https://commons.wikimedia.org',
        dbname: 'commonswiki',
        code: 'commons',
        sitename: 'Commons',
      },
    ],
  },
}

describe('sitesForCode', () => {
  it('collects every open site with the given code', () => {
    expect(sitesForCode(response, 'wiki').map((s) => s.lang)).toEqual(['en', 'ja'])
  })

  it('maps autonym, English name and bare domain', () => {
    const [, ja] = sitesForCode(response, 'wiki')
    expect(ja).toEqual({
      lang: 'ja',
      name: '日本語',
      english: 'Japanese',
      domain: 'ja.wikipedia.org',
    })
  })

  it('skips sites flagged closed', () => {
    // All 36 real Wikinews editions are closed; including them would add a
    // family that can never produce an article.
    expect(sitesForCode(response, 'wikinews')).toEqual([])
  })

  it('ignores the specials block, which holds no language editions', () => {
    expect(sitesForCode(response, 'commons')).toEqual([])
  })

  it('returns an empty array for an unknown code', () => {
    expect(sitesForCode(response, 'nosuchproject')).toEqual([])
  })

  it('sorts sites by language code', () => {
    const langs = sitesForCode(response, 'wiki').map((s) => s.lang)
    expect(langs).toEqual([...langs].sort())
  })
})

describe('applySitematrix', () => {
  const catalogue: Catalogue = {
    families: [
      {
        id: 'wikipedia',
        name: 'Wikipedia',
        type: 'mediawiki',
        capabilities: { extracts: true, pageImages: true },
        generatedFrom: { sitematrix: 'wiki' },
        sites: [{ lang: 'stale', name: 'Stale', english: 'Stale', domain: 'stale.example.org' }],
      },
      {
        id: 'handmade',
        name: 'Hand Made Wiki',
        type: 'mediawiki',
        apiPath: '/api.php',
        capabilities: { extracts: false, pageImages: false },
        sites: [{ lang: 'en', name: 'English', english: 'English', domain: 'handmade.example.org' }],
      },
    ],
  }

  it('replaces the sites of a generated family', () => {
    const result = applySitematrix(catalogue, response)
    expect(result.families[0]!.sites.map((s) => s.lang)).toEqual(['en', 'ja'])
  })

  it('leaves hand-added families completely untouched', () => {
    const result = applySitematrix(catalogue, response)
    expect(result.families[1]).toEqual(catalogue.families[1])
  })

  it('preserves metadata of a generated family', () => {
    const result = applySitematrix(catalogue, response)
    expect(result.families[0]!.name).toBe('Wikipedia')
    expect(result.families[0]!.capabilities).toEqual({ extracts: true, pageImages: true })
  })

  it('does not mutate the input catalogue', () => {
    applySitematrix(catalogue, response)
    expect(catalogue.families[0]!.sites.map((s) => s.lang)).toEqual(['stale'])
  })
})
