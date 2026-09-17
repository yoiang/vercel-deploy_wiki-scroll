import catalogueData from './catalogue.json'
import type { Catalogue, WikiFamily, WikiSite } from './catalogueTypes.ts'

const catalogue = catalogueData as Catalogue

export function families(): WikiFamily[] {
  return catalogue.families
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
  return catalogue.families.find((family) => family.id === familyId)
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
  if (needle === '') return catalogue.families

  return catalogue.families.filter(
    (family) =>
      family.name.toLowerCase().includes(needle) || family.id.toLowerCase().includes(needle),
  )
}
