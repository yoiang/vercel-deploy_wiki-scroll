# Wiki Scroll — Design

**Date:** 2026-09-17
**Status:** Approved, ready for implementation planning

## Purpose

A single-page mobile app presenting an infinite, Instagram-style scroll of wiki
articles. Version 1 points at English Wikipedia and orders articles by most
recently updated. The architecture must let a later iteration point at a
different wiki without rewriting the feed or the UI.

## Scope

**In scope for V1**

- Infinite scroll feed of recently-updated articles, newest first
- Instagram-style article card: title + updated time, image, title, 4-line
  description ending `… read more`
- Tapping anywhere on a card opens a full article view with a back button
- Top-left hamburger opening a drawer with a Settings entry
- A Settings page, intentionally empty, with a back route to the feed
- In-memory caching so returning from an article does not refetch

**Explicitly deferred** (the design must not block these)

- Hearts / favourites in localStorage
- A record of viewed articles in localStorage
- A settings toggle to include articles that have no image
- An option to generate an image for imageless articles (mechanism TBD)
- Additional sort orders
- Pointing at wikis other than Wikipedia

## Key technical decision: the MediaWiki client

The original request named [`mwn`](https://www.npmjs.com/package/mwn). **`mwn`
cannot be used.** It declares `engines: { node: ">=14" }` and depends on
`tough-cookie`, `form-data`, `chalk` and `oauth-1.0a`. It is a server-side bot
framework for authenticating and editing. In a Capacitor WebView it would
require polyfills to bundle at all, and browsers forbid setting the
`User-Agent` and cookie headers it relies on.

**`m3api` is used instead.** Evaluated against the browser-capable
alternatives:

| Library | Verdict |
| --- | --- |
| `m3api` | **Chosen.** Ships a dedicated `m3api/browser.js` entry with no external dependencies. Last published 2026-04. |
| `wtf_wikipedia` | Active and browser-safe, but it is a wikitext parser, not a feed client. Not a replacement. |
| `wikijs` | Browser-safe dependencies, but last published February 2023. Abandoned. |
| `wikipedia`, `nodemw`, `mediawiki-api` | Node-oriented. `nodemw` pulls in `request` and `winston`. Not viable. |

Three properties make `m3api` the right fit:

1. `requestAndContinue()` is an async generator over MediaWiki's continuation
   protocol — exactly the primitive infinite scroll needs, already written.
2. It special-cases the `origin`/`crossorigin` parameters required for
   anonymous CORS, and rewrites `User-Agent` to `api-user-agent`, the header
   browsers permit and the one Wikimedia's etiquette policy asks for.
3. A session is constructed from a bare wiki domain
   (`new Session('en.wikipedia.org', …)`), so retargeting a different MediaWiki
   site is a configuration value.

This was verified, not assumed: `m3api/browser.js` was smoke-tested against the
live API, successfully pulling two continuation batches of the
recently-updated feed with titles, timestamps, intro extracts and thumbnails.

### The feed query

One request returns everything a card needs:

```
action=query
generator=recentchanges
  grcnamespace=0      main namespace only
  grctype=edit|new
  grctoponly=1        latest revision of each page only
  grclimit=<pageSize>
prop=extracts|pageimages|revisions
  exintro=1 explaintext=1 exchars=400
  piprop=thumbnail pithumbsize=800
  rvprop=timestamp
formatversion=2
```

### The article query

```
action=parse&page=<title>&prop=text&disableeditsection=1&disabletoc=1&formatversion=2
```

Verified to return roughly 78 KB of HTML for a typical article, with infobox,
images and tables intact.

## Architecture

```
src/
  wiki/                    the swappable boundary
    types.ts               WikiSource, FeedItem, FeedCursor, ArticleContent
    mediawiki.ts           MediaWikiSource — the only file that imports m3api
    registry.ts            configured sources, and which one is active
  feed/
    feedStore.ts           in-memory item cache, pagination, dedupe, scroll offset
    policy.ts              FeedPolicy — which items may enter the feed
  routes/
    FeedRoute.tsx
    ArticleRoute.tsx
    SettingsRoute.tsx
  components/
    AppBar.tsx             title bar with hamburger or back button
    Drawer.tsx             slide-in menu
    ArticleCard.tsx
    ArticleBody.tsx        sanitised wiki HTML renderer
  lib/
    sanitizeWikiHtml.ts
    formatRelativeTime.ts
```

Every module above `wiki/` speaks only in `FeedItem` and `ArticleContent`. No
MediaWiki concept — not `grccontinue`, not `pageid` as an API detail — leaks
upward.

### Source interface

```ts
type SortOrder = 'recently-updated';

interface FeedItem {
  id: string;             // `${sourceId}:${pageId}` — stable across refetches
  pageId: number;
  title: string;
  updatedAt: Date;
  summary: string;        // plain text, no markup
  image?: { url: string; width: number; height: number };
}

interface ArticleContent {
  title: string;
  html: string;           // sanitised, ready to inject
  updatedAt: Date;
  canonicalUrl: string;
}

interface FeedCursor {
  /** Next batch, or null once the source is exhausted. */
  next(): Promise<FeedItem[] | null>;
}

interface WikiSource {
  readonly id: string;
  readonly displayName: string;
  openFeed(opts: { sort: SortOrder; pageSize: number }): FeedCursor;
  fetchArticle(ref: { pageId: number; title: string }): Promise<ArticleContent>;
}
```

`FeedCursor` is the load-bearing abstraction: it hides *how* a wiki paginates.
`MediaWikiSource` implements it by holding an `m3api` `requestAndContinue()`
generator and advancing it on demand. A future source paginating by offset or
by date implements the same two methods.

Retargeting another MediaWiki wiki means adding an entry to `registry.ts`
(`{ id, displayName, domain }`). Supporting a non-MediaWiki wiki means writing
a new class implementing `WikiSource`.

`SortOrder` is a single-member union in V1. It exists so the later sort
options extend a type rather than introduce a parameter.

### Two ordering hazards, handled

Both were observed during API probing and are requirements, not speculation:

1. **Within-batch ordering.** Results inside one continuation batch arrive in
   page-ID order, not timestamp order — a probe returned a `10:53:55` edit
   ahead of a `10:53:51` one. `MediaWikiSource` sorts each batch by `updatedAt`
   descending before returning it. Because `recentchanges` enumerates batches
   in timestamp order, sorting per batch yields a correctly ordered feed
   overall.
2. **Duplicates.** A page edited twice can appear in two different batches.
   `feedStore` deduplicates by `FeedItem.id`, keeping the first occurrence.

### Feed policy

```ts
interface FeedPolicy { accept(item: FeedItem): boolean; }
```

V1 uses a `requireImage` policy: roughly half of recently-edited articles have
no thumbnail, and those are skipped so the feed keeps a consistent visual
rhythm.

Each `loadMore()` call has a target of **10 accepted items**. `feedStore`
requests continuation batches until it has accumulated 10 accepted items, or
the cursor is exhausted, or it has consumed **5 API batches** — whichever comes
first. The batch cap means an unlucky stretch of imageless articles yields a
short load rather than spinning indefinitely; the next `loadMore()` simply
continues from where the cursor left off.

This shape is chosen specifically for the deferred features: the future
settings toggle swaps in an `acceptAll` policy, and image generation becomes a
transform stage between fetch and accept. Neither touches the feed engine.

### Feed store

A module-level singleton holding:

- `items: FeedItem[]` — deduplicated, in display order
- `status: 'idle' | 'loading' | 'exhausted' | 'error'`
- `error: Error | null`
- `scrollOffset: number` — restored when the feed route remounts
- `loadMore(): Promise<void>` — guarded against concurrent invocation

Being a singleton is what makes "in-memory cache" true: navigating to an
article and back restores the feed instantly with no refetch. Nothing is
written to localStorage in V1; that storage is reserved for the deferred hearts
and viewed-articles features.

### Article rendering

`ArticleBody` injects sanitised HTML and applies a `.wiki-content` stylesheet.

**Sanitising** uses DOMPurify. This is non-negotiable: Wikipedia HTML is
user-editable content being injected via `innerHTML`. Beyond stripping scripts
and event handlers, `sanitizeWikiHtml` normalises protocol-relative image URLs
(`//upload.wikimedia.org/…` → `https://…`).

**Mobile restyling** via CSS Modules, targeting MediaWiki's stable class names:
tables scroll horizontally inside their own container, the infobox becomes a
full-width card rather than a float, images are constrained to the viewport,
and navboxes and edit-section links are hidden.

**Link interception**: a delegated click handler on the container. Anchors whose
`href` begins with `/wiki/` are intercepted and pushed as another article route,
so tapping through articles stays in the app. External links open outward.

### Styling

CSS Modules (`*.module.css`), supported by Vite without configuration. Hashed
class names are a concrete benefit here: they cannot collide with the
Wikipedia class names present in injected article HTML. The `.wiki-content`
rules are the deliberate exception, since they must target MediaWiki's own
class names.

### Navigation

`@solidjs/router` with three routes:

| Route | View |
| --- | --- |
| `/` | Feed |
| `/article/:title` | Article detail, back button to feed |
| `/settings` | Settings placeholder, back button to feed |

Real routes mean Android's hardware back button works without extra wiring —
which matters for a Capacitor build.

`AppBar` shows a hamburger on the feed and a back affordance elsewhere.
`Drawer` slides in from the left with a single Settings entry.

### Card layout

```
┌──────────────────────────────────┐
│ Article Name          2 min ago  │
├──────────────────────────────────┤
│                                  │
│            main image            │
│                                  │
├──────────────────────────────────┤
│ Article Name                     │
│ Description line 1               │
│ line 2                           │
│ line 3                           │
│ line 4              … read more  │
└──────────────────────────────────┘
```

The whole card is a single tap target navigating to the article.

The 4-line description uses CSS `line-clamp: 4`. Because `line-clamp` cannot
append text at the truncation point, `… read more` is rendered as an inline
element pinned to the bottom-right of the description box over a short
background gradient. This stays correct at any font size or device width.

Images use a fixed aspect ratio with `object-fit: cover` so the feed keeps an
even rhythm despite wildly varying source dimensions.

### Infinite scroll

An `IntersectionObserver` watches a sentinel element below the last card and
calls `feedStore.loadMore()` when it approaches the viewport. `loadMore` is a
no-op while a load is already in flight or the feed is exhausted.

## Error handling

- **Network or API failure during `loadMore`** — the store enters `error`
  status and the feed shows an inline retry affordance below the existing
  items. Already-loaded items stay on screen.
- **Article fetch failure** — the article route shows an error state with a
  retry and a working back button.
- **Missing extract or thumbnail** — `MediaWikiSource` treats both as optional.
  A missing extract yields an empty `summary`; a missing thumbnail yields
  `image: undefined`, which the V1 policy then filters out.
- **Cursor exhaustion** — status becomes `exhausted` and the feed renders an
  end-of-feed marker instead of the sentinel.

## Testing

Vitest with jsdom. Tests run against fixtures captured from the real API; no
test performs network I/O. `WikiSource` is injected, so the store is exercised
with a fake source.

| Module | Cases |
| --- | --- |
| `mediawiki` | fixture maps to `FeedItem[]`; batch sorted by `updatedAt` descending; missing thumbnail and missing extract tolerated; `next()` returns `null` at exhaustion |
| `policy` | `requireImage` rejects imageless items; `acceptAll` accepts everything |
| `feedStore` | deduplicates by id; keeps pulling batches until quota met; honours the 5-batch cap; sets `exhausted`; sets `error` on failure; concurrent `loadMore` is a no-op |
| `sanitizeWikiHtml` | strips `<script>` and `onerror`; preserves article markup; normalises protocol-relative image URLs |

Component rendering is deliberately untested — the layout is still being
designed by eye, and pixel-level assertions would be brittle without being
informative.

## Dependencies added

Runtime: `m3api`, `@solidjs/router`, `dompurify`
Development: `vitest`, `jsdom`

DOMPurify ships its own type definitions; `@types/dompurify` is deprecated and
must not be installed.

## Open item

Wikimedia's API etiquette asks for a User-Agent identifying the application
with contact information. V1 ships the placeholder `wiki-scroll/0.1`, recorded
in the README as something to replace before the app is distributed. This does
not block development; the API serves anonymous CORS requests regardless.
