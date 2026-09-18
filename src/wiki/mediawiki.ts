import Session from 'm3api/browser.js'
import { sanitizeWikiHtml } from '../lib/sanitizeWikiHtml.ts'
import { DEFAULT_ARTICLE_PATH } from './catalogueTypes.ts'
import type { ArticleContent, FeedCursor, FeedItem, SortOrder, WikiSource } from './types.ts'

/**
 * The shape of the MediaWiki `recentchanges` generator response this app relies on.
 * Declared locally because m3api's own types are deliberately loose
 * (`request()` returns `any`, `requestAndContinue()` returns `{}`).
 */
export interface RecentChangesPage {
  pageid: number
  title: string
  extract?: string
  thumbnail?: { source: string; width: number; height: number }
  revisions?: Array<{ timestamp: string }>
}

export interface RecentChangesResponse {
  query?: { pages?: RecentChangesPage[] }
}

/**
 * Converts one API batch into FeedItems, newest first.
 *
 * The sort is required, not cosmetic: the recentchanges generator returns
 * pages in page-ID order within a batch, so a 10:53:55 edit can arrive ahead
 * of a 10:53:51 one. Because batches themselves are enumerated in timestamp
 * order, sorting within each batch yields a correctly ordered feed overall.
 */
export function mapPagesToItems(sourceId: string, pages: RecentChangesPage[]): FeedItem[] {
  return pages
    .map((page): FeedItem => {
      const timestamp = page.revisions?.[0]?.timestamp
      return {
        id: `${sourceId}:${page.pageid}`,
        pageId: page.pageid,
        title: page.title,
        updatedAt: timestamp ? new Date(timestamp) : new Date(0),
        summary: page.extract ?? '',
        image: page.thumbnail
          ? {
              url: page.thumbnail.source,
              width: page.thumbnail.width,
              height: page.thumbnail.height,
            }
          : undefined,
      }
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

/** Wraps an async iterator of API responses as a FeedCursor. */
export class MediaWikiFeedCursor implements FeedCursor {
  readonly #sourceId: string
  readonly #responses: AsyncIterator<RecentChangesResponse>
  #exhausted = false

  constructor(sourceId: string, responses: AsyncIterator<RecentChangesResponse>) {
    this.#sourceId = sourceId
    this.#responses = responses
  }

  async next(): Promise<FeedItem[] | null> {
    if (this.#exhausted) return null

    const result = await this.#responses.next()
    if (result.done || !result.value) {
      this.#exhausted = true
      return null
    }

    return mapPagesToItems(this.#sourceId, result.value.query?.pages ?? [])
  }
}

export interface MediaWikiSourceConfig {
  /** Site id, e.g. 'wikipedia:en'. */
  id: string
  /** e.g. 'Wikipedia (Japanese)'. */
  displayName: string
  /** Bare wiki domain, e.g. 'ja.wikipedia.org'. */
  domain: string
  /**
   * e.g. '/w/api.php'. Kept separate from `domain` because both are needed and
   * neither derives from the other: the session is built from domain+apiPath,
   * while canonicalUrl is built from domain+'/wiki/'.
   */
  apiPath: string
  /**
   * Where articles live, e.g. '/wiki/' or '/w/'. Used to build canonicalUrl.
   * Defaults to '/wiki/' when absent.
   */
  articlePath?: string
  /** Sent as `api-user-agent`; Wikimedia's etiquette policy asks for one. */
  userAgent: string
}

/**
 * Default parameters sent with every API request.
 *
 * `origin: '*'` is mandatory, not optional: m3api's README requires it for
 * anonymous cross-site requests from a browser. Without it every request fails
 * CORS inside the WebView. Node does not enforce CORS, so its absence is
 * invisible to any test that runs outside a browser — hence the regression
 * test that pins this value.
 */
export const SESSION_DEFAULT_PARAMS = {
  origin: '*',
  formatversion: 2,
  errorformat: 'plaintext',
} as const

/** The subset of an `action=parse` response this app relies on. */
export interface ParseResponse {
  parse?: {
    title: string
    text: string
    revid?: number
  }
}

export function parseResponseToArticle(
  config: MediaWikiSourceConfig,
  response: ParseResponse,
  updatedAt: Date,
): ArticleContent {
  const parse = response.parse
  if (!parse) {
    throw new Error(`Article response contained no parse block for ${config.domain}`)
  }

  return {
    title: parse.title,
    // The wiki's own origin, so root-relative image URLs resolve against it
    // rather than against this app.
    html: sanitizeWikiHtml(parse.text, `https://${config.domain}`),
    updatedAt,
    canonicalUrl: `https://${config.domain}${config.articlePath ?? DEFAULT_ARTICLE_PATH}${encodeURI(
      parse.title,
    ).replace(/'/g, '%27')}`,
  }
}

export class MediaWikiSource implements WikiSource {
  readonly id: string
  readonly displayName: string
  readonly #config: MediaWikiSourceConfig
  readonly #session: Session

  constructor(config: MediaWikiSourceConfig) {
    this.id = config.id
    this.displayName = config.displayName
    this.#config = config
    // m3api accepts a bare domain or a full api.php URL; passing the full URL
    // is what makes apiPath effective for wikis that do not use /w/api.php.
    this.#session = new Session(
      `https://${config.domain}${config.apiPath}`,
      { ...SESSION_DEFAULT_PARAMS },
      { userAgent: config.userAgent },
    )
  }

  openFeed(opts: { sort: SortOrder; pageSize: number }): FeedCursor {
    // V1 supports exactly one sort order, so `opts.sort` is accepted for
    // interface conformance but not yet branched on. When SortOrder gains a
    // member, this is where the generator choice belongs.

    // m3api types requestAndContinue() as `{}`; this is the single cast at the
    // API boundary. Everything above this line is properly typed.
    const responses = this.#session.requestAndContinue({
      action: 'query',
      generator: 'recentchanges',
      grcnamespace: [0],
      grctype: ['edit', 'new'],
      grctoponly: true,
      grclimit: opts.pageSize,
      prop: ['extracts', 'pageimages', 'revisions'],
      exintro: true,
      explaintext: true,
      exchars: 400,
      piprop: ['thumbnail'],
      pithumbsize: 800,
      rvprop: ['timestamp'],
    }) as AsyncIterable<RecentChangesResponse>

    return new MediaWikiFeedCursor(this.id, responses[Symbol.asyncIterator]())
  }

  async fetchArticle(ref: { pageId: number; title: string }): Promise<ArticleContent> {
    const target = ref.pageId > 0 ? { pageid: ref.pageId } : { page: ref.title }

    const response = (await this.#session.request({
      action: 'parse',
      ...target,
      prop: ['text'],
      disableeditsection: true,
      disabletoc: true,
    })) as ParseResponse

    return parseResponseToArticle(this.#config, response, new Date())
  }
}
