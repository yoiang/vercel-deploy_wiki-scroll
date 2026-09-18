import { afterEach, describe, expect, it } from 'vitest'
import {
  families,
  findFamily,
  findSite,
  makeSiteId,
  parseSiteId,
  searchFamilies,
  searchSites,
  findSiteByApiUrl,
} from './catalogue.ts'
import { addCustomWiki, removeCustomWiki } from './customWikis.ts'
import type { WikiFamily } from './catalogueTypes.ts'

describe('catalogue data', () => {
  it('contains the seven Wikimedia content families', () => {
    expect(
      families()
        .map((f) => f.id)
        .sort(),
    ).toEqual([
      'wikibooks',
      'wikipedia',
      'wikiquote',
      'wikisource',
      'wikiversity',
      'wikivoyage',
      'wiktionary',
    ])
  })

  it('has no empty family', () => {
    for (const family of families()) {
      expect(family.sites.length, `${family.id} has no sites`).toBeGreaterThan(0)
    }
  })

  it('declares capabilities on every family', () => {
    for (const family of families()) {
      expect(typeof family.capabilities.extracts).toBe('boolean')
      expect(typeof family.capabilities.pageImages).toBe('boolean')
    }
  })

  it('has unique family ids', () => {
    const ids = families().map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique language codes within each family', () => {
    for (const family of families()) {
      const langs = family.sites.map((s) => s.lang)
      expect(new Set(langs).size, `${family.id} has duplicate langs`).toBe(langs.length)
    }
  })

  it('gives every site a bare domain with no scheme', () => {
    for (const family of families()) {
      for (const site of family.sites) {
        expect(site.domain).not.toContain('://')
        expect(site.domain.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('site ids', () => {
  it('round-trips', () => {
    expect(parseSiteId(makeSiteId('wikipedia', 'en'))).toEqual({
      familyId: 'wikipedia',
      lang: 'en',
    })
  })

  it('rejects a malformed id', () => {
    expect(parseSiteId('nonsense')).toBeUndefined()
  })
})

describe('findSite', () => {
  it('resolves a known site', () => {
    const found = findSite('wikipedia:en')
    expect(found?.family.id).toBe('wikipedia')
    expect(found?.site.domain).toBe('en.wikipedia.org')
  })

  it('returns undefined for an unknown family', () => {
    expect(findSite('nosuchwiki:en')).toBeUndefined()
  })

  it('returns undefined for an unknown language', () => {
    expect(findSite('wikipedia:nosuchlang')).toBeUndefined()
  })
})

describe('findFamily', () => {
  it('resolves a known family', () => {
    expect(findFamily('wiktionary')?.name).toBe('Wiktionary')
  })

  it('returns undefined for an unknown family', () => {
    expect(findFamily('nope')).toBeUndefined()
  })
})

describe('searchSites', () => {
  const wikipedia = findFamily('wikipedia')!

  it('matches the English name', () => {
    expect(searchSites(wikipedia, 'Japanese').map((s) => s.lang)).toContain('ja')
  })

  it('matches the autonym', () => {
    expect(searchSites(wikipedia, '日本語').map((s) => s.lang)).toContain('ja')
  })

  it('matches the language code', () => {
    expect(searchSites(wikipedia, 'ja').map((s) => s.lang)).toContain('ja')
  })

  it('is case insensitive', () => {
    expect(searchSites(wikipedia, 'japanese').map((s) => s.lang)).toContain('ja')
  })

  it('returns every site for an empty query', () => {
    expect(searchSites(wikipedia, '  ')).toHaveLength(wikipedia.sites.length)
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(searchSites(wikipedia, 'zzzzzznotalanguage')).toEqual([])
  })
})

describe('searchFamilies', () => {
  it('matches on family name, case insensitively', () => {
    expect(searchFamilies('quote').map((f) => f.id)).toEqual(['wikiquote'])
  })

  it('returns every family for an empty query', () => {
    expect(searchFamilies('')).toHaveLength(families().length)
  })
})

const customFamily: WikiFamily = {
  id: 'custom-deadbeef',
  name: 'Minecraft Wiki',
  type: 'mediawiki',
  apiPath: '/api.php',
  capabilities: { extracts: true, pageImages: true },
  custom: true,
  apiUrl: 'https://minecraft.wiki/api.php',
  sites: [{ lang: 'en', name: 'English', english: 'English', domain: 'minecraft.wiki' }],
}

describe('catalogue with custom wikis', () => {
  afterEach(() => {
    removeCustomWiki('custom-deadbeef')
  })

  it('includes a custom wiki in families()', () => {
    addCustomWiki(customFamily)
    expect(families().map((f) => f.id)).toContain('custom-deadbeef')
  })

  it('lists bundled families before custom ones', () => {
    addCustomWiki(customFamily)
    const ids = families().map((f) => f.id)
    expect(ids[0]).toBe('wikipedia')
    expect(ids[ids.length - 1]).toBe('custom-deadbeef')
  })

  it('resolves a custom site id', () => {
    addCustomWiki(customFamily)
    expect(findSite('custom-deadbeef:en')?.site.domain).toBe('minecraft.wiki')
  })

  it('finds a custom family by name search', () => {
    addCustomWiki(customFamily)
    expect(searchFamilies('minecraft').map((f) => f.id)).toEqual(['custom-deadbeef'])
  })

  it('drops the custom wiki from all lookups once removed', () => {
    addCustomWiki(customFamily)
    removeCustomWiki('custom-deadbeef')
    expect(families().map((f) => f.id)).not.toContain('custom-deadbeef')
    expect(findSite('custom-deadbeef:en')).toBeUndefined()
    expect(searchFamilies('minecraft')).toEqual([])
  })
})

describe('findSiteByApiUrl', () => {
  it('resolves a bundled site from its implied api url', () => {
    // Bundled families carry no apiUrl; the site's is domain + apiPath.
    const found = findSiteByApiUrl('https://en.wikipedia.org/w/api.php')
    expect(found?.family.id).toBe('wikipedia')
    expect(found?.site.lang).toBe('en')
  })

  it('resolves a bundled site of another family', () => {
    expect(findSiteByApiUrl('https://fr.wiktionary.org/w/api.php')?.family.id).toBe('wiktionary')
  })

  it('resolves a custom site from its stored apiUrl', () => {
    addCustomWiki(customFamily)
    expect(findSiteByApiUrl('https://minecraft.wiki/api.php')?.family.id).toBe('custom-deadbeef')
    removeCustomWiki('custom-deadbeef')
  })

  it('returns undefined for an unknown url', () => {
    expect(findSiteByApiUrl('https://nowhere.example/api.php')).toBeUndefined()
  })
})
