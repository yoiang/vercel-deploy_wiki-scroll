/** How a feed is ordered. V1 supports one order; later iterations extend this union. */
export type SortOrder = 'recently-updated'

/** One article as the UI sees it. Carries no wiki-specific concepts. */
export interface FeedItem {
  /** `${sourceId}:${pageId}` — stable across refetches, used for deduplication. */
  id: string
  pageId: number
  title: string
  updatedAt: Date
  /** Plain-text intro. Empty string when the source supplied none. */
  summary: string
  image?: {
    url: string
    width: number
    height: number
  }
}

/** A fully fetched article, ready to render. `html` is already sanitised. */
export interface ArticleContent {
  title: string
  html: string
  updatedAt: Date
  canonicalUrl: string
}

/**
 * A live position in a paginated feed. Hides *how* a source paginates —
 * MediaWiki continuation, offsets, date windows are all implementable here.
 */
export interface FeedCursor {
  /** The next batch of items, or `null` once the source is exhausted. */
  next(): Promise<FeedItem[] | null>
}

/** The swappable wiki backend. Implement this to support a different wiki. */
export interface WikiSource {
  readonly id: string
  readonly displayName: string
  openFeed(opts: { sort: SortOrder; pageSize: number }): FeedCursor
  fetchArticle(ref: { pageId: number; title: string }): Promise<ArticleContent>
}
