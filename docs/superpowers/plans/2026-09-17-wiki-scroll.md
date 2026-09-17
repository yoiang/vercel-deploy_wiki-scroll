# Wiki Scroll V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an infinite, Instagram-style scroll of recently-updated Wikipedia articles, with a full article view, a hamburger drawer and a placeholder settings page, architected so the wiki backend can be swapped later.

**Architecture:** A `WikiSource` interface isolates all wiki-specific knowledge in `src/wiki/`. `MediaWikiSource` is the only file that imports `m3api`. Pagination is hidden behind a `FeedCursor` returning batches of `FeedItem`. A module-singleton `feedStore` accumulates, deduplicates and caches items in memory, filtering them through a swappable `FeedPolicy`. The UI layer speaks only in `FeedItem` and `ArticleContent`.

**Tech Stack:** TypeScript, Vite, Solid 1.9, Capacitor 8, `m3api` (MediaWiki API), `@solidjs/router`, DOMPurify, Vitest + jsdom, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-17-wiki-scroll-design.md`

## Global Constraints

- **Never run `git` commands.** The user owns all version control. Each task ends with a verification step instead of a commit. Report what changed; do not stage or commit it.
- `npm install` and `npx vitest` **are** permitted, and should be used to verify work.
- `tsconfig.app.json` sets `verbatimModuleSyntax: true` — **all type-only imports must use `import type { … }`**, or the build fails.
- `tsconfig.app.json` sets `erasableSyntaxOnly: true` — **no `enum`, no `namespace`, no constructor parameter properties.** Use union types and explicit field declarations.
- `tsconfig.app.json` sets `allowImportingTsExtensions: true` — relative imports in `src/` include the extension (`./types.ts`, `./App.tsx`), matching the existing `src/index.tsx`.
- `noUnusedLocals` and `noUnusedParameters` are on. Unused imports and parameters are build errors.
- **m3api ships no `exports` map**, so `import Session from 'm3api/browser.js'` resolves to `any` by default. Task 1 adds a `paths` mapping that fixes this; it is verified to work under `strict`.
- **m3api's own types are loose** — `request()` returns `any` and `requestAndContinue()` returns `{}`. `src/wiki/mediawiki.ts` declares its own narrow response interfaces and casts once at the boundary. No other file may cast.
- **Never install `@types/dompurify`** — it is a deprecated stub; DOMPurify ships its own types.
- Target wiki domain for V1 is `en.wikipedia.org`; User-Agent placeholder is `wiki-scroll/0.1`.
- Tests perform **no network I/O**. `WikiSource` and `FeedCursor` are injected so fakes can be substituted.

---

### Task 1: Project setup — dependencies, Vitest, TypeScript configuration

**Files:**
- Modify: `package.json` (dependencies, scripts)
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`
- Test: `src/setup.test.ts` (temporary smoke test, deleted in Task 2)

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test`, a type-resolvable `m3api/browser.js` import, and `strict` type checking for every later task.

- [ ] **Step 1: Install dependencies**

```bash
npm install m3api @solidjs/router dompurify
npm install -D vitest jsdom
```

Do **not** install `@types/dompurify`. It is a deprecated stub package; DOMPurify 3.x ships its own type definitions.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

Replace the whole file with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

The triple-slash reference is required: `tsconfig.node.json` sets `types: ["node"]`, which would otherwise leave the `test` key unrecognised.

- [ ] **Step 4: Fix m3api type resolution and enable strict mode**

In `tsconfig.app.json`, add these two keys inside `compilerOptions`:

```json
    "strict": true,
    "paths": {
      "m3api/browser.js": ["./node_modules/m3api/types/browser.d.ts"]
    },
```

The `paths` entry is necessary because m3api's `package.json` declares `"types": "types/node.d.ts"` with no `exports` map, so TypeScript cannot find declarations for the browser entry point and falls back to `any`. This mapping has been verified to type-check cleanly under `strict`.

`strict` is off in the scaffold. Turning it on now — before any real code exists — is far cheaper than retrofitting, and the design leans on optional fields (`FeedItem.image`) and nullable returns (`FeedCursor.next()`) whose safety depends on `strictNullChecks`.

- [ ] **Step 5: Write a smoke test proving the harness works**

Create `src/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })

  it('provides a jsdom document', () => {
    expect(typeof document.createElement).toBe('function')
  })
})
```

- [ ] **Step 6: Run the tests and the type checker**

Run: `npx vitest run`
Expected: 2 tests pass.

Run: `npx tsc -b`
Expected: exits 0 with no output. If it reports errors in `src/App.tsx` from the newly enabled `strict` mode, leave them — Task 7 deletes that file. If it reports errors anywhere else, fix them before continuing.

- [ ] **Step 7: Verify and report**

Confirm `npm test` passes and report the dependency versions installed. Do not commit.

---

### Task 2: Domain types and feed mapping

**Files:**
- Create: `src/wiki/types.ts`
- Create: `src/wiki/mediawiki.ts`
- Create: `src/wiki/fixtures/recentchanges.ts`
- Test: `src/wiki/mediawiki.test.ts`
- Delete: `src/setup.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type SortOrder = 'recently-updated'`
  - `interface FeedItem { id: string; pageId: number; title: string; updatedAt: Date; summary: string; image?: { url: string; width: number; height: number } }`
  - `interface ArticleContent { title: string; html: string; updatedAt: Date; canonicalUrl: string }`
  - `interface FeedCursor { next(): Promise<FeedItem[] | null> }`
  - `interface WikiSource { readonly id: string; readonly displayName: string; openFeed(opts: { sort: SortOrder; pageSize: number }): FeedCursor; fetchArticle(ref: { pageId: number; title: string }): Promise<ArticleContent> }`
  - `function mapPagesToItems(sourceId: string, pages: RecentChangesPage[]): FeedItem[]`
  - `class MediaWikiFeedCursor implements FeedCursor` — constructed from `(sourceId, AsyncIterator<RecentChangesResponse>)`

- [ ] **Step 1: Write the domain types**

Create `src/wiki/types.ts`:

```ts
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
```

- [ ] **Step 2: Create the test fixture from real API data**

Create `src/wiki/fixtures/recentchanges.ts`. This is a trimmed capture of a real `en.wikipedia.org` response. Note that the pages are deliberately **not** in timestamp order — that is the real API behaviour this code must correct for.

```ts
import type { RecentChangesResponse } from '../mediawiki.ts'

/**
 * A real (trimmed) response from en.wikipedia.org. Deliberately preserves
 * three properties of live data:
 *   - pages arrive in page-ID order, NOT timestamp order
 *   - some pages have no thumbnail
 *   - some pages have a very short or absent extract
 */
export const recentChangesBatch: RecentChangesResponse = {
  query: {
    pages: [
      {
        pageid: 1,
        title: 'Apple II (original)',
        extract: 'The Apple II is an 8-bit home computer.',
        thumbnail: { source: 'https://upload.wikimedia.org/a.jpg', width: 800, height: 709 },
        revisions: [{ timestamp: '2026-09-17T10:53:50Z' }],
      },
      {
        pageid: 2,
        title: 'List of Toyota engines',
        extract: 'This is a list of engines.',
        revisions: [{ timestamp: '2026-09-17T10:53:55Z' }],
      },
      {
        pageid: 3,
        title: 'Commonwealth Law Reports',
        extract: 'The Commonwealth Law Reports are law reports.',
        thumbnail: { source: 'https://upload.wikimedia.org/c.jpg', width: 800, height: 602 },
        revisions: [{ timestamp: '2026-09-17T10:53:51Z' }],
      },
      {
        pageid: 4,
        title: 'Alec Smir',
        thumbnail: { source: 'https://upload.wikimedia.org/d.jpg', width: 403, height: 531 },
        revisions: [{ timestamp: '2026-09-17T10:53:49Z' }],
      },
    ],
  },
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/wiki/mediawiki.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MediaWikiFeedCursor, mapPagesToItems } from './mediawiki.ts'
import type { RecentChangesResponse } from './mediawiki.ts'
import { recentChangesBatch } from './fixtures/recentchanges.ts'

const pages = recentChangesBatch.query!.pages!

describe('mapPagesToItems', () => {
  it('maps every page to a FeedItem', () => {
    expect(mapPagesToItems('wikipedia-en', pages)).toHaveLength(4)
  })

  it('builds a source-qualified id', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.id)).toContain('wikipedia-en:1')
  })

  it('sorts the batch by updatedAt descending', () => {
    const items = mapPagesToItems('wikipedia-en', pages)
    expect(items.map((i) => i.title)).toEqual([
      'List of Toyota engines',    // 10:53:55
      'Commonwealth Law Reports',  // 10:53:51
      'Apple II (original)',       // 10:53:50
      'Alec Smir',                 // 10:53:49
    ])
  })

  it('maps a thumbnail to an image', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.image).toEqual({
      url: 'https://upload.wikimedia.org/a.jpg',
      width: 800,
      height: 709,
    })
  })

  it('leaves image undefined when the page has no thumbnail', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 2)!
    expect(item.image).toBeUndefined()
  })

  it('uses an empty summary when the page has no extract', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 4)!
    expect(item.summary).toBe('')
  })

  it('parses the revision timestamp into a Date', () => {
    const item = mapPagesToItems('wikipedia-en', pages).find((i) => i.pageId === 1)!
    expect(item.updatedAt.toISOString()).toBe('2026-09-17T10:53:50.000Z')
  })
})

/** Builds an async iterator over canned responses, standing in for m3api. */
async function* fakeResponses(
  ...responses: RecentChangesResponse[]
): AsyncGenerator<RecentChangesResponse> {
  for (const response of responses) yield response
}

describe('MediaWikiFeedCursor', () => {
  it('returns a mapped batch on next()', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    const batch = await cursor.next()
    expect(batch).toHaveLength(4)
  })

  it('returns null once the iterator is exhausted', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses(recentChangesBatch))
    await cursor.next()
    expect(await cursor.next()).toBeNull()
  })

  it('keeps returning null after exhaustion', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses())
    expect(await cursor.next()).toBeNull()
    expect(await cursor.next()).toBeNull()
  })

  it('returns an empty batch rather than null when a response has no pages', async () => {
    const cursor = new MediaWikiFeedCursor('wikipedia-en', fakeResponses({ query: {} }))
    expect(await cursor.next()).toEqual([])
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/mediawiki.test.ts`
Expected: FAIL — cannot resolve `./mediawiki.ts`.

- [ ] **Step 5: Implement the mapping and cursor**

Create `src/wiki/mediawiki.ts`:

```ts
import type { FeedCursor, FeedItem } from './types.ts'

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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/mediawiki.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 7: Delete the temporary smoke test**

Delete `src/setup.test.ts`. It existed only to prove the harness worked in Task 1.

- [ ] **Step 8: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 3: Feed policy

**Files:**
- Create: `src/feed/policy.ts`
- Test: `src/feed/policy.test.ts`

**Interfaces:**
- Consumes: `FeedItem` from `src/wiki/types.ts`
- Produces:
  - `interface FeedPolicy { accept(item: FeedItem): boolean }`
  - `const requireImage: FeedPolicy`
  - `const acceptAll: FeedPolicy`

- [ ] **Step 1: Write the failing tests**

Create `src/feed/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acceptAll, requireImage } from './policy.ts'
import type { FeedItem } from '../wiki/types.ts'

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'wikipedia-en:1',
    pageId: 1,
    title: 'Test',
    updatedAt: new Date('2026-09-17T10:00:00Z'),
    summary: 'A summary.',
    image: { url: 'https://example.org/a.jpg', width: 800, height: 600 },
    ...overrides,
  }
}

describe('requireImage', () => {
  it('accepts an item with an image', () => {
    expect(requireImage.accept(item())).toBe(true)
  })

  it('rejects an item with no image', () => {
    expect(requireImage.accept(item({ image: undefined }))).toBe(false)
  })
})

describe('acceptAll', () => {
  it('accepts an item with an image', () => {
    expect(acceptAll.accept(item())).toBe(true)
  })

  it('accepts an item with no image', () => {
    expect(acceptAll.accept(item({ image: undefined }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/feed/policy.test.ts`
Expected: FAIL — cannot resolve `./policy.ts`.

- [ ] **Step 3: Implement the policies**

Create `src/feed/policy.ts`:

```ts
import type { FeedItem } from '../wiki/types.ts'

/**
 * Decides which items may enter the feed.
 *
 * This indirection exists for planned features: a settings toggle will swap
 * `requireImage` for `acceptAll`, and generated images will become a transform
 * stage applied before `accept` is consulted. Neither change touches feedStore.
 */
export interface FeedPolicy {
  accept(item: FeedItem): boolean
}

/** V1 default. Roughly half of recently-edited articles have no thumbnail;
 *  skipping them keeps the feed's visual rhythm consistent. */
export const requireImage: FeedPolicy = {
  accept: (item) => item.image !== undefined,
}

/** Lets every item through. Wired to a settings toggle in a later iteration. */
export const acceptAll: FeedPolicy = {
  accept: () => true,
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/feed/policy.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 4: Feed store

**Files:**
- Create: `src/feed/feedStore.ts`
- Test: `src/feed/feedStore.test.ts`

**Interfaces:**
- Consumes: `FeedItem`, `FeedCursor`, `WikiSource` from `src/wiki/types.ts`; `FeedPolicy` from `src/feed/policy.ts`
- Produces:
  - `type FeedStatus = 'idle' | 'loading' | 'exhausted' | 'error'`
  - `function createFeedStore(source: WikiSource, policy: FeedPolicy): FeedStore`
  - `interface FeedStore { items: () => FeedItem[]; status: () => FeedStatus; error: () => Error | null; scrollOffset: () => number; setScrollOffset: (n: number) => void; loadMore: () => Promise<void>; retry: () => Promise<void> }`
  - `const TARGET_ITEMS_PER_LOAD = 10`, `const MAX_BATCHES_PER_LOAD = 5`

- [ ] **Step 1: Write the failing tests**

Create `src/feed/feedStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFeedStore } from './feedStore.ts'
import { acceptAll, requireImage } from './policy.ts'
import type { ArticleContent, FeedCursor, FeedItem, WikiSource } from '../wiki/types.ts'

function item(pageId: number, withImage = true): FeedItem {
  return {
    id: `fake:${pageId}`,
    pageId,
    title: `Article ${pageId}`,
    updatedAt: new Date('2026-09-17T10:00:00Z'),
    summary: 'A summary.',
    image: withImage ? { url: 'https://example.org/a.jpg', width: 800, height: 600 } : undefined,
  }
}

/** A WikiSource whose feed yields the given batches in order, then exhausts. */
function fakeSource(batches: FeedItem[][]): WikiSource & { batchesRequested: () => number } {
  let requested = 0
  const cursor: FeedCursor = {
    async next() {
      if (requested >= batches.length) return null
      return batches[requested++]!
    },
  }
  return {
    id: 'fake',
    displayName: 'Fake',
    openFeed: () => cursor,
    fetchArticle: async (): Promise<ArticleContent> => {
      throw new Error('not used in these tests')
    },
    batchesRequested: () => requested,
  }
}

/** A WikiSource whose cursor always throws. */
function failingSource(): WikiSource {
  return {
    id: 'fake',
    displayName: 'Fake',
    openFeed: () => ({
      async next(): Promise<FeedItem[] | null> {
        throw new Error('network down')
      },
    }),
    fetchArticle: async (): Promise<ArticleContent> => {
      throw new Error('not used in these tests')
    },
  }
}

describe('createFeedStore', () => {
  it('starts empty and idle', () => {
    const store = createFeedStore(fakeSource([]), acceptAll)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('appends accepted items on loadMore', async () => {
    const store = createFeedStore(fakeSource([[item(1), item(2)]]), acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2])
  })

  it('filters items rejected by the policy', async () => {
    const batch = [item(1, true), item(2, false), item(3, true)]
    const store = createFeedStore(fakeSource([batch]), requireImage)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 3])
  })

  it('deduplicates items already in the feed', async () => {
    const store = createFeedStore(fakeSource([[item(1), item(2)], [item(2), item(3)]]), acceptAll)
    await store.loadMore()
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1, 2, 3])
  })

  it('deduplicates within a single batch', async () => {
    const store = createFeedStore(fakeSource([[item(1), item(1)]]), acceptAll)
    await store.loadMore()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('keeps pulling batches until the target is met', async () => {
    // Four batches of 3 accepted items; target is 10, so it needs four batches.
    const batches = [
      [item(1), item(2), item(3)],
      [item(4), item(5), item(6)],
      [item(7), item(8), item(9)],
      [item(10), item(11), item(12)],
    ]
    const source = fakeSource(batches)
    const store = createFeedStore(source, acceptAll)
    await store.loadMore()
    expect(store.items().length).toBeGreaterThanOrEqual(10)
    expect(source.batchesRequested()).toBe(4)
  })

  it('stops at the batch cap even when the target is unmet', async () => {
    // Ten batches of one rejected item each. Target can never be met.
    const batches = Array.from({ length: 10 }, (_, n) => [item(n + 1, false)])
    const source = fakeSource(batches)
    const store = createFeedStore(source, requireImage)
    await store.loadMore()
    expect(source.batchesRequested()).toBe(5)
    expect(store.items()).toEqual([])
    expect(store.status()).toBe('idle')
  })

  it('becomes exhausted when the cursor runs dry', async () => {
    const store = createFeedStore(fakeSource([[item(1)]]), acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('exhausted')
  })

  it('does nothing further once exhausted', async () => {
    const source = fakeSource([[item(1)]])
    const store = createFeedStore(source, acceptAll)
    await store.loadMore()
    const batchesAfterFirst = source.batchesRequested()
    await store.loadMore()
    expect(source.batchesRequested()).toBe(batchesAfterFirst)
  })

  it('enters error status when the cursor throws', async () => {
    const store = createFeedStore(failingSource(), acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.error()?.message).toBe('network down')
  })

  it('keeps already-loaded items when a later load fails', async () => {
    let calls = 0
    const source: WikiSource = {
      id: 'fake',
      displayName: 'Fake',
      openFeed: () => ({
        async next(): Promise<FeedItem[] | null> {
          calls++
          if (calls === 1) return [item(1)]
          throw new Error('network down')
        },
      }),
      fetchArticle: async (): Promise<ArticleContent> => {
        throw new Error('not used in these tests')
      },
    }
    const store = createFeedStore(source, acceptAll)
    await store.loadMore()
    await store.loadMore()
    expect(store.status()).toBe('error')
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('retry clears the error and loads again', async () => {
    let calls = 0
    const source: WikiSource = {
      id: 'fake',
      displayName: 'Fake',
      openFeed: () => ({
        async next(): Promise<FeedItem[] | null> {
          calls++
          if (calls === 1) throw new Error('network down')
          return [item(1)]
        },
      }),
      fetchArticle: async (): Promise<ArticleContent> => {
        throw new Error('not used in these tests')
      },
    }
    const store = createFeedStore(source, acceptAll)
    await store.loadMore()
    expect(store.status()).toBe('error')
    await store.retry()
    expect(store.error()).toBeNull()
    expect(store.items().map((i) => i.pageId)).toEqual([1])
  })

  it('ignores a concurrent loadMore while one is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const source: WikiSource = {
      id: 'fake',
      displayName: 'Fake',
      openFeed: () => ({
        async next(): Promise<FeedItem[] | null> {
          calls++
          await gate
          return null
        },
      }),
      fetchArticle: async (): Promise<ArticleContent> => {
        throw new Error('not used in these tests')
      },
    }
    const store = createFeedStore(source, acceptAll)
    const first = store.loadMore()
    const second = store.loadMore()
    release()
    await Promise.all([first, second])
    expect(calls).toBe(1)
  })

  it('remembers a scroll offset', () => {
    const store = createFeedStore(fakeSource([]), acceptAll)
    store.setScrollOffset(420)
    expect(store.scrollOffset()).toBe(420)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/feed/feedStore.test.ts`
Expected: FAIL — cannot resolve `./feedStore.ts`.

- [ ] **Step 3: Implement the store**

Create `src/feed/feedStore.ts`:

```ts
import { createSignal } from 'solid-js'
import type { FeedCursor, FeedItem, WikiSource } from '../wiki/types.ts'
import type { FeedPolicy } from './policy.ts'

export type FeedStatus = 'idle' | 'loading' | 'exhausted' | 'error'

/** How many accepted items one loadMore() aims to add. */
export const TARGET_ITEMS_PER_LOAD = 10

/**
 * Hard cap on API batches consumed per loadMore(). Without this, a long run of
 * policy-rejected items (e.g. imageless articles) would spin indefinitely.
 */
export const MAX_BATCHES_PER_LOAD = 5

export interface FeedStore {
  items: () => FeedItem[]
  status: () => FeedStatus
  error: () => Error | null
  scrollOffset: () => number
  setScrollOffset: (offset: number) => void
  loadMore: () => Promise<void>
  retry: () => Promise<void>
}

export function createFeedStore(source: WikiSource, policy: FeedPolicy): FeedStore {
  const [items, setItems] = createSignal<FeedItem[]>([])
  const [status, setStatus] = createSignal<FeedStatus>('idle')
  const [error, setError] = createSignal<Error | null>(null)
  const [scrollOffset, setScrollOffset] = createSignal(0)

  const seenIds = new Set<string>()
  let cursor: FeedCursor | null = null
  let inFlight = false

  function openCursor(): FeedCursor {
    cursor ??= source.openFeed({ sort: 'recently-updated', pageSize: TARGET_ITEMS_PER_LOAD })
    return cursor
  }

  async function loadMore(): Promise<void> {
    if (inFlight) return
    if (status() === 'exhausted' || status() === 'error') return

    inFlight = true
    setStatus('loading')

    // Declared outside the try so that a failure partway through a multi-batch
    // load still commits the batches that did succeed. Without this, one bad
    // request discards up to four batches of good items.
    const accepted: FeedItem[] = []

    try {
      let batches = 0
      let exhausted = false

      while (accepted.length < TARGET_ITEMS_PER_LOAD && batches < MAX_BATCHES_PER_LOAD) {
        const batch = await openCursor().next()
        batches++

        if (batch === null) {
          exhausted = true
          break
        }

        for (const candidate of batch) {
          if (seenIds.has(candidate.id)) continue
          if (!policy.accept(candidate)) continue
          seenIds.add(candidate.id)
          accepted.push(candidate)
        }
      }

      setStatus(exhausted ? 'exhausted' : 'idle')
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)))
      setStatus('error')
    } finally {
      if (accepted.length > 0) {
        setItems((previous) => [...previous, ...accepted])
      }
      inFlight = false
    }
  }

  async function retry(): Promise<void> {
    if (status() !== 'error') return
    setError(null)
    setStatus('idle')
    await loadMore()
  }

  return { items, status, error, scrollOffset, setScrollOffset, loadMore, retry }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/feed/feedStore.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 5: HTML sanitisation

**Files:**
- Create: `src/lib/sanitizeWikiHtml.ts`
- Test: `src/lib/sanitizeWikiHtml.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `function sanitizeWikiHtml(html: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sanitizeWikiHtml.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sanitizeWikiHtml } from './sanitizeWikiHtml.ts'

describe('sanitizeWikiHtml', () => {
  it('removes script tags', () => {
    const result = sanitizeWikiHtml('<p>Safe</p><script>alert(1)</script>')
    expect(result).not.toContain('script')
    expect(result).toContain('Safe')
  })

  it('removes inline event handlers', () => {
    const result = sanitizeWikiHtml('<img src="https://example.org/a.jpg" onerror="alert(1)">')
    expect(result).not.toContain('onerror')
  })

  it('preserves ordinary article markup', () => {
    const result = sanitizeWikiHtml('<p>An <b>article</b> with a <a href="/wiki/Link">link</a>.</p>')
    expect(result).toContain('<b>article</b>')
    expect(result).toContain('href="/wiki/Link"')
  })

  it('preserves tables and infoboxes', () => {
    const result = sanitizeWikiHtml('<table class="infobox"><tr><td>Cell</td></tr></table>')
    expect(result).toContain('infobox')
    expect(result).toContain('Cell')
  })

  it('upgrades protocol-relative image sources to https', () => {
    const result = sanitizeWikiHtml('<img src="//upload.wikimedia.org/a.jpg">')
    expect(result).toContain('src="https://upload.wikimedia.org/a.jpg"')
  })

  it('upgrades protocol-relative srcset entries to https', () => {
    const result = sanitizeWikiHtml(
      '<img src="//upload.wikimedia.org/a.jpg" srcset="//upload.wikimedia.org/a2.jpg 2x">',
    )
    expect(result).toContain('https://upload.wikimedia.org/a2.jpg 2x')
  })

  it('leaves absolute image sources untouched', () => {
    const result = sanitizeWikiHtml('<img src="https://upload.wikimedia.org/a.jpg">')
    expect(result).toContain('src="https://upload.wikimedia.org/a.jpg"')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeWikiHtml('')).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/sanitizeWikiHtml.test.ts`
Expected: FAIL — cannot resolve `./sanitizeWikiHtml.ts`.

- [ ] **Step 3: Implement sanitisation**

Create `src/lib/sanitizeWikiHtml.ts`:

```ts
import DOMPurify from 'dompurify'

/** Rewrites a protocol-relative URL (`//host/path`) to explicit https. */
function toHttps(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

/** Rewrites every URL in a srcset descriptor list. */
function srcsetToHttps(srcset: string): string {
  return srcset
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim()
      const spaceAt = trimmed.indexOf(' ')
      if (spaceAt === -1) return toHttps(trimmed)
      return `${toHttps(trimmed.slice(0, spaceAt))}${trimmed.slice(spaceAt)}`
    })
    .join(', ')
}

/**
 * Sanitises article HTML from the wiki and normalises its image URLs.
 *
 * Wikipedia content is user-editable and we inject it with innerHTML, so
 * sanitisation is mandatory rather than defensive. MediaWiki also emits
 * protocol-relative image URLs, which break under Capacitor's custom scheme,
 * so they are upgraded to https here.
 */
export function sanitizeWikiHtml(html: string): string {
  if (html === '') return ''

  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const document_ = new DOMParser().parseFromString(clean, 'text/html')

  for (const image of document_.querySelectorAll('img')) {
    const source = image.getAttribute('src')
    if (source) image.setAttribute('src', toHttps(source))

    const srcset = image.getAttribute('srcset')
    if (srcset) image.setAttribute('srcset', srcsetToHttps(srcset))
  }

  return document_.body.innerHTML
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sanitizeWikiHtml.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 6: Relative time formatting

**Files:**
- Create: `src/lib/formatRelativeTime.ts`
- Test: `src/lib/formatRelativeTime.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `function formatRelativeTime(date: Date, now?: Date): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/formatRelativeTime.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime.ts'

const now = new Date('2026-09-17T12:00:00Z')

function ago(milliseconds: number): Date {
  return new Date(now.getTime() - milliseconds)
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatRelativeTime', () => {
  it('describes the last minute as "just now"', () => {
    expect(formatRelativeTime(ago(30 * SECOND), now)).toBe('just now')
  })

  it('describes a single minute', () => {
    expect(formatRelativeTime(ago(1 * MINUTE), now)).toBe('1 minute ago')
  })

  it('pluralises minutes', () => {
    expect(formatRelativeTime(ago(5 * MINUTE), now)).toBe('5 minutes ago')
  })

  it('describes a single hour', () => {
    expect(formatRelativeTime(ago(1 * HOUR), now)).toBe('1 hour ago')
  })

  it('pluralises hours', () => {
    expect(formatRelativeTime(ago(4 * HOUR), now)).toBe('4 hours ago')
  })

  it('describes a single day', () => {
    expect(formatRelativeTime(ago(1 * DAY), now)).toBe('1 day ago')
  })

  it('pluralises days', () => {
    expect(formatRelativeTime(ago(3 * DAY), now)).toBe('3 days ago')
  })

  it('falls back to an absolute date beyond a week', () => {
    expect(formatRelativeTime(new Date('2026-01-05T12:00:00Z'), now)).toBe('5 Jan 2026')
  })

  it('treats a future timestamp as "just now" rather than negative', () => {
    expect(formatRelativeTime(new Date('2026-09-17T12:00:30Z'), now)).toBe('just now')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/formatRelativeTime.test.ts`
Expected: FAIL — cannot resolve `./formatRelativeTime.ts`.

- [ ] **Step 3: Implement the formatter**

Create `src/lib/formatRelativeTime.ts`:

```ts
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}

/**
 * Renders a timestamp as a short relative string for the feed.
 * `now` is injectable so tests need not manipulate the system clock.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < WEEK) return plural(Math.floor(elapsed / DAY), 'day')

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/formatRelativeTime.test.ts`
Expected: PASS, 9 tests.

If the absolute-date test fails on formatting, check the exact string Node's ICU produces for `en-GB` and align the test to it — the requirement is a short unambiguous date, not one exact punctuation style.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 7: MediaWikiSource — wiring m3api, article fetch, and the source registry

**Files:**
- Modify: `src/wiki/mediawiki.ts` (add `MediaWikiSource`, `parseResponseToArticle`)
- Create: `src/wiki/registry.ts`
- Test: `src/wiki/mediawiki.test.ts` (add cases), `src/wiki/registry.test.ts`

**Interfaces:**
- Consumes: `WikiSource`, `FeedCursor`, `ArticleContent` from `src/wiki/types.ts`; `sanitizeWikiHtml` from `src/lib/sanitizeWikiHtml.ts`; `MediaWikiFeedCursor`, `mapPagesToItems` from Task 2
- Produces:
  - `interface MediaWikiSourceConfig { id: string; displayName: string; domain: string; userAgent: string }`
  - `interface ParseResponse { parse?: { title: string; text: string; revid?: number } }`
  - `function parseResponseToArticle(config: MediaWikiSourceConfig, response: ParseResponse, updatedAt: Date): ArticleContent`
  - `class MediaWikiSource implements WikiSource`
  - `const WIKIPEDIA_EN: MediaWikiSourceConfig`, `function getActiveSource(): WikiSource`

- [ ] **Step 1: Write the failing tests for article parsing**

Append to `src/wiki/mediawiki.test.ts`:

```ts
import { parseResponseToArticle } from './mediawiki.ts'
import type { MediaWikiSourceConfig } from './mediawiki.ts'

const testConfig: MediaWikiSourceConfig = {
  id: 'wikipedia-en',
  displayName: 'Wikipedia (English)',
  domain: 'en.wikipedia.org',
  userAgent: 'wiki-scroll/0.1',
}

describe('parseResponseToArticle', () => {
  const updatedAt = new Date('2026-09-17T10:53:50Z')

  it('extracts the title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.title).toBe('Apple II')
  })

  it('sanitises the html', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p><script>alert(1)</script>' } },
      updatedAt,
    )
    expect(article.html).toContain('Hi')
    expect(article.html).not.toContain('script')
  })

  it('builds a canonical url from the config domain and title', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II (original)', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.canonicalUrl).toBe('https://en.wikipedia.org/wiki/Apple%20II%20(original)')
  })

  it('carries the updatedAt through', () => {
    const article = parseResponseToArticle(
      testConfig,
      { parse: { title: 'Apple II', text: '<p>Hi</p>' } },
      updatedAt,
    )
    expect(article.updatedAt).toBe(updatedAt)
  })

  it('throws a descriptive error when the response has no parse block', () => {
    expect(() => parseResponseToArticle(testConfig, {}, updatedAt)).toThrow(/no parse/i)
  })
})
```

- [ ] **Step 2: Write the failing tests for the registry**

Create `src/wiki/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WIKIPEDIA_EN, getActiveSource } from './registry.ts'

describe('registry', () => {
  it('configures English Wikipedia', () => {
    expect(WIKIPEDIA_EN.domain).toBe('en.wikipedia.org')
    expect(WIKIPEDIA_EN.id).toBe('wikipedia-en')
  })

  it('sets an identifying user agent', () => {
    expect(WIKIPEDIA_EN.userAgent).toContain('wiki-scroll')
  })

  it('returns a source exposing the WikiSource interface', () => {
    const source = getActiveSource()
    expect(source.id).toBe('wikipedia-en')
    expect(typeof source.openFeed).toBe('function')
    expect(typeof source.fetchArticle).toBe('function')
  })

  it('returns the same instance on repeated calls', () => {
    expect(getActiveSource()).toBe(getActiveSource())
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/`
Expected: FAIL — `parseResponseToArticle` is not exported; `./registry.ts` cannot be resolved.

- [ ] **Step 4: Add MediaWikiSource to `src/wiki/mediawiki.ts`**

Add these imports at the top of the existing file (merge with the existing `import type` line):

```ts
import Session from 'm3api/browser.js'
import { sanitizeWikiHtml } from '../lib/sanitizeWikiHtml.ts'
import type { ArticleContent, SortOrder, WikiSource } from './types.ts'
```

Append to the end of the file:

```ts
export interface MediaWikiSourceConfig {
  id: string
  displayName: string
  /** Bare wiki domain, e.g. 'en.wikipedia.org'. Retargeting a different
   *  MediaWiki wiki is a change to this value and nothing else. */
  domain: string
  /** Sent as `api-user-agent`; Wikimedia's etiquette policy asks for one. */
  userAgent: string
}

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
    html: sanitizeWikiHtml(parse.text),
    updatedAt,
    canonicalUrl: `https://${config.domain}/wiki/${encodeURI(parse.title).replace(/'/g, '%27')}`,
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
    this.#session = new Session(
      config.domain,
      { formatversion: 2, errorformat: 'plaintext' },
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
    const response = (await this.#session.request({
      action: 'parse',
      pageid: ref.pageId,
      prop: ['text'],
      disableeditsection: true,
      disabletoc: true,
    })) as ParseResponse

    return parseResponseToArticle(this.#config, response, new Date())
  }
}
```

Do not introduce a local variable for `opts.sort` to "use" it. `noUnusedLocals` does **not** exempt underscore-prefixed locals (only `noUnusedParameters` exempts underscore-prefixed *parameters*), so `const _sort = opts.sort` is a build error. Reading `opts.pageSize` is sufficient: the parameter is used, and an unread property is not an error.

- [ ] **Step 5: Create the registry**

Create `src/wiki/registry.ts`:

```ts
import { MediaWikiSource } from './mediawiki.ts'
import type { MediaWikiSourceConfig } from './mediawiki.ts'
import type { WikiSource } from './types.ts'

/**
 * Wikimedia's API etiquette asks for a User-Agent identifying the application
 * with contact information. The placeholder below must be replaced before this
 * app is distributed — see the README section "Before distributing this app".
 */
export const WIKIPEDIA_EN: MediaWikiSourceConfig = {
  id: 'wikipedia-en',
  displayName: 'Wikipedia (English)',
  domain: 'en.wikipedia.org',
  userAgent: 'wiki-scroll/0.1',
}

/**
 * Every configured wiki. Adding another MediaWiki site means adding an entry
 * here; supporting a non-MediaWiki wiki means writing another WikiSource.
 */
export const SOURCES: MediaWikiSourceConfig[] = [WIKIPEDIA_EN]

let active: WikiSource | null = null

/** The source the app currently reads from. A later iteration makes this
 *  selectable from the settings page. */
export function getActiveSource(): WikiSource {
  active ??= new MediaWikiSource(WIKIPEDIA_EN)
  return active
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/`
Expected: PASS — 11 tests from Task 2, 5 new parse tests, 4 registry tests.

- [ ] **Step 7: Verify the live integration manually**

Create a temporary file `src/wiki/live-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getActiveSource } from './registry.ts'

// Hits the network. Run explicitly, not as part of `npm test`.
describe.skip('live Wikipedia integration', () => {
  it('fetches a feed batch and an article', async () => {
    const source = getActiveSource()
    const batch = await source.openFeed({ sort: 'recently-updated', pageSize: 5 }).next()
    expect(batch).not.toBeNull()
    expect(batch!.length).toBeGreaterThan(0)

    const article = await source.fetchArticle(batch![0]!)
    expect(article.html.length).toBeGreaterThan(100)
  }, 30_000)
})
```

Run it once with the skip removed to confirm the real API path works:
`npx vitest run src/wiki/live-check.test.ts -t 'fetches a feed batch'`

Then restore `describe.skip` so the default suite stays offline. Keep the file — it is a useful smoke test when swapping sources later.

- [ ] **Step 8: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass (the live check skipped), type check clean. Do not commit.

---

### Task 8: App shell — routing, app bar, drawer, settings page

**Files:**
- Create: `src/App.tsx` (replace scaffold contents entirely)
- Create: `src/components/AppBar.tsx`, `src/components/AppBar.module.css`
- Create: `src/components/Drawer.tsx`, `src/components/Drawer.module.css`
- Create: `src/routes/SettingsRoute.tsx`, `src/routes/SettingsRoute.module.css`
- Create: `src/routes/FeedRoute.tsx` (placeholder body, filled in Task 9)
- Create: `src/routes/ArticleRoute.tsx` (placeholder body, filled in Task 10)
- Modify: `src/index.css` (replace with app theme tokens)
- Delete: `src/App.css`, `src/assets/hero.png`, `src/assets/solid.svg`, `src/assets/vite.svg`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `AppBar` props: `{ title: string; leading: 'menu' | 'back'; onLeadingClick: () => void }`
  - `Drawer` props: `{ open: boolean; onClose: () => void }`
  - Routes `/`, `/article/:title`, `/settings`

- [ ] **Step 1: Replace the global stylesheet with theme tokens**

Replace the entire contents of `src/index.css`:

```css
:root {
  --bg: #fafafa;
  --surface: #ffffff;
  --border: #dbdbdb;
  --text: #171717;
  --muted: #737373;
  --accent: #0b63ce;
  --appbar-height: 3.25rem;

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --surface: #121212;
    --border: #262626;
    --text: #f5f5f5;
    --muted: #a3a3a3;
    --accent: #6ab0ff;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  /* Respect device notches on iOS. */
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
}

button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

a {
  color: var(--accent);
}
```

- [ ] **Step 2: Write the app bar**

Create `src/components/AppBar.module.css`:

```css
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: var(--appbar-height);
  padding: 0 0.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.leading {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  flex: none;
}

.leading:active {
  background: var(--border);
}

.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Create `src/components/AppBar.tsx`:

```tsx
import styles from './AppBar.module.css'

interface AppBarProps {
  title: string
  leading: 'menu' | 'back'
  onLeadingClick: () => void
}

export default function AppBar(props: AppBarProps) {
  return (
    <header class={styles.bar}>
      <button
        type="button"
        class={styles.leading}
        aria-label={props.leading === 'menu' ? 'Open menu' : 'Go back'}
        onClick={() => props.onLeadingClick()}
      >
        {props.leading === 'menu' ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" fill="none" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        )}
      </button>
      <h1 class={styles.title}>{props.title}</h1>
    </header>
  )
}
```

- [ ] **Step 3: Write the drawer**

Create `src/components/Drawer.module.css`:

```css
.scrim {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgb(0 0 0 / 45%);
}

.panel {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 21;
  width: min(17rem, 80vw);
  padding: 1rem 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  animation: slide-in 160ms ease-out;
}

@keyframes slide-in {
  from {
    transform: translateX(-100%);
  }
}

.heading {
  margin: 0 0 0.5rem;
  padding: 0 1.25rem;
  font-size: 1.1rem;
}

.item {
  display: block;
  width: 100%;
  padding: 0.9rem 1.25rem;
  text-align: left;
  text-decoration: none;
  color: var(--text);
}

.item:active {
  background: var(--border);
}
```

Create `src/components/Drawer.tsx`:

```tsx
import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  onClose: () => void
}

export default function Drawer(props: DrawerProps) {
  return (
    <Show when={props.open}>
      <div class={styles.scrim} onClick={() => props.onClose()} aria-hidden="true" />
      <nav class={styles.panel} aria-label="Main menu">
        <h2 class={styles.heading}>Wiki Scroll</h2>
        <A href="/settings" class={styles.item} onClick={() => props.onClose()}>
          Settings
        </A>
      </nav>
    </Show>
  )
}
```

- [ ] **Step 4: Write the settings route**

Create `src/routes/SettingsRoute.module.css`:

```css
.body {
  padding: 1.5rem 1.25rem;
  color: var(--muted);
}
```

Create `src/routes/SettingsRoute.tsx`:

```tsx
import { useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import styles from './SettingsRoute.module.css'

export default function SettingsRoute() {
  const navigate = useNavigate()

  return (
    <>
      <AppBar title="Settings" leading="back" onLeadingClick={() => navigate('/')} />
      <p class={styles.body}>No settings yet.</p>
    </>
  )
}
```

- [ ] **Step 5: Write route placeholders**

Create `src/routes/FeedRoute.tsx`:

```tsx
import { createSignal } from 'solid-js'
import AppBar from '../components/AppBar.tsx'
import Drawer from '../components/Drawer.tsx'

export default function FeedRoute() {
  const [menuOpen, setMenuOpen] = createSignal(false)

  return (
    <>
      <AppBar title="Wiki Scroll" leading="menu" onLeadingClick={() => setMenuOpen(true)} />
      <Drawer open={menuOpen()} onClose={() => setMenuOpen(false)} />
      <p>Feed goes here.</p>
    </>
  )
}
```

Create `src/routes/ArticleRoute.tsx`:

```tsx
import { useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'

export default function ArticleRoute() {
  const params = useParams<{ title: string }>()
  const navigate = useNavigate()

  return (
    <>
      <AppBar title="Article" leading="back" onLeadingClick={() => navigate(-1)} />
      <p>Article {decodeURIComponent(params.title)} goes here.</p>
    </>
  )
}
```

- [ ] **Step 6: Replace `src/App.tsx` with the router**

Replace the entire contents of `src/App.tsx`:

```tsx
import { Route, Router } from '@solidjs/router'
import ArticleRoute from './routes/ArticleRoute.tsx'
import FeedRoute from './routes/FeedRoute.tsx'
import SettingsRoute from './routes/SettingsRoute.tsx'

export default function App() {
  return (
    <Router>
      <Route path="/" component={FeedRoute} />
      <Route path="/article/:title" component={ArticleRoute} />
      <Route path="/settings" component={SettingsRoute} />
    </Router>
  )
}
```

- [ ] **Step 7: Delete the scaffold assets**

Delete `src/App.css`, `src/assets/hero.png`, `src/assets/solid.svg`, `src/assets/vite.svg`. They were Vite starter content and nothing imports them any more.

- [ ] **Step 8: Verify navigation in the browser**

Run: `npm run dev`

Confirm by hand:
1. `/` shows the app bar with a hamburger and the text "Feed goes here."
2. Tapping the hamburger opens the drawer; tapping the scrim closes it.
3. Tapping "Settings" navigates to `/settings` and closes the drawer.
4. The settings back button returns to `/`.
5. The browser back button also works from `/settings`.

Run: `npx vitest run && npx tsc -b`
Expected: all tests still pass, type check clean. Do not commit.

---

### Task 9: Feed route — article cards and infinite scroll

**Files:**
- Create: `src/components/ArticleCard.tsx`, `src/components/ArticleCard.module.css`
- Create: `src/feed/activeFeedStore.ts`
- Modify: `src/routes/FeedRoute.tsx` (replace placeholder body)
- Create: `src/routes/FeedRoute.module.css`

**Interfaces:**
- Consumes: `FeedItem` from `src/wiki/types.ts`; `createFeedStore`, `FeedStore` from `src/feed/feedStore.ts`; `requireImage` from `src/feed/policy.ts`; `getActiveSource` from `src/wiki/registry.ts`; `formatRelativeTime` from `src/lib/formatRelativeTime.ts`
- Produces:
  - `ArticleCard` props: `{ item: FeedItem }`
  - `const feedStore: FeedStore` (module singleton, from `src/feed/activeFeedStore.ts`)

- [ ] **Step 1: Create the singleton store**

Create `src/feed/activeFeedStore.ts`:

```ts
import { getActiveSource } from '../wiki/registry.ts'
import { createFeedStore } from './feedStore.ts'
import { requireImage } from './policy.ts'

/**
 * The app's one feed store. Being a module singleton is what makes the
 * in-memory cache work: navigating to an article and back re-mounts FeedRoute
 * against the same already-populated store, with no refetch.
 */
export const feedStore = createFeedStore(getActiveSource(), requireImage)
```

- [ ] **Step 2: Write the card styles**

Create `src/components/ArticleCard.module.css`:

```css
.card {
  display: block;
  width: 100%;
  padding: 0;
  text-align: left;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}

.headerTitle {
  font-weight: 600;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timestamp {
  flex: none;
  font-size: 0.8rem;
  color: var(--muted);
}

.image {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  background: var(--border);
}

.caption {
  padding: 0.75rem 1rem 1rem;
}

.captionTitle {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 600;
}

/*
 * Exactly four lines, with "… read more" pinned to the end of the fourth.
 * line-clamp cannot append text at the truncation point, so the affordance is
 * positioned over a short gradient that fades out the clipped text beneath it.
 */
.summary {
  position: relative;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  max-height: calc(4 * 1.45 * 0.9rem);
  color: var(--text);
}

.readMore {
  position: absolute;
  right: 0;
  bottom: 0;
  padding-left: 2.5rem;
  color: var(--muted);
  background: linear-gradient(to right, transparent, var(--surface) 2rem);
}
```

- [ ] **Step 3: Write the card component**

Create `src/components/ArticleCard.tsx`:

```tsx
import { Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { formatRelativeTime } from '../lib/formatRelativeTime.ts'
import type { FeedItem } from '../wiki/types.ts'
import styles from './ArticleCard.module.css'

interface ArticleCardProps {
  item: FeedItem
}

export default function ArticleCard(props: ArticleCardProps) {
  const navigate = useNavigate()

  function open() {
    navigate(`/article/${encodeURIComponent(props.item.title)}`, {
      state: { pageId: props.item.pageId },
    })
  }

  return (
    <article>
      <button type="button" class={styles.card} onClick={open}>
        <div class={styles.header}>
          <span class={styles.headerTitle}>{props.item.title}</span>
          <time class={styles.timestamp} dateTime={props.item.updatedAt.toISOString()}>
            {formatRelativeTime(props.item.updatedAt)}
          </time>
        </div>

        <Show when={props.item.image}>
          {(image) => (
            <img
              class={styles.image}
              src={image().url}
              alt=""
              loading="lazy"
              decoding="async"
            />
          )}
        </Show>

        <div class={styles.caption}>
          <h2 class={styles.captionTitle}>{props.item.title}</h2>
          <p class={styles.summary}>
            {props.item.summary}
            <span class={styles.readMore}>… read more</span>
          </p>
        </div>
      </button>
    </article>
  )
}
```

- [ ] **Step 4: Write the feed route styles**

Create `src/routes/FeedRoute.module.css`:

```css
.feed {
  max-width: 34rem;
  margin: 0 auto;
}

.sentinel {
  height: 1px;
}

.status {
  padding: 1.5rem 1rem 2.5rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.retry {
  margin-top: 0.75rem;
  padding: 0.55rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--accent);
}
```

- [ ] **Step 5: Replace the feed route**

Replace the entire contents of `src/routes/FeedRoute.tsx`:

```tsx
import { For, Match, Switch, createSignal, onCleanup, onMount } from 'solid-js'
import AppBar from '../components/AppBar.tsx'
import ArticleCard from '../components/ArticleCard.tsx'
import Drawer from '../components/Drawer.tsx'
import { feedStore } from '../feed/activeFeedStore.ts'
import styles from './FeedRoute.module.css'

export default function FeedRoute() {
  const [menuOpen, setMenuOpen] = createSignal(false)
  let sentinel: HTMLDivElement | undefined

  onMount(() => {
    // Restore the scroll position from before the user opened an article.
    // The store already holds the items, so there is nothing to wait for.
    window.scrollTo(0, feedStore.scrollOffset())

    const onScroll = () => feedStore.setScrollOffset(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    onCleanup(() => window.removeEventListener('scroll', onScroll))

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void feedStore.loadMore()
      },
      { rootMargin: '600px' },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())

    if (feedStore.items().length === 0) void feedStore.loadMore()
  })

  return (
    <>
      <AppBar title="Wiki Scroll" leading="menu" onLeadingClick={() => setMenuOpen(true)} />
      <Drawer open={menuOpen()} onClose={() => setMenuOpen(false)} />

      <main class={styles.feed}>
        <For each={feedStore.items()}>{(item) => <ArticleCard item={item} />}</For>

        <div ref={sentinel} class={styles.sentinel} />

        <Switch>
          <Match when={feedStore.status() === 'loading'}>
            <p class={styles.status}>Loading…</p>
          </Match>
          <Match when={feedStore.status() === 'error'}>
            <div class={styles.status}>
              <p>Couldn't load more articles.</p>
              <button type="button" class={styles.retry} onClick={() => void feedStore.retry()}>
                Try again
              </button>
            </div>
          </Match>
          <Match when={feedStore.status() === 'exhausted'}>
            <p class={styles.status}>That's everything.</p>
          </Match>
        </Switch>
      </main>
    </>
  )
}
```

- [ ] **Step 6: Verify the feed in the browser**

Run: `npm run dev`

Confirm by hand:
1. Cards appear within a second or two, each with an image.
2. Every card shows a title, a relative timestamp, the image, the title again, and a 4-line summary ending in "… read more".
3. Scrolling to the bottom loads more cards without a visible gap.
4. Every visible card has an image (the `requireImage` policy is working).
5. Tapping anywhere on a card navigates to `/article/<title>`.

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 10: Article route — full article rendering

**Files:**
- Create: `src/components/ArticleBody.tsx`, `src/components/ArticleBody.module.css`
- Create: `src/styles/wiki-content.css`
- Modify: `src/routes/ArticleRoute.tsx` (replace placeholder body)
- Create: `src/routes/ArticleRoute.module.css`

**Interfaces:**
- Consumes: `ArticleContent` from `src/wiki/types.ts`; `getActiveSource` from `src/wiki/registry.ts`
- Produces: `ArticleBody` props: `{ html: string }`

- [ ] **Step 1: Write the wiki content stylesheet**

Create `src/styles/wiki-content.css`. This is a plain global stylesheet, not a CSS Module: it must target MediaWiki's own class names, which cannot be hashed.

```css
/*
 * Styles for HTML injected from the wiki. Deliberately global — these target
 * MediaWiki's class names, so they must not be hashed by CSS Modules.
 * Everything is scoped under .wiki-content to avoid leaking into the app.
 */
.wiki-content {
  font-size: 1rem;
  line-height: 1.6;
  overflow-wrap: break-word;
}

.wiki-content p {
  margin: 0 0 1rem;
}

.wiki-content h2,
.wiki-content h3,
.wiki-content h4 {
  margin: 1.75rem 0 0.6rem;
  line-height: 1.3;
}

.wiki-content h2 {
  padding-bottom: 0.3rem;
  font-size: 1.3rem;
  border-bottom: 1px solid var(--border);
}

.wiki-content h3 {
  font-size: 1.1rem;
}

.wiki-content img {
  max-width: 100%;
  height: auto;
}

/* Thumbnails float on desktop Wikipedia; stack them on a phone instead. */
.wiki-content .thumb,
.wiki-content figure {
  float: none !important;
  width: auto !important;
  margin: 1.25rem 0;
}

.wiki-content .thumbcaption,
.wiki-content figcaption {
  padding-top: 0.4rem;
  font-size: 0.85rem;
  color: var(--muted);
}

/* The infobox is a right-floated table on desktop; make it a full-width card. */
.wiki-content .infobox {
  float: none !important;
  width: 100% !important;
  margin: 0 0 1.25rem;
  padding: 0.5rem;
  font-size: 0.85rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}

.wiki-content .infobox td,
.wiki-content .infobox th {
  padding: 0.25rem 0.4rem;
  text-align: left;
  vertical-align: top;
}

/* Wide tables must scroll themselves rather than the page. */
.wiki-content table.wikitable {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.wiki-content table.wikitable td,
.wiki-content table.wikitable th {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border);
}

.wiki-content .reference {
  font-size: 0.75em;
}

.wiki-content .hatnote {
  margin-bottom: 1rem;
  color: var(--muted);
  font-style: italic;
}

/* Chrome that makes no sense in a reader. */
.wiki-content .navbox,
.wiki-content .vertical-navbox,
.wiki-content .mw-editsection,
.wiki-content .metadata,
.wiki-content .mw-empty-elt,
.wiki-content .shortdescription,
.wiki-content .sistersitebox,
.wiki-content .ambox,
.wiki-content #toc,
.wiki-content .toc {
  display: none;
}
```

- [ ] **Step 2: Write the article body component**

Create `src/components/ArticleBody.module.css`:

```css
.body {
  padding: 1rem 1.1rem 3rem;
  max-width: 40rem;
  margin: 0 auto;
}
```

Create `src/components/ArticleBody.tsx`:

```tsx
import { useNavigate } from '@solidjs/router'
import '../styles/wiki-content.css'
import styles from './ArticleBody.module.css'

interface ArticleBodyProps {
  html: string
}

const WIKI_LINK_PREFIX = '/wiki/'

export default function ArticleBody(props: ArticleBodyProps) {
  const navigate = useNavigate()

  /**
   * One delegated handler for the whole article, rather than rewriting every
   * anchor up front. Internal wiki links stay in the app; anchors scroll within
   * the article; everything else opens outward.
   */
  function onClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    if (href.startsWith(WIKI_LINK_PREFIX)) {
      event.preventDefault()
      const title = href.slice(WIKI_LINK_PREFIX.length).split('#')[0]!
      navigate(`/article/${title}`)
      return
    }

    if (href.startsWith('#')) {
      event.preventDefault()
      const target = document.getElementById(decodeURIComponent(href.slice(1)))
      target?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  return (
    <div
      class={`${styles.body} wiki-content`}
      onClick={onClick}
      /* Already sanitised by sanitizeWikiHtml at the source boundary. */
      innerHTML={props.html}
    />
  )
}
```

- [ ] **Step 3: Write the article route styles**

Create `src/routes/ArticleRoute.module.css`:

```css
.status {
  padding: 3rem 1.25rem;
  text-align: center;
  color: var(--muted);
}

.retry {
  margin-top: 0.75rem;
  padding: 0.55rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--accent);
}
```

- [ ] **Step 4: Replace the article route**

Replace the entire contents of `src/routes/ArticleRoute.tsx`:

```tsx
import { Match, Switch, createResource } from 'solid-js'
import { useLocation, useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import ArticleBody from '../components/ArticleBody.tsx'
import { getActiveSource } from '../wiki/registry.ts'
import styles from './ArticleRoute.module.css'

export default function ArticleRoute() {
  const params = useParams<{ title: string }>()
  const location = useLocation<{ pageId?: number } | undefined>()
  const navigate = useNavigate()

  const title = () => decodeURIComponent(params.title)

  const [article, { refetch }] = createResource(
    // Keyed on the title so tapping a link inside an article refetches.
    () => ({ title: title(), pageId: location.state?.pageId }),
    (ref) => getActiveSource().fetchArticle({ pageId: ref.pageId ?? 0, title: ref.title }),
  )

  return (
    <>
      <AppBar title={title()} leading="back" onLeadingClick={() => navigate(-1)} />

      <Switch>
        <Match when={article.loading}>
          <p class={styles.status}>Loading…</p>
        </Match>
        <Match when={article.error}>
          <div class={styles.status}>
            <p>Couldn't load this article.</p>
            <button type="button" class={styles.retry} onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Match>
        <Match when={article()}>
          {(loaded) => <ArticleBody html={loaded().html} />}
        </Match>
      </Switch>
    </>
  )
}
```

- [ ] **Step 5: Handle articles opened without a pageId**

The route above passes `pageId: 0` when navigation arrives without router state — which happens when a link inside an article is tapped, or a URL is opened directly. `MediaWikiSource.fetchArticle` currently sends `pageid`, which would fail.

In `src/wiki/mediawiki.ts`, change `fetchArticle` to prefer the page ID and fall back to the title:

```ts
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
```

- [ ] **Step 6: Verify the article view in the browser**

Run: `npm run dev`

Confirm by hand:
1. Tapping a card opens the article, which renders with headings, images and an infobox.
2. The infobox is full width, not floated into a narrow column.
3. A wide table scrolls horizontally without the whole page scrolling sideways.
4. The back button returns to the feed **at the same scroll position**, with no refetch.
5. Tapping a blue link inside the article opens that article in the app.
6. The Android/browser back button works from an article.

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, type check clean. Do not commit.

---

### Task 11: Production build verification and README

**Files:**
- Modify: `README.md`
- Modify: `index.html` (title and theme colour)

**Interfaces:**
- Consumes: everything above
- Produces: a verified production build

- [ ] **Step 1: Set the document title and theme colour**

In `index.html`, replace the `<title>` line and add a theme colour meta tag inside `<head>`:

```html
    <title>Wiki Scroll</title>
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
```

Also extend the viewport tag so the layout respects device notches:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Document the project in the README**

Replace `README.md` with:

````markdown
# Wiki Scroll

An infinite, Instagram-style scroll of recently-updated wiki articles.

## Running

```bash
npm install
npm run dev      # dev server
npm test         # unit tests
npm run build    # production build
```

## Architecture

All wiki-specific knowledge lives behind the `WikiSource` interface in
`src/wiki/types.ts`. `src/wiki/mediawiki.ts` is the only file that imports
`m3api`; everything above it speaks in `FeedItem` and `ArticleContent`.

- **Point at a different MediaWiki wiki** — add an entry to
  `src/wiki/registry.ts`.
- **Support a non-MediaWiki wiki** — write a class implementing `WikiSource`.
- **Change which articles appear** — implement a `FeedPolicy` in
  `src/feed/policy.ts`. The V1 default, `requireImage`, hides the roughly half
  of recently-edited articles that have no thumbnail.

The design document is at
`docs/superpowers/specs/2026-09-17-wiki-scroll-design.md`.

## Before distributing this app

`src/wiki/registry.ts` sets the API User-Agent to the placeholder
`wiki-scroll/0.1`. [Wikimedia's User-Agent policy][ua] asks for an identifying
string with contact information. Replace it before shipping:

```ts
userAgent: 'wiki-scroll/1.0 (https://example.org/wiki-scroll; you@example.org)',
```

[ua]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy

## Note on `mwn`

`mwn` was the originally intended API library but cannot be used: it is a
Node-only bot framework (`engines: node >=14`, depending on `tough-cookie`,
`form-data` and `chalk`) and browsers forbid setting the headers it relies on.
`m3api` is used instead — it ships a dependency-free browser entry point and
its `requestAndContinue()` generator maps directly onto infinite scroll.
````

- [ ] **Step 3: Verify the production build**

Run: `npm run build`
Expected: exits 0, writing to `dist/`.

Run: `npm run preview`
Expected: the built app behaves the same as the dev server — walk through the feed, an article, the drawer and settings once more.

- [ ] **Step 4: Final verification and report**

Run: `npx vitest run`
Expected: the full suite passes.

Run: `npx tsc -b`
Expected: clean.

Report: the final test count, the production bundle size from the build output, and a list of every file created or modified — the user will review and commit.

---

## Deferred to later iterations

These are explicitly **not** in this plan, and the architecture above leaves
room for each:

| Feature | Where it slots in |
| --- | --- |
| Hearts / favourites | New `src/feed/favourites.ts` backed by localStorage; `ArticleCard` gains a button |
| Viewed-article record | Same pattern; `FeedItem` rendering gains a "seen" treatment |
| Show imageless articles | Settings toggle swapping `requireImage` for `acceptAll` |
| Generated images | A transform stage in `feedStore` between `cursor.next()` and `policy.accept()` |
| More sort orders | Extend the `SortOrder` union; `MediaWikiSource.openFeed` switches generator |
| Other wikis | Add to `SOURCES` in `src/wiki/registry.ts`; make `getActiveSource` read a setting |
