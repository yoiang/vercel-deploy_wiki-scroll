import { findSite } from './catalogue.ts'
import { DEFAULT_API_PATH } from './catalogueTypes.ts'
import { MediaWikiSource } from './mediawiki.ts'
import type { WikiSource } from './types.ts'

/** Wikimedia's etiquette policy asks for an identifying User-Agent. See README. */
const USER_AGENT = 'wiki-scroll/0.1'

export class UnknownSiteError extends Error {
  constructor(siteId: string) {
    super(`No site '${siteId}' in the catalogue`)
    this.name = 'UnknownSiteError'
  }
}

export class UnsupportedWikiTypeError extends Error {
  constructor(type: string, siteId: string) {
    super(`Wiki type '${type}' of site '${siteId}' is not supported`)
    this.name = 'UnsupportedWikiTypeError'
  }
}

const sources = new Map<string, WikiSource>()

/**
 * The WikiSource for one site, memoised. Memoising matters: each source owns an
 * m3api Session, and the merged cursor asks for sources on every feed load.
 */
export function getSource(siteId: string): WikiSource {
  const existing = sources.get(siteId)
  if (existing) return existing

  const found = findSite(siteId)
  if (!found) throw new UnknownSiteError(siteId)

  const { family, site } = found
  if (family.type !== 'mediawiki') {
    throw new UnsupportedWikiTypeError(family.type, siteId)
  }

  const source = new MediaWikiSource({
    id: siteId,
    displayName: `${family.name} (${site.english})`,
    domain: site.domain,
    apiPath: family.apiPath ?? DEFAULT_API_PATH,
    userAgent: USER_AGENT,
  })

  sources.set(siteId, source)
  return source
}
