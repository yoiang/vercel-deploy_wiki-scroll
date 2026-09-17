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
`docs/superpowers/specs/2026-09-17-wiki-scroll-design.md`, and the
implementation plan at `docs/superpowers/plans/2026-09-17-wiki-scroll.md`.

`src/wiki/live-check.test.ts` is a skipped integration test that hits the real
Wikipedia API. Un-skip it to verify the network path after changing sources.

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
