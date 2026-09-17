# Backlog

Deferred work, with the place in the current architecture where each one
slots in. Nothing here is started.

## Multi-source feed (includes language selection)

Merge articles from more than one wiki at once. Selecting several *language*
editions of Wikipedia is a special case of this, not a separate feature.

**Why it is one feature, not two:** on Wikipedia, language is not a property
you can filter on — it *is* the wiki. Every mainspace article on
`en.wikipedia.org` is English; German articles live on `de.wikipedia.org`. The
`sitematrix` API lists **348 open Wikipedia language editions**, each a
separate domain with its own `recentchanges` feed. So "show me German and
Japanese articles" and "show me Wikipedia and Wiktionary" are the same
mechanism.

**Where it slots in:** `getActiveSource()` in `src/wiki/registry.ts` returns a
single `WikiSource`. This becomes a set of sources, and `feedStore` holds one
`FeedCursor` per source rather than one overall.

**The constraint to design around:** fetching all 348 editions per scroll would
mean hundreds of HTTP requests to fill ten cards, with almost all results
discarded. A round-robin that rotates through selected wikis a few at a time,
ordered by edit activity, merge-sorting batches by timestamp, keeps this
practical. Note also that small-language wikis rarely have thumbnails, so they
interact badly with the `requireImage` policy.

**UI:** deliberately undesigned. Three layouts were sketched (dedicated picker
screen, inline chips + search, inline grouped list) and shelved until the
underlying merge exists.

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
