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

- **The wiki catalogue** is `src/wiki/catalogue.json` — *families* (Wikipedia,
  Wiktionary, …) each holding their language *sites*. Run
  `npm run update-catalogue` to refresh the Wikimedia families from the
  `sitematrix` API; families you add by hand are left untouched, and sites
  flagged `closed` are skipped.
- **Following** is `src/feed/followStore.ts`, persisted to localStorage under
  `wiki-scroll.following.v1`.
- **Merging** is `src/wiki/mergedCursor.ts`, which combines one `FeedCursor`
  per followed site into a single cursor emitting the globally newest article.
  A site that fails is isolated and retried rather than breaking the feed.
- **Change which articles appear** — implement a `FeedPolicy` in
  `src/feed/policy.ts`. The default, `requireImage`, hides the roughly half of
  recently-edited articles that have no thumbnail.
- **Support a non-MediaWiki wiki** — add a `type` to the catalogue and a branch
  in `src/wiki/sources.ts` returning a different `WikiSource`.

Design documents are in `docs/superpowers/specs/`; deferred work, including the
third-party wiki catalogue, is in `docs/BACKLOG.md`.

`src/wiki/live-check.test.ts` is a skipped integration test that hits the real
Wikipedia API. Un-skip it to verify the network path after changing sources —
but note it cannot catch CORS problems, because Node does not enforce CORS.

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
