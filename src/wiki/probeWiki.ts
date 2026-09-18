import { findSiteByApiUrl } from './catalogue.ts'
import { DEFAULT_API_PATH, DEFAULT_ARTICLE_PATH } from './catalogueTypes.ts'
import type { WikiCapabilities, WikiFamily } from './catalogueTypes.ts'

export interface ProbedWiki {
  /** Canonical API URL, built from the wiki's own server. The dedupe key. */
  apiUrl: string
  domain: string
  apiPath: string
  sitename: string
  lang: string
  /** Where articles live, e.g. '/wiki/' or '/w/'. Trailing slash included. */
  articlePath: string
  capabilities: WikiCapabilities
}

/** The parts of a `meta=siteinfo&siprop=general|extensions` response we read. */
export interface SiteInfoResponse {
  query?: {
    general?: {
      generator?: string
      sitename?: string
      lang?: string
      server?: string
      /** e.g. '/wiki/$1'. */
      articlepath?: string
    }
    extensions?: Array<{ name?: string }>
  }
}

/**
 * Whether a search query should be offered as a URL to add. Wiki names rarely
 * contain dots and never contain a scheme, so ordinary searching is unaffected.
 */
export function looksLikeUrl(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return false
  if (/^https?:\/\//i.test(trimmed)) return true
  // A dotted host whose final label is alphabetic, so "1.47" is not a URL.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/:?#]|$)/i.test(trimmed)
}

/**
 * API endpoints to try, in order. Two conventions cover what is seen in the
 * wild: Minecraft Wiki and Arch Wiki serve /api.php, while OpenStreetMap and
 * Team Fortress serve /w/api.php.
 */
export function candidateApiUrls(input: string): string[] {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return []
  }
  if (url.hostname === '') return []

  const candidates: string[] = []
  if (url.pathname.toLowerCase().endsWith('/api.php')) {
    candidates.push(`${url.origin}${url.pathname}`)
  }
  candidates.push(`${url.origin}/api.php`)
  candidates.push(`${url.origin}${DEFAULT_API_PATH}`)

  return [...new Set(candidates)]
}

/**
 * A stable id for a custom family.
 *
 * FNV-1a rather than crypto.subtle.digest, which is async and would make this
 * function — and every caller — async. Collision resistance is irrelevant:
 * duplicates are detected by comparing canonical URLs, never ids.
 */
export function familyIdFor(apiUrl: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < apiUrl.length; index++) {
    hash ^= apiUrl.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `custom-${hash.toString(16).padStart(8, '0')}`
}

/** Turns siteinfo's `/w/$1` into the `/w/` prefix links actually carry. */
function articlePathOf(articlepath: string | undefined): string {
  if (!articlepath) return DEFAULT_ARTICLE_PATH
  const withoutPlaceholder = articlepath.replace(/\$1$/, '')
  return withoutPlaceholder === '' ? DEFAULT_ARTICLE_PATH : withoutPlaceholder
}

export function parseSiteInfo(
  candidateApiUrl: string,
  response: SiteInfoResponse,
): ProbedWiki | undefined {
  const general = response.query?.general
  if (!general?.generator?.startsWith('MediaWiki')) return undefined
  if (!general.server) return undefined

  // `server` may be protocol-relative, e.g. "//wiki.openstreetmap.org".
  const server = general.server.startsWith('//') ? `https:${general.server}` : general.server

  let host: string
  let apiPath: string
  try {
    host = new URL(server).host
    apiPath = new URL(candidateApiUrl).pathname
  } catch {
    return undefined
  }

  const extensions = new Set((response.query?.extensions ?? []).map((entry) => entry.name))

  return {
    apiUrl: `https://${host}${apiPath}`,
    domain: host,
    apiPath,
    sitename: general.sitename ?? host,
    lang: general.lang ?? 'en',
    articlePath: articlePathOf(general.articlepath),
    capabilities: {
      extracts: extensions.has('TextExtracts'),
      pageImages: extensions.has('PageImages'),
    },
  }
}

/** Human names for a language tag, falling back to the raw code. */
function languageNames(lang: string): { name: string; english: string } {
  try {
    return {
      name: new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang,
      english: new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang,
    }
  } catch {
    // Intl throws on a structurally invalid tag; an unknown-but-valid tag is
    // echoed back rather than throwing.
    return { name: lang, english: lang }
  }
}

export function toFamily(probed: ProbedWiki, name: string): WikiFamily {
  const names = languageNames(probed.lang)

  return {
    id: familyIdFor(probed.apiUrl),
    name: name.trim() === '' ? probed.sitename : name.trim(),
    type: 'mediawiki',
    apiPath: probed.apiPath,
    articlePath: probed.articlePath,
    capabilities: probed.capabilities,
    custom: true,
    apiUrl: probed.apiUrl,
    // Exactly one site: MediaWiki offers no reliable way to enumerate sibling
    // language sites, so each URL added is its own wiki.
    sites: [
      {
        lang: probed.lang,
        name: names.name,
        english: names.english,
        domain: probed.domain,
      },
    ],
  }
}

export type ProbeFailureKind = 'unreachable' | 'not-mediawiki' | 'duplicate'

export class ProbeError extends Error {
  readonly kind: ProbeFailureKind
  /** Set when `kind` is 'duplicate': the wiki already in the list. */
  readonly existingName?: string

  constructor(kind: ProbeFailureKind, message: string, existingName?: string) {
    super(message)
    this.name = 'ProbeError'
    this.kind = kind
    this.existingName = existingName
  }
}

const SITE_INFO_QUERY =
  '?action=query&format=json&formatversion=2&origin=*&meta=siteinfo&siprop=general%7Cextensions'

/** Returns the parsed body, or undefined if the endpoint could not be read. */
async function fetchSiteInfo(apiUrl: string): Promise<SiteInfoResponse | undefined> {
  try {
    const response = await fetch(`${apiUrl}${SITE_INFO_QUERY}`)
    if (!response.ok) return undefined
    return (await response.json()) as SiteInfoResponse
  } catch {
    // A CORS refusal and an unreachable host are indistinguishable here: fetch
    // rejects with a bare TypeError in both cases.
    return undefined
  }
}

/**
 * Discovers and validates a MediaWiki endpoint from user-entered text.
 *
 * Throws a ProbeError whose `kind` tells the caller which message to show.
 */
export async function probeWiki(input: string): Promise<ProbedWiki> {
  let anyResponded = false

  for (const candidate of candidateApiUrls(input)) {
    const response = await fetchSiteInfo(candidate)
    if (!response) continue

    anyResponded = true
    const probed = parseSiteInfo(candidate, response)
    if (!probed) continue

    const existing = findSiteByApiUrl(probed.apiUrl)
    if (existing) {
      throw new ProbeError(
        'duplicate',
        `${existing.family.name} is already in your list`,
        existing.family.name,
      )
    }

    return probed
  }

  if (anyResponded) {
    throw new ProbeError('not-mediawiki', "That address doesn't look like a MediaWiki site")
  }

  throw new ProbeError(
    'unreachable',
    "Couldn't reach this wiki. It may not exist, or it may not allow other apps to read it",
  )
}
