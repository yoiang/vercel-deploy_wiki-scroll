/** One language edition of a family. This is what is actually fetched from. */
export interface WikiSite {
  /** Language code, e.g. 'ja'. Unique within a family. */
  lang: string
  /** Autonym, e.g. '日本語'. */
  name: string
  /** English name, e.g. 'Japanese'. */
  english: string
  /** Bare host, e.g. 'ja.wikipedia.org'. */
  domain: string
}

/**
 * Which optional MediaWiki extensions a family's API provides.
 * TextExtracts and PageImages are extensions, not core: a family without
 * pageImages returns no thumbnails, so the requireImage policy rejects
 * everything it produces.
 */
export interface WikiCapabilities {
  extracts: boolean
  pageImages: boolean
}

/** A wiki as a brand — Wikipedia, Wiktionary — holding many language sites. */
export interface WikiFamily {
  id: string
  name: string
  /** Wiki software. Selects which WikiSource implementation is built. */
  type: 'mediawiki'
  /** Third-party MediaWikis do not all serve /w/api.php. */
  apiPath?: string
  /** Where articles live, e.g. '/wiki/' or '/w/'. Defaults to '/wiki/'. */
  articlePath?: string
  capabilities: WikiCapabilities
  /** True for user-added wikis; enables the remove action. */
  custom?: true
  /** Canonical API URL. Present on custom families; the deduplication key. */
  apiUrl?: string
  /** Present when `sites` is machine-generated; see scripts/update-catalogue.mjs. */
  generatedFrom?: { sitematrix: string }
  sites: WikiSite[]
}

export interface Catalogue {
  families: WikiFamily[]
}

export const DEFAULT_API_PATH = '/w/api.php'

/** Wikipedia's article path. Minecraft Wiki, for one, uses '/w/' instead. */
export const DEFAULT_ARTICLE_PATH = '/wiki/'
