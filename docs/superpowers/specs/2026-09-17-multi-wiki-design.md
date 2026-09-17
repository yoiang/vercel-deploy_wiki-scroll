# Multi-Wiki Support — Design

**Date:** 2026-09-17
**Status:** Approved, ready for implementation planning
**Supersedes parts of:** `2026-09-17-wiki-scroll-design.md` (single active source)

## Purpose

Let the reader follow more than one wiki at a time, and more than one language
edition of each. The feed merges everything followed into a single
most-recently-updated scroll.

Only MediaWiki sites are supported now. The design keeps the door open for
other wiki software without reworking the feed.

## Vocabulary

The two words are easy to confuse, so they are used strictly:

- **Family** — a wiki as a brand: Wikipedia, Wiktionary. Has an `id`, a
  display name, and a software `type`.
- **Site** — one language edition of a family: `ja.wikipedia.org`. This is what
  actually gets fetched from, and what the reader follows.

A **site id** is `${familyId}:${lang}` — `wikipedia:en`.

## Scope

**In scope**

- A catalogue file of families and their sites, maintained by the project owner
- A script that regenerates the seven Wikimedia content families (801 sites)
  from the `sitematrix` API
- Following and unfollowing individual sites, persisted across launches
- A merged feed that interleaves all followed sites in true time order
- Per-source failure isolation
- Browse/follow UI (layout B), and a per-family language picker
- Article routes that identify which wiki an article came from

**Out of scope**

- Third-party (non-Wikimedia) wikis — phase 2, see below
- Non-MediaWiki wiki software (the `type` discriminator is the seam)
- Reordering or prioritising followed sites
- Per-site policies (e.g. requiring images only on some wikis)

## Delivery in two phases

The catalogue is built in two phases because the two kinds of wiki have very
different costs.

**Phase 1 — Wikimedia (this spec).** Every Wikimedia site is enumerable from one
`sitematrix` call, supports anonymous CORS, and has the `TextExtracts` and
`PageImages` extensions installed. Nothing needs probing and nothing can be
half-broken.

**Phase 2 — third-party (separate spec).** The `Sites using MediaWiki` lists on
mediawiki.org span ~28 content subpages holding roughly 1,000–1,200 distinct
hosts, and they publish **homepage URLs only**. Each host must be crawled to
discover its `api.php`, then probed for CORS and extension support. Measured on
a sample of five, only one worked fully. That crawler is its own piece of work
and is tracked in `docs/BACKLOG.md`.

Phase 1 alone yields 801 sites, so the feature is fully useful before phase 2
begins.

## The catalogue

`src/wiki/catalogue.json` is hand-maintained by the project owner.

```json
{
  "families": [
    {
      "id": "wikipedia",
      "name": "Wikipedia",
      "type": "mediawiki",
      "apiPath": "/w/api.php",
      "capabilities": { "extracts": true, "pageImages": true },
      "generatedFrom": { "sitematrix": "wiki" },
      "sites": [
        { "lang": "en", "name": "English", "english": "English", "domain": "en.wikipedia.org" },
        { "lang": "ja", "name": "日本語", "english": "Japanese", "domain": "ja.wikipedia.org" }
      ]
    }
  ]
}
```

### Wikimedia families included

Seven families have multi-language content editions:

| Family id | `sitematrix` code | Open sites |
| --- | --- | --- |
| `wikipedia` | `wiki` | 348 |
| `wiktionary` | `wiktionary` | 173 |
| `wikisource` | `wikisource` | 82 |
| `wikibooks` | `wikibooks` | 77 |
| `wikiquote` | `wikiquote` | 77 |
| `wikivoyage` | `wikivoyage` | 27 |
| `wikiversity` | `wikiversity` | 17 |
| | **Total** | **801** |

Two deliberate exclusions:

- **Wikinews.** All 36 of its editions are flagged `closed: true` in
  `sitematrix`, and a `recentchanges` query against `en.wikinews.org` returns no
  pages. It is listed as a Wikimedia project but is not a live source.
- **Organisational wikis.** Roughly 100 single-site entries — `arbcom-*`,
  `office`, `board`, `steward`, `login`, test wikis — are infrastructure, not
  reading material. Only the seven families above are generated.

Single-site content projects (Commons, Wikidata, Wikispecies, Meta) are out of
scope for phase 1: each is one site rather than a language family, and Commons
and Wikidata are media/data rather than articles.

| Field | Purpose |
| --- | --- |
| `type` | Software discriminator. Only `"mediawiki"` is implemented; it selects which `WikiSource` class is constructed. |
| `apiPath` | Third-party MediaWikis do not all serve `/w/api.php`. Defaults to `/w/api.php` when absent. |
| `generatedFrom` | Marks a family whose `sites` are machine-generated. Families without it are never touched by the regeneration script. |
| `name` / `english` | Autonym and English name of the language. Both are searchable, so `日本語` and `Japanese` both find `ja`. |
| `capabilities` | Which optional extensions the family's API provides. See below. |

### Capabilities

`TextExtracts` and `PageImages` are MediaWiki **extensions, not core**. Every
Wikimedia site has both, so every phase-1 family declares
`{ "extracts": true, "pageImages": true }`. Third-party wikis frequently have
neither — measured directly, OpenStreetMap Wiki and Team Fortress Wiki both
reject the `prop=extracts|pageimages` parameters outright.

A site without `pageImages` returns no thumbnails, so the `requireImage` policy
rejects every article it produces: the wiki would sit in the following list
looking healthy while contributing nothing. Recording the capability is what
makes that visible instead of mysterious.

**In phase 1 nothing carries a false capability**, since all Wikimedia families
have both extensions. So the field is defined and generated now, but the UI that
surfaces a "text only" badge belongs to phase 2, when the first such site
arrives. Building that badge now would be decoration with nothing to decorate.

The consequence to keep in view: text-only wikis stay invisible until the
deferred *show imageless articles* toggle exists. Phase 2 depends on that
toggle to be worth anything.

### Size

801 sites across seven families is roughly 65 KB of JSON, near 18 KB gzipped —
still small enough to bundle and import directly rather than fetch. Follow
records store only site ids, which keeps the catalogue the single source of
truth with no duplicated site data to go stale.

If phase 2 pushes this past a few hundred KB, the settings routes should
`import()` the catalogue lazily so the feed's first paint does not pay for it.
That is a size-driven decision, not one to take pre-emptively.

### Regeneration script

`npm run update-catalogue` runs `scripts/update-catalogue.mjs`, which:

1. Reads the existing `catalogue.json`.
2. Fetches `sitematrix` **once**, then for each family carrying a
   `generatedFrom.sitematrix` value replaces **only** that family's `sites`
   array with the sites of the matching code.
3. Skips any site flagged `closed`. This is load-bearing rather than tidy:
   all 36 Wikinews editions are closed, and including them would add a family
   that can never produce an article.
4. Leaves every other family, and all family-level metadata — `name`,
   `apiPath`, `capabilities` — exactly as written.
5. Writes the file back with stable key ordering and sites sorted by `lang`, so
   diffs stay readable.

Hand-added families survive regeneration untouched. This is the property that
makes the file safe to own by hand.

## Architecture

```
src/wiki/
  types.ts          WikiSource, FeedCursor, FeedItem, ArticleContent   (unchanged)
  catalogue.json    the data
  catalogue.ts      typed loading, lookup, and search over the catalogue
  sources.ts        site id -> WikiSource, memoised (replaces registry.ts)
  mediawiki.ts      MediaWikiSource                                     (mostly unchanged)
  mergedCursor.ts   N FeedCursors -> one FeedCursor
src/feed/
  followStore.ts    which sites are followed; persisted
  feedStore.ts      now takes a cursor factory, not a WikiSource
  policy.ts         unchanged
src/routes/
  WikisRoute.tsx        /settings/wikis
  LanguagePickerRoute.tsx /settings/wikis/:familyId
```

### Catalogue module

```ts
interface WikiSite { lang: string; name: string; english: string; domain: string }
interface WikiCapabilities { extracts: boolean; pageImages: boolean }
interface WikiFamily {
  id: string
  name: string
  type: 'mediawiki'
  apiPath?: string
  capabilities: WikiCapabilities
  generatedFrom?: { sitematrix: string }
  sites: WikiSite[]
}

function families(): WikiFamily[]
function findFamily(familyId: string): WikiFamily | undefined
function findSite(siteId: string): { family: WikiFamily; site: WikiSite } | undefined
function searchSites(family: WikiFamily, query: string): WikiSite[]
function siteId(familyId: string, lang: string): string
```

`searchSites` matches case-insensitively against `lang`, `name` and `english`,
so a reader can find a language by code, autonym, or English name.

### Source construction

`sources.ts` replaces `registry.ts`:

```ts
function getSource(siteId: string): WikiSource   // memoised per site id
```

It looks the site up in the catalogue, switches on `family.type`, and constructs
the matching `WikiSource` — today always `MediaWikiSource`. An unknown `type` or
unknown site id throws a named error rather than failing silently.

`MediaWikiSourceConfig` gains one field and keeps `domain`:

```ts
interface MediaWikiSourceConfig {
  id: string          // site id, e.g. 'wikipedia:en'
  displayName: string // e.g. 'Wikipedia (Japanese)'
  domain: string      // 'ja.wikipedia.org'
  apiPath: string     // '/w/api.php'
  userAgent: string
}
```

Both fields are needed and neither is derivable from the other: the m3api
session is constructed from `https://${domain}${apiPath}`, while
`parseResponseToArticle` builds `canonicalUrl` as `https://${domain}/wiki/...`,
which has nothing to do with the API path.

`MediaWikiSource`'s `id` becomes the site id, so `FeedItem.id` is
`wikipedia:en:12345` — still `${sourceId}:${pageId}`, unchanged in form.

### Merged cursor

```ts
interface MergedCursorChild { siteId: string; open: () => FeedCursor }

function createMergedCursor(
  children: MergedCursorChild[],
  options?: {
    concurrency?: number
    maxConsecutiveFailures?: number
    onSourceError?: (siteId: string, error: Error) => void
    onSourceRecovered?: (siteId: string) => void
  },
): FeedCursor
```

Two callbacks, not one: without `onSourceRecovered` a consumer could learn that
a site started failing but never that it stopped, so any error display would be
permanently stuck on.

It implements the existing `FeedCursor` interface, so **`feedStore` needs no
knowledge of multi-source at all**.

Each child holds `{ cursor, buffer, exhausted, failed }`. One `next()` call:

1. **Top up.** Every child that is active (not exhausted) with an empty buffer
   is advanced, at most `concurrency` (default 6) in parallel. A child that is
   `failed` gets its cursor reopened and is given exactly one attempt — never a
   retry loop within a single call. A success clears its failure count and fires
   `onSourceRecovered`; a failure increments it and fires `onSourceError`.

   **Retry budget.** `feedStore.loadMore()` calls `next()` up to five times, so
   "retry once per call" would mean five doomed requests per load against a wiki
   that is down. After `maxConsecutiveFailures` (default 3) a child stops being
   retried for the lifetime of this merged cursor. Since `feedStore` discards
   and rebuilds its cursor on error and on `reset()`, a genuinely recovered site
   gets a fresh chance without the reader doing anything unusual.
2. **Emit.** Pop the globally newest item across buffer heads, repeatedly.
3. **Stop** when a buffer belonging to an active child runs dry.

The correctness rule: an item may only be emitted while **every active child
has something buffered**. If an active child's buffer is empty, it might be
holding something newer, so emitting would break time order. Failed children are
excluded from this rule — that exclusion is exactly what failure isolation
means.

Termination:

| Condition | Result |
| --- | --- |
| Every child exhausted, buffers empty | return `null` — genuine end of feed |
| Every child failed, buffers empty | **throw** — surfaces the existing retry UI |
| Some children healthy | emit from them; failed ones are skipped this round |

A partial failure must never present as `null`, or the reader is told "that's
everything" when it isn't — the same misreporting as the cursor-reuse bug fixed
earlier.

With a single followed site, this degenerates to exactly the current behaviour.

### Why re-emission on reopen is safe

A cursor backed by an async generator is dead once it throws: every later
`next()` returns `{ done: true }`. Isolating a failed source therefore means
*reopening* it, which restarts that site from its newest changes and re-emits
articles already in the feed.

This is harmless, for two independent reasons:

1. `feedStore` deduplicates by `FeedItem.id`, so nothing appears twice.
2. Articles skipped during an outage are never marked viewed, so once the
   planned viewed-articles store exists they remain eligible to resurface later.

**The accepted cost:** a site that fails and recovers has its articles arrive
later in the scroll than strict time ordering would place them. This is a
deliberate trade — a complete feed with slightly loose ordering beats a
perfectly ordered feed that stalls whenever one wiki has a bad minute.

### Follow store

```ts
interface FollowStore {
  followedSiteIds: () => string[]
  isFollowed: (siteId: string) => boolean
  follow: (siteId: string) => void
  unfollow: (siteId: string) => void
  followedSitesOf: (familyId: string) => WikiSite[]
  followedFamilies: () => Array<{ family: WikiFamily; sites: WikiSite[] }>
}
```

Persisted to `localStorage` under `wiki-scroll.following.v1` as a JSON array of
site ids. On first run it defaults to `["wikipedia:en"]`, so the app works
immediately.

Reading is defensive: absent, malformed, or non-array stored values fall back to
the default, and site ids no longer present in the catalogue are dropped. A
corrupt storage value must never prevent the app from starting.

Following a family with no sites selected is not a state — a family is followed
exactly when at least one of its sites is.

Changing the selection calls `feedStore.reset()`.

### feedStore changes

`createFeedStore(source: WikiSource, policy)` becomes
`createFeedStore(openCursor: () => FeedCursor, policy)`. The store loses all
knowledge of wikis and deals only in cursors.

Two additions:

- `reset()` — clears items, `seenIds`, cursor, error, status and scroll offset.
  Called when the followed set changes.
- `sourceErrors(): Array<{ siteId: string; error: Error }>` — a site is added by
  `onSourceError`, removed by `onSourceRecovered`, and the whole set is cleared
  by `reset()`.

Everything else — the 10-item target, the 5-batch cap, dedupe, partial-progress
commit on error, discarding a cursor that threw — is unchanged.

### Feed UI

`FeedRoute` renders a quiet, non-blocking line above the loading indicator when
`sourceErrors()` is non-empty: *"Couldn't reach Japanese Wikipedia."* A wiki
that silently contributes nothing is worse than one that says so.

The empty state — nothing followed — shows a prompt linking to
`/settings/wikis` rather than an endless spinner.

## Screens

| Route | Screen |
| --- | --- |
| `/settings` | Existing settings page, gains a **Wikis** row summarising the followed count |
| `/settings/wikis` | Layout B: *Following* section, then *Add a wiki* search and catalogue list |
| `/settings/wikis/:familyId` | Searchable language picker for one family |

### `/settings/wikis` (layout B)

One scrolling page, two sections:

- **Following · N** — a card per followed family showing its selected languages
  as chips. Tapping a chip unfollows that site. Tapping the card opens the
  family's language picker.
- **Add a wiki** — a search box filtering the catalogue by family name, then the
  list of families. Tapping one opens its language picker.

### `/settings/wikis/:familyId`

A search box over that family's sites, then the full list with checkboxes,
followed sites first. Search matches code, autonym and English name. Rendering
348 plain rows is acceptable; virtualisation is only warranted if it measurably
janks.

## Article routes

`/article/:title` becomes `/article/:familyId/:lang/:title` —
`/article/wikipedia/ja/猫`. Three segments rather than a colon-joined id keeps
the URL readable and avoids escaping questions.

`ArticleRoute` resolves `familyId` + `lang` through `getSource`, so deep links
and refreshes work without relying on router state. An unknown site renders the
error state with a working back button.

`ArticleBody` receives the current site id. Internal `/wiki/Foo` links resolve
against the wiki the article came from, not always English.

`ArticleCard` navigates using the site id embedded in `FeedItem.id`.

## Error handling

| Situation | Behaviour |
| --- | --- |
| One followed site fails | Isolated; other sites keep flowing; reported via `sourceErrors()`; reopened once per `next()` until `maxConsecutiveFailures` |
| Every followed site fails | Merged cursor throws; existing error state and retry |
| Nothing followed | Feed shows an empty state linking to `/settings/wikis` |
| Corrupt `localStorage` | Falls back to the default follow set |
| Site id absent from catalogue | Dropped from the follow set on load |
| Unknown family `type` | `getSource` throws a named error |

## Testing

`mergedCursor` holds the real logic and gets the most coverage.

| Module | Cases |
| --- | --- |
| `mergedCursor` | emits in true newest-first order across sites; withholds an item while an active child's buffer is empty; single child behaves exactly like that child; `null` only when every child is exhausted; **throws when every child has failed**; **keeps emitting from healthy children when one fails**; reports the failing site through `onSourceError`; reopens a failed child on the next call; fires `onSourceRecovered` when a reopened child succeeds; stops retrying after `maxConsecutiveFailures`; honours the concurrency cap |
| `followStore` | defaults to English Wikipedia on first run; follow/unfollow round-trips through localStorage; malformed and non-array stored values fall back to the default; unknown site ids are dropped |
| `catalogue` | every site has the required fields; family and site ids are unique; every family declares `capabilities`; no family generates from a `sitematrix` code with zero open sites; search matches code, autonym and English name |
| `sources` | memoises per site id; builds the API URL from domain and `apiPath`; throws a named error for unknown site or unknown type |
| `feedStore` | unchanged behaviour against a cursor factory; `reset()` clears items, dedupe set and scroll offset; `sourceErrors()` surfaces and clears |
| `update-catalogue` | replaces sites for `generatedFrom` families; leaves hand-added families and family metadata untouched; **skips sites flagged `closed`**; output is stably ordered |

Tests perform no network I/O; the sitematrix response is a fixture.

## Migration

- `registry.ts` and `registry.test.ts` are deleted and replaced by `sources.ts`
  and `sources.test.ts`; `getActiveSource()` has no multi-source meaning.
  `activeFeedStore.ts` builds its cursor factory from `followStore` instead.
- `MediaWikiSource` gains an explicit API URL rather than a bare domain, so
  `apiPath` is honoured.
- `live-check.test.ts` is retargeted at `getSource('wikipedia:en')`, keeping its
  existing note that Node does not enforce CORS.

## Deferred

- **Phase 2: third-party wiki catalogue** — the crawler over mediawiki.org's
  `Sites using MediaWiki` subpages, plus the "text only" badge that the
  `capabilities` field exists to drive. Tracked in `docs/BACKLOG.md`.
- **Core-API fallback** — synthesising summaries via `action=parse` and
  thumbnails via `prop=images` + `imageinfo`, both core MediaWiki, so wikis
  without `TextExtracts`/`PageImages` become fully usable rather than text-only.
  This is what would make most third-party wikis worth following.
- Per-site policies and per-site sort orders
- Reordering the followed list
- Non-MediaWiki source types
- Single-site Wikimedia projects (Commons, Wikidata, Wikispecies, Meta)
- Virtualising long language lists (Wikipedia's 348 rows is the current worst case)
- Surfacing *which* article a failed source would have supplied
