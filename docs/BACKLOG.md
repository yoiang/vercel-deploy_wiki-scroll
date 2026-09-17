# Backlog

Deferred work, with the place in the current architecture where each one
slots in. Nothing here is started.

## Phase 2: third-party wiki catalogue

Add non-Wikimedia MediaWiki sites, from the `Sites using MediaWiki` lists on
mediawiki.org. Phase 1 (Wikimedia, 801 sites) is specified in
`docs/superpowers/specs/2026-09-17-multi-wiki-design.md`.

**Scale, measured 2026-09-17:** 62 subpages exist but most are translations.
The real content pages are ~28. `/en` has 369 distinct hosts, `/multilingual`
152, `/de` 142, `/es` 24 — extrapolating, **1,000–1,200 distinct sites**. Page
content is retrievable programmatically via
`action=parse&prop=externallinks` against mediawiki.org.

**Why it needs a crawler:** the lists publish **homepage URLs only**. Each host
must be probed to find its `api.php` (the path varies — `/api.php`,
`/w/api.php`, …), then checked for anonymous CORS and for the `TextExtracts`
and `PageImages` extensions.

**What a sample of five actually showed:**

| Site | CORS | `extracts` | `pageImages` |
| --- | --- | --- | --- |
| Minecraft Wiki | yes | yes | yes |
| OpenStreetMap Wiki | yes | **no** | **no** |
| Team Fortress Wiki | yes | **no** | **no** |
| wikiHow | yes | unparseable response | — |
| CreationWiki | unreachable | — | — |

Only one of five worked fully. CORS is less of a problem than expected; missing
extensions are the real obstacle. A site without `PageImages` produces no
thumbnails, so the `requireImage` policy rejects everything it returns.

**Depends on:** the *show imageless articles* toggle below. Without it,
text-only wikis are invisible and phase 2 delivers little.

**Pairs with:** the core-API fallback (see below), which would convert most of
these from text-only to fully usable.

## Core-API fallback for wikis without TextExtracts/PageImages

Synthesise the two missing pieces using core MediaWiki APIs: the intro via
`action=parse` on the lead section, and a thumbnail via `prop=images` +
`prop=imageinfo`. Both are core, so any MediaWiki would work.

**Where it slots in:** `MediaWikiSource`, selected by the family's
`capabilities` flags. The `WikiSource` interface and everything above it are
unaffected.

## Multi-source feed — DONE

Built to `docs/superpowers/specs/2026-09-17-multi-wiki-design.md`, with layout B
for the browse/follow screens. Ships the seven Wikimedia content families
(801 sites). Phase 2 (third-party wikis) is still open — see the top of this
file.

## Pull to refresh

Pull down at the top of the feed to fetch articles newer than the newest one
currently held.

**Where it slots in:** `feedStore` currently only appends via `loadMore()`.
This needs a `refresh()` that opens a fresh cursor and *prepends* new items,
keeping the existing `seenIds` deduplication so nothing doubles up. The gesture
belongs in `FeedRoute`, alongside the existing scroll and `IntersectionObserver`
handling.

## From the original design

| Feature | Where it slots in |
| --- | --- |
| Hearts / favourites | New `src/feed/favourites.ts` backed by localStorage; `ArticleCard` gains a button |
| Viewed-article record | Same pattern; `FeedItem` rendering gains a "seen" treatment |
| Show imageless articles | Settings toggle swapping `requireImage` for `acceptAll` in `src/feed/policy.ts` |
| Generated images for imageless articles | A transform stage in `feedStore` between `cursor.next()` and `policy.accept()`. Mechanism still undecided. |
| More sort orders | Extend the `SortOrder` union in `src/wiki/types.ts`; `MediaWikiSource.openFeed` switches generator |
