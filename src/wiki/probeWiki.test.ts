import { describe, expect, it } from 'vitest'
import {
  candidateApiUrls,
  familyIdFor,
  looksLikeUrl,
  parseSiteInfo,
  toFamily,
} from './probeWiki.ts'
import type { SiteInfoResponse } from './probeWiki.ts'

describe('looksLikeUrl', () => {
  it('accepts a bare dotted host', () => {
    expect(looksLikeUrl('minecraft.wiki')).toBe(true)
  })

  it('accepts a full article url', () => {
    expect(looksLikeUrl('https://wiki.archlinux.org/title/Installation_guide')).toBe(true)
  })

  it('accepts a multi-label host', () => {
    expect(looksLikeUrl('wiki.openstreetmap.org')).toBe(true)
  })

  it('rejects a plain wiki name', () => {
    expect(looksLikeUrl('Wikiquote')).toBe(false)
  })

  it('rejects a name containing a space', () => {
    expect(looksLikeUrl('Minecraft Wiki')).toBe(false)
  })

  it('rejects an empty query', () => {
    expect(looksLikeUrl('   ')).toBe(false)
  })

  it('rejects a version-like string whose last label is numeric', () => {
    expect(looksLikeUrl('1.47')).toBe(false)
  })
})

describe('candidateApiUrls', () => {
  it('offers both conventions for a bare host', () => {
    expect(candidateApiUrls('minecraft.wiki')).toEqual([
      'https://minecraft.wiki/api.php',
      'https://minecraft.wiki/w/api.php',
    ])
  })

  it('puts an explicit api.php first', () => {
    expect(candidateApiUrls('https://wiki.openstreetmap.org/w/api.php')[0]).toBe(
      'https://wiki.openstreetmap.org/w/api.php',
    )
  })

  it('reduces to the origin for an article url', () => {
    expect(candidateApiUrls('https://minecraft.wiki/w/Anvil')).toEqual([
      'https://minecraft.wiki/api.php',
      'https://minecraft.wiki/w/api.php',
    ])
  })

  it('upgrades a scheme-less host to https', () => {
    expect(candidateApiUrls('minecraft.wiki')[0]!.startsWith('https://')).toBe(true)
  })

  it('normalises an uppercase host', () => {
    expect(candidateApiUrls('https://MineCraft.WIKI/')).toEqual(candidateApiUrls('minecraft.wiki'))
  })

  it('normalises a trailing slash', () => {
    expect(candidateApiUrls('https://minecraft.wiki/')).toEqual(candidateApiUrls('minecraft.wiki'))
  })

  it('does not duplicate when the input is already /api.php', () => {
    const candidates = candidateApiUrls('https://minecraft.wiki/api.php')
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('returns nothing for unparseable input', () => {
    expect(candidateApiUrls('http://')).toEqual([])
  })
})

describe('familyIdFor', () => {
  it('is deterministic', () => {
    expect(familyIdFor('https://a.org/api.php')).toBe(familyIdFor('https://a.org/api.php'))
  })

  it('differs for different urls', () => {
    expect(familyIdFor('https://a.org/api.php')).not.toBe(familyIdFor('https://b.org/api.php'))
  })

  it('contains no colon, which parseSiteId would split on', () => {
    expect(familyIdFor('https://a.org/api.php')).not.toContain(':')
  })

  it('is prefixed and fixed width', () => {
    expect(familyIdFor('https://a.org/api.php')).toMatch(/^custom-[0-9a-f]{8}$/)
  })
})

const response: SiteInfoResponse = {
  query: {
    general: {
      generator: 'MediaWiki 1.45.3',
      sitename: 'Minecraft Wiki',
      lang: 'en',
      server: 'https://minecraft.wiki',
    },
    extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }, { name: 'CiteThisPage' }],
  },
}

describe('parseSiteInfo', () => {
  it('reads sitename and language', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!
    expect(probed.sitename).toBe('Minecraft Wiki')
    expect(probed.lang).toBe('en')
  })

  it('detects both capabilities', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!
    expect(probed.capabilities).toEqual({ extracts: true, pageImages: true })
  })

  it('reports missing capabilities as false', () => {
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: 'https://wiki.openstreetmap.org',
        },
        extensions: [{ name: 'Cite' }],
      },
    })!
    expect(probed.capabilities).toEqual({ extracts: false, pageImages: false })
  })

  it('builds the canonical url from the wiki its own server, not the input', () => {
    const probed = parseSiteInfo('https://MineCraft.wiki/api.php', response)!
    expect(probed.apiUrl).toBe('https://minecraft.wiki/api.php')
  })

  it('normalises a protocol-relative server to https', () => {
    // OpenStreetMap really does return "//wiki.openstreetmap.org".
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: '//wiki.openstreetmap.org',
        },
        extensions: [],
      },
    })!
    expect(probed.apiUrl).toBe('https://wiki.openstreetmap.org/w/api.php')
  })

  it('keeps the discovered api path', () => {
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OSM',
          lang: 'en',
          server: 'https://wiki.openstreetmap.org',
        },
        extensions: [],
      },
    })!
    expect(probed.apiPath).toBe('/w/api.php')
  })

  it('rejects a response with no generator', () => {
    expect(parseSiteInfo('https://x.org/api.php', { query: { general: {} } })).toBeUndefined()
  })

  it('rejects a generator that is not MediaWiki', () => {
    expect(
      parseSiteInfo('https://x.org/api.php', {
        query: {
          general: {
            generator: 'DokuWiki 2024',
            sitename: 'X',
            lang: 'en',
            server: 'https://x.org',
          },
        },
      }),
    ).toBeUndefined()
  })

  it('rejects an empty response', () => {
    expect(parseSiteInfo('https://x.org/api.php', {})).toBeUndefined()
  })
})

describe('toFamily', () => {
  const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!

  it('uses the given name', () => {
    expect(toFamily(probed, 'My Wiki').name).toBe('My Wiki')
  })

  it('falls back to the wiki sitename when the name is blank', () => {
    expect(toFamily(probed, '   ').name).toBe('Minecraft Wiki')
  })

  it('marks the family custom and records the canonical url', () => {
    const built = toFamily(probed, 'My Wiki')
    expect(built.custom).toBe(true)
    expect(built.apiUrl).toBe('https://minecraft.wiki/api.php')
  })

  it('creates exactly one site', () => {
    // MediaWiki offers no reliable way to enumerate sibling language sites.
    expect(toFamily(probed, 'My Wiki').sites).toHaveLength(1)
  })

  it('names the site by language rather than repeating the wiki name', () => {
    const site = toFamily(probed, 'My Wiki').sites[0]!
    expect(site.lang).toBe('en')
    expect(site.english).toBe('English')
  })

  it('gives a Japanese site its autonym', () => {
    const jaProbed = parseSiteInfo('https://ja.example.org/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.44',
          sitename: 'Example',
          lang: 'ja',
          server: 'https://ja.example.org',
        },
        extensions: [],
      },
    })!
    const site = toFamily(jaProbed, 'Example').sites[0]!
    expect(site.name).toBe('日本語')
    expect(site.english).toBe('Japanese')
  })

  it('falls back to the raw code for an unusable language tag', () => {
    const oddProbed = parseSiteInfo('https://odd.example.org/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.44',
          sitename: 'Odd',
          lang: 'x-invalid',
          server: 'https://odd.example.org',
        },
        extensions: [],
      },
    })!
    const site = toFamily(oddProbed, 'Odd').sites[0]!
    expect(site.name).toBe('x-invalid')
  })

  it('carries the api path onto the family', () => {
    expect(toFamily(probed, 'My Wiki').apiPath).toBe('/api.php')
  })
})

// `vi` is deliberately not imported here — these tests stub globalThis.fetch
// directly, and an unused import is a build error under noUnusedLocals.
import { afterEach } from 'vitest'
import { ProbeError, probeWiki } from './probeWiki.ts'
import { addCustomWiki, removeCustomWiki } from './customWikis.ts'
import { toFamily as buildFamily } from './probeWiki.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answers only the given URLs; everything else rejects like a failed fetch. */
function stubFetch(byUrl: Record<string, SiteInfoResponse>): () => string[] {
  const requested: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    requested.push(url)
    const base = url.split('?')[0]!
    const body = byUrl[base]
    if (!body) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return () => requested
}

const mcResponse: SiteInfoResponse = {
  query: {
    general: {
      generator: 'MediaWiki 1.45.3',
      sitename: 'Minecraft Wiki',
      lang: 'en',
      server: 'https://minecraft.wiki',
    },
    extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }],
  },
}

describe('probeWiki', () => {
  it('finds a wiki served at /api.php', async () => {
    stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    const probed = await probeWiki('minecraft.wiki')
    expect(probed.sitename).toBe('Minecraft Wiki')
  })

  it('falls through to /w/api.php when /api.php is absent', async () => {
    const osm: SiteInfoResponse = {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: '//wiki.openstreetmap.org',
        },
        extensions: [],
      },
    }
    const requested = stubFetch({ 'https://wiki.openstreetmap.org/w/api.php': osm })
    const probed = await probeWiki('wiki.openstreetmap.org')
    expect(probed.apiPath).toBe('/w/api.php')
    expect(requested()).toHaveLength(2)
  })

  it('throws unreachable when nothing responds', async () => {
    stubFetch({})
    await expect(probeWiki('nowhere.example')).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('throws not-mediawiki when something responds but is not a wiki', async () => {
    stubFetch({
      'https://blog.example/api.php': { query: { general: { generator: 'DokuWiki 2024' } } },
    })
    await expect(probeWiki('blog.example')).rejects.toMatchObject({ kind: 'not-mediawiki' })
  })

  it('throws duplicate when the wiki is already a custom entry', async () => {
    stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    const probed = await probeWiki('minecraft.wiki')
    const built = buildFamily(probed, 'Minecraft Wiki')
    addCustomWiki(built)
    try {
      await expect(probeWiki('https://minecraft.wiki/wiki/Anvil')).rejects.toMatchObject({
        kind: 'duplicate',
      })
    } finally {
      removeCustomWiki(built.id)
    }
  })

  it('throws duplicate when the wiki is already bundled', async () => {
    stubFetch({
      'https://en.wikipedia.org/w/api.php': {
        query: {
          general: {
            generator: 'MediaWiki 1.47.0',
            sitename: 'Wikipedia',
            lang: 'en',
            server: 'https://en.wikipedia.org',
          },
          extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }],
        },
      },
    })
    await expect(probeWiki('en.wikipedia.org')).rejects.toMatchObject({ kind: 'duplicate' })
  })

  it('names the existing wiki on a duplicate', async () => {
    stubFetch({
      'https://en.wikipedia.org/w/api.php': {
        query: {
          general: {
            generator: 'MediaWiki 1.47.0',
            sitename: 'Wikipedia',
            lang: 'en',
            server: 'https://en.wikipedia.org',
          },
          extensions: [],
        },
      },
    })
    await expect(probeWiki('en.wikipedia.org')).rejects.toMatchObject({
      existingName: 'Wikipedia',
    })
  })

  it('throws unreachable for input that yields no candidates', async () => {
    stubFetch({})
    await expect(probeWiki('http://')).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('sends origin=* so the request can pass CORS', async () => {
    const requested = stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    await probeWiki('minecraft.wiki')
    expect(decodeURIComponent(requested()[0]!)).toContain('origin=*')
  })

  it('is a ProbeError, so callers can switch on kind', async () => {
    stubFetch({})
    await expect(probeWiki('nowhere.example')).rejects.toBeInstanceOf(ProbeError)
  })
})

describe('article path', () => {
  // Minecraft Wiki serves articles at /w/$1, Wikipedia at /wiki/$1. Hardcoding
  // /wiki/ makes every in-article link on such a wiki a dead end.
  it('reads the article path from siteinfo', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.45.3',
          sitename: 'Minecraft Wiki',
          lang: 'en',
          server: 'https://minecraft.wiki',
          articlepath: '/w/$1',
        },
        extensions: [],
      },
    })!
    expect(probed.articlePath).toBe('/w/')
  })

  it('defaults to /wiki/ when siteinfo omits it', () => {
    const probed = parseSiteInfo('https://x.org/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.44',
          sitename: 'X',
          lang: 'en',
          server: 'https://x.org',
        },
        extensions: [],
      },
    })!
    expect(probed.articlePath).toBe('/wiki/')
  })

  it('carries the article path onto the family', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.45.3',
          sitename: 'Minecraft Wiki',
          lang: 'en',
          server: 'https://minecraft.wiki',
          articlepath: '/w/$1',
        },
        extensions: [],
      },
    })!
    expect(toFamily(probed, 'Minecraft Wiki').articlePath).toBe('/w/')
  })
})
