import catalogueData from './catalogue.json'
import { DEFAULT_API_PATH } from './catalogueTypes.ts'
import type { Catalogue, WikiFamily, WikiSite } from './catalogueTypes.ts'
import { customWikis } from './customWikis.ts'

const catalogue = catalogueData as Catalogue

/**
 * Bundled families first, then user-added ones. Because `customWikis()` reads a
 * Solid signal, any component calling this during render tracks it and updates
 * when a wiki is added or removed.
 */
export function families(): WikiFamily[] {
  return [...catalogue.families, ...customWikis()]
}

export function makeSiteId(familyId: string, lang: string): string {
  return `${familyId}:${lang}`
}

export function parseSiteId(siteId: string): { familyId: string; lang: string } | undefined {
  const separator = siteId.indexOf(':')
  if (separator <= 0 || separator === siteId.length - 1) return undefined
  return {
    familyId: siteId.slice(0, separator),
    lang: siteId.slice(separator + 1),
  }
}

export function findFamily(familyId: string): WikiFamily | undefined {
  return families().find((family) => family.id === familyId)
}

export function findSite(siteId: string): { family: WikiFamily; site: WikiSite } | undefined {
  const parsed = parseSiteId(siteId)
  if (!parsed) return undefined

  const family = findFamily(parsed.familyId)
  const site = family?.sites.find((candidate) => candidate.lang === parsed.lang)
  if (!family || !site) return undefined

  return { family, site }
}

/** Matches language code, autonym, or English name — case insensitively. */
export function searchSites(family: WikiFamily, query: string): WikiSite[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return family.sites

  return family.sites.filter(
    (site) =>
      site.lang.toLowerCase().includes(needle) ||
      site.name.toLowerCase().includes(needle) ||
      site.english.toLowerCase().includes(needle),
  )
}

export function searchFamilies(query: string): WikiFamily[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return families()

  return families().filter(
    (family) =>
      family.name.toLowerCase().includes(needle) || family.id.toLowerCase().includes(needle),
  )
}

/**
 * Finds the site whose API endpoint is `apiUrl`, across bundled and custom
 * families. Bundled families carry no `apiUrl`, so each site's is derived from
 * its domain and the family's api path. That is ~800 short comparisons, run
 * only when a user adds a wiki by hand — not worth indexing.
 */
export function findSiteByApiUrl(
  apiUrl: string,
): { family: WikiFamily; site: WikiSite } | undefined {
  for (const family of families()) {
    const apiPath = family.apiPath ?? DEFAULT_API_PATH
    for (const site of family.sites) {
      if (`https://${site.domain}${apiPath}` === apiUrl) return { family, site }
    }
  }
  return undefined
}
