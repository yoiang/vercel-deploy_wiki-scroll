# Backlog

Deferred work, with the place in the current architecture where each one
slots in. Nothing here is started.

## BUG: article URLs 404 on Vercel after a page reload — FIXED 2026-09-18

Fixed by `vercel.json` at the repo root. Kept here for the lesson in the
"why no test caught it" note below.

Opening an article and then reloading — or following a shared article link —
gave Vercel's "page doesn't exist" rather than the article. It affected *every*
client-side route, not just articles: `/settings` and `/settings/wikis` 404ed
identically.

**Cause:** this is a single-page app with client-side routes, but the build
output is static files only:

```text
dist/
  assets/
  favicon.svg
  icons.svg
  index.html
```

There is no `dist/article/...` file, so Vercel's static host answers a request
for `/article/wikipedia/en/Anvil` with its own 404. The app's router never runs,
because no HTML is ever served. Clicking through from the feed works because
that navigation happens entirely in the browser and never asks the server for
anything.

**Fix:** a `vercel.json` at the repo root rewriting unmatched paths to the app
shell, so every URL loads `index.html` and the router takes over:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Why no test caught it:** both `vite dev` and `vite preview` perform SPA
history fallback automatically. The route check run on 2026-09-17 returned 200
for all five routes under `vite preview` — it could never have detected this,
because the behaviour being verified is the hosting platform's, not the app's.
Any future check of this needs to hit the deployed site, or a static server
without fallback.

**Worth doing at the same time:** `index.html` and the assets should not be
cached the same way. Vite fingerprints filenames under `assets/`, so those are
safe to cache immutably, while `index.html` must not be, or a deploy can leave
readers on a stale shell pointing at deleted asset files.

## Feed refresh on selection change — includes a KNOWN BUG

Two related pieces, designed and agreed in conversation but not built.

### The bug: `reset()` does not cancel an in-flight load

`feedStore.loadMore()` commits whatever it accepted in a `finally` block, with
no check that the store is still the same feed it started loading. If the wiki
selection changes while a load is in flight, articles fetched under the **old**
selection are appended to the freshly reset feed.

Demonstrated on 2026-09-17 with a test that starts a load, calls `reset()` while
it is gated, then releases it:

```text
AssertionError: expected [ { id: 'old:1', pageId: 1, …(4) } ] to deeply equal []
```

**Fix:** a generation counter in `createFeedStore`. `reset()` increments it;
`loadMore()` captures it on entry and discards its results — and skips its
status update — if the value changed while awaiting.

**Why it matters more now:** adding and following a custom wiki is itself a
selection change, so the window for hitting this widens as wiki management gets
richer. It is rare today only because reaching settings and toggling during a
load is awkward.

### The feature: refresh eagerly instead of lazily

Today `followStore.onChange` only calls `feedStore.reset()`. The feed refetches
lazily, when `FeedRoute` next mounts — so returning from settings shows
blank → "Loading…" → content.

**Fix:** `onChange` resets *and* schedules a `loadMore()` after a short quiet
period (~300 ms), so the new feed is already fetched by the time the reader
navigates back.

**The debounce is not optional.** Following five languages fires five change
events; without coalescing that is five resets and five loads, four of them
wasted — and each load fans out across every followed wiki.

**Where it slots in:** `src/feed/feedStore.ts` (generation counter, ~10 lines)
and `src/feed/activeFeedStore.ts` (debounced refresh, ~15 lines), plus tests for
the reset race, debounce coalescing, and a change superseding an in-flight load.

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

**Now more valuable:** users can add arbitrary wikis by URL, and three of the
five real third-party wikis measured have neither extension. Without this
fallback a good share of what people add will be text-only — and text-only
wikis stay invisible until the *show imageless articles* toggle exists.

## Multi-source feed — DONE

Built to `docs/superpowers/specs/2026-09-17-multi-wiki-design.md`, with layout B
for the browse/follow screens. Ships the seven Wikimedia content families
(801 sites). Phase 2 (third-party wikis) is still open — see the top of this
file.

## Profiles — saved combinations of followed wikis

Let the reader keep several named sets of followed wikis and switch between
them: a "languages I'm learning" set, a "gaming wikis" set, and so on.

**Where it slots in:** `src/feed/followStore.ts` currently holds one flat array
of site ids under `wiki-scroll.following.v1`. This becomes several named sets
plus an active one. Everything downstream already rebuilds from
`followedSiteIds()`, so `activeFeedStore` and the merged cursor need no change —
switching profile is just another selection change that resets the feed.

**Worth deciding when built:** whether a profile also carries its own policy
(e.g. one profile allows imageless articles) or only the wiki selection. The
storage key will need a version bump, or a migration from the `v1` flat array.

## Animated page transitions

Animate navigation between the feed, article, settings and wiki screens, rather
than the current hard cut. Conventionally: article and settings screens slide in
from the right and back out, the drawer already slides.

**Where it slots in:** routes are plain `<Route>` components in `src/App.tsx`.
Solid's `<Transition>` wrapping the route outlet is the usual approach, or
CSS view transitions where the WebView supports them. Both need a direction
signal, since the same route should slide the opposite way when going back.

**Watch out for:** `FeedRoute` restores scroll position in `onMount`. If a
transition delays mount or keeps the old screen alive, that restore can land at
the wrong moment and the feed will jump.

## Site icon

Give the app a real icon rather than the Vite starter's `favicon.svg`, and wire
it through to the native shells.

**Where it slots in:** `index.html` references `/favicon.svg` from `public/`.
Capacitor's Android and iOS projects carry their own icon sets
(`android/app/src/main/res/mipmap-*`, `ios/App/App/Assets.xcassets/AppIcon.appiconset`),
both currently holding Capacitor defaults. `@capacitor/assets` can generate
every size from one source image.

**Also worth doing at the same time:** the splash screens in
`android/app/src/main/res/drawable-*` are still Capacitor defaults too.

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
