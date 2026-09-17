import type { Catalogue, WikiSite } from './catalogueTypes.ts'

/** The parts of an `action=sitematrix` response this project reads. */
export interface SitematrixSite {
  url: string
  code: string
  sitename?: string
  dbname?: string
  closed?: boolean
}

export interface SitematrixLanguage {
  code: string
  name: string
  localname: string
  site?: SitematrixSite[]
}

export interface SitematrixResponse {
  sitematrix: Record<string, unknown>
}

function isLanguageEntry(key: string, value: unknown): value is SitematrixLanguage {
  // The response mixes numeric-keyed language entries with `count` (a number)
  // and `specials` (an array of single sites that are not language editions).
  return key !== 'count' && key !== 'specials' && typeof value === 'object' && value !== null
}

/** Every open site with the given project code, sorted by language. */
export function sitesForCode(response: SitematrixResponse, code: string): WikiSite[] {
  const sites: WikiSite[] = []

  for (const [key, value] of Object.entries(response.sitematrix)) {
    if (!isLanguageEntry(key, value)) continue

    const match = (value.site ?? []).find((site) => site.code === code && !site.closed)
    if (!match) continue

    sites.push({
      lang: value.code,
      name: value.name,
      english: value.localname,
      domain: match.url.replace(/^https?:\/\//, ''),
    })
  }

  return sites.sort((a, b) => a.lang.localeCompare(b.lang))
}

/**
 * Returns a new catalogue with the sites of every `generatedFrom` family
 * replaced. Families without that marker — and all family-level metadata —
 * are returned untouched, which is what makes the file safe to hand-edit.
 */
export function applySitematrix(catalogue: Catalogue, response: SitematrixResponse): Catalogue {
  return {
    families: catalogue.families.map((family) =>
      family.generatedFrom
        ? { ...family, sites: sitesForCode(response, family.generatedFrom.sitematrix) }
        : family,
    ),
  }
}
