# Custom Wikis — Adding an Unlisted MediaWiki by URL

**Date:** 2026-09-17
**Status:** Approved, ready for implementation planning
**Builds on:** `2026-09-17-multi-wiki-design.md`

## Purpose

Let the reader add any MediaWiki site by URL, follow it alongside the bundled
Wikimedia families, and remove it again. The wiki's own name is used by
default; the same wiki cannot be added twice.

## The language question, settled by measurement

A URL identifies **one wiki, not a language family.** Each URL added is its own
wiki, so `es.example.org` and `en.example.org` are two separate entries.

This was not assumed. Three candidate mechanisms for discovering a wiki's
sibling language sites were tested against five real wikis on 2026-09-17:

| Mechanism | Result |
| --- | --- |
| `action=sitematrix` | A Wikimedia-only extension. Third-party wikis answer `Unrecognized value for parameter "action"`. |
| `meta=siteinfo&siprop=languages` | 568 entries — MediaWiki's *interface* language list. Nothing to do with sibling sites. |
| `meta=siteinfo&siprop=interwikimap` | Unreliable. See below. |

`interwikimap` was the promising one, and it fails in three different ways:

| Wiki | Language entries | Distinct other hosts | What it really is |
| --- | --- | --- | --- |
| Minecraft Wiki | 22 | **20** | A genuine farm: `de.minecraft.wiki`, `es.minecraft.wiki`, … |
| Wikipedia (en) | 378 | 365 | Genuine, but Wikipedia is already handled via `sitematrix` |
| Arch Wiki | 34 | **3** | Multilingual through *page-title suffixes* on a single host |
| OpenStreetMap Wiki | **0** | 0 | Multilingual through subpages |
| Team Fortress Wiki | **0** | 0 | Multilingual through `/Page/de` subpages |

Three of the five are multilingual wikis that expose nothing, and Arch's
"language" entries mostly point back at itself. Auto-detection would succeed for
Minecraft Wiki and mislead everywhere else, so it is not attempted.

**Consequence:** a custom family has exactly one site, whose `lang` comes from
the wiki's own `siteinfo`. The existing language-picker screen still works —
it simply shows one row.

## Scope

**In scope**

- Adding a MediaWiki by URL from the `/settings/wikis` search field
- Endpoint discovery from a homepage, article URL, or `api.php` URL
- Validation before adding: is it MediaWiki, is it reachable, is it a duplicate
- Naming, defaulted to the wiki's own `sitename` and editable
- Recording `capabilities` from the wiki's installed extensions
- Removing a custom wiki
- Persisting custom wikis across launches

**Out of scope**

- Non-MediaWiki wiki software
- Authenticated or private wikis
- Discovering sibling language sites (see above)
- Editing a custom wiki's URL after adding — remove and re-add instead

## Probe: one request answers everything

```
<apiUrl>?action=query&format=json&formatversion=2&origin=*
        &meta=siteinfo&siprop=general|extensions
```

| Field | Used for |
| --- | --- |
| `general.generator` | Confirming it is MediaWiki (`"MediaWiki 1.45.3"`) |
| `general.sitename` | The default name — verified present on every wiki tested |
| `general.lang` | The site's content language |
| `general.server` | Canonical identity, independent of what the user typed |
| `extensions[]` | `capabilities`: presence of `TextExtracts` and `PageImages` |

Extension detection via `siprop=extensions` was verified to agree exactly with a
behavioural probe: Wikipedia and Minecraft Wiki have both extensions;
OpenStreetMap, Team Fortress and Arch Wiki have neither.

### Endpoint discovery

Candidates are tried in order, and the first whose `generator` starts with
`MediaWiki` wins:

1. The input itself, if its path ends in `api.php`
2. `<origin>/api.php`
3. `<origin>/w/api.php`

Two candidates cover the two conventions observed in the wild: Minecraft Wiki
and Arch Wiki serve `/api.php`; OpenStreetMap and Team Fortress serve
`/w/api.php`.

### Failure modes

| Condition | Message |
| --- | --- |
| No candidate responded | "Couldn't reach this wiki. It may not exist, or it may not allow other apps to read it." |
| Responded, but not MediaWiki | "That address doesn't look like a MediaWiki site." |
| Already present | "You're already following this wiki." / "That wiki is already in your list." |

**A limitation worth stating plainly:** in a browser, a CORS refusal and an
unreachable host are indistinguishable — `fetch` rejects with a bare
`TypeError` carrying no detail in both cases. The first message therefore covers
both possibilities rather than guessing at one. Guessing would produce confident
wrong advice, which is worse than an honest either/or.

## Identity and deduplication

The identity of a custom wiki is its **canonical API URL**: taken from the
wiki's own `general.server` (normalised to `https`, since `server` may be
protocol-relative such as `//wiki.openstreetmap.org`) joined to the discovered
script path.

Using the wiki's self-reported server rather than the typed text means
`http://minecraft.wiki`, `https://minecraft.wiki/wiki/Anvil` and
`https://minecraft.wiki/api.php` all collapse to one identity.

**`wikiid` is deliberately not used.** It is not globally unique — OpenStreetMap
Wiki reports `wikiid: "wiki"` — so keying on it would refuse unrelated wikis as
duplicates.

Duplicate checking runs against **both** custom and bundled families, so pasting
`en.wikipedia.org` is rejected as already present rather than creating a second
Wikipedia.

Bundled families carry no `apiUrl` — their sites each imply one, as
`` `https://${site.domain}${family.apiPath ?? DEFAULT_API_PATH}` ``. Duplicate
detection therefore cannot simply search custom entries; `catalogue.ts` provides

```ts
function findSiteByApiUrl(apiUrl: string): { family: WikiFamily; site: WikiSite } | undefined
```

which scans every family, bundled and custom, building each site's implied API
URL and comparing. That is 801 short string comparisons on a rare user action —
not worth indexing.

Family id is `` `custom-${hash}` ``, from

```ts
function familyIdFor(apiUrl: string): string
```

This is stable across devices and reinstalls, and contains no colon —
`parseSiteId` splits on the first colon, so a raw URL could not be used. The cost
is an opaque id in `/settings/wikis/:familyId`; users never see it elsewhere,
since the display name is always the wiki's own.

**The hash must be synchronous.** The obvious choice, `crypto.subtle.digest`,
returns a Promise, which would make `familyIdFor` async and infect `toFamily`
and every caller with it. A 32-bit FNV-1a over the canonical URL, rendered as 8
hex characters, is used instead. Collision resistance is irrelevant here:
duplicates are detected by comparing canonical URLs, never by comparing ids, so
a collision could at worst produce two families sharing an id — and with a
handful of custom wikis that is vanishingly unlikely.

## Architecture

```
src/wiki/
  customWikis.ts     user-added families; localStorage; signal-backed
  probeWiki.ts       endpoint discovery + validation; the only networked part
  catalogue.ts       families() becomes bundled ++ custom
  catalogueTypes.ts  WikiFamily gains `custom?: true` and `apiUrl?: string`
src/routes/
  WikisRoute.tsx     search field doubles as URL entry
```

### `catalogueTypes.ts`

`WikiFamily` gains two optional fields:

```ts
  /** True for user-added wikis; enables the remove action. */
  custom?: true
  /** Canonical API URL. Present on custom families; the dedupe key. */
  apiUrl?: string
```

Bundled families leave both undefined, so `catalogue.json` is unchanged.

### `customWikis.ts`

```ts
const STORAGE_KEY = 'wiki-scroll.customWikis.v1'

function customWikis(): WikiFamily[]
function addCustomWiki(family: WikiFamily): void
function removeCustomWiki(familyId: string): void
function findByApiUrl(apiUrl: string): WikiFamily | undefined
function onChange(listener: () => void): () => void
```

Reads are defensive in the same way as `followStore`: a missing, malformed or
non-array stored value yields an empty list rather than preventing startup, and
entries failing a shape check are dropped.

### `catalogue.ts`

`families()` becomes `[...bundled, ...customWikis()]`, and `findFamily`,
`findSite`, `searchFamilies` all derive from it. Because `customWikis()` reads a
Solid signal, any component calling `families()` during render tracks it and
updates when a wiki is added or removed — the existing screens need no change.

**Import direction matters here.** `catalogue.ts` imports `customWikis.ts`, and
`probeWiki.ts` imports `catalogue.ts` for duplicate detection. Neither
`catalogue.ts` nor `customWikis.ts` may import `probeWiki.ts`, or the cycle
closes. Duplicate detection belongs in `probeWiki` rather than the UI because it
can only run once the canonical URL is known, which is after the probe.

### `probeWiki.ts`

```ts
interface ProbedWiki {
  apiUrl: string
  domain: string
  apiPath: string
  sitename: string
  lang: string
  capabilities: WikiCapabilities
}

type ProbeFailureKind = 'unreachable' | 'not-mediawiki' | 'duplicate'

class ProbeError extends Error {
  readonly kind: ProbeFailureKind
  readonly existingFamilyId?: string
}

function candidateApiUrls(input: string): string[]
function toFamily(probed: ProbedWiki, name: string): WikiFamily
async function probeWiki(input: string): Promise<ProbedWiki>
```

`candidateApiUrls` and `toFamily` are pure and carry the test weight;
`probeWiki` is the thin networked shell around them.

## UI

The `/settings/wikis` search field becomes **"Search or add by URL…"**.

### Detecting a URL

A query is treated as a URL when it has no whitespace **and** either starts with
`http://` / `https://`, or matches a dotted host shape (`something.something`
with a 2+ character final label). Wiki names rarely contain dots, so ordinary
searching is unaffected.

### The add row

When the query looks like a URL, a row appears **directly below the search
field**, above any name matches, moving through these states:

| State | Shows |
| --- | --- |
| Idle | `Add <host>` with a plus affordance |
| Checking | `Checking <host>…`, non-blocking |
| Confirm | The wiki's name in an editable field, its language, a "text only" note if it lacks `PageImages`, and Add / Cancel |
| Error | The relevant message from the failure table, and the row stays so it can be retried |

Name matches from the bundled catalogue still render below, so a query that is
both a plausible host and a name match shows both options.

On Add: the family is stored, its single site is followed, and the query clears.

### Removal

Two distinct actions, deliberately not merged:

- **Unfollow** a custom wiki's site — it stays in the catalogue list
- **Remove** the custom wiki — deletes it from the catalogue *and* unfollows its
  site, so no followed site can be left pointing at a family that no longer
  exists

Remove is offered on the custom wiki's row in the catalogue list and on its
language-picker screen. Bundled families offer no remove.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Probe fails | Inline error in the add row; nothing is stored |
| Duplicate | Inline error naming it as already present; nothing is stored |
| Wiki lacks `PageImages` | Added, flagged text-only; a note explains that its articles stay hidden until *show imageless articles* exists |
| Corrupt `localStorage` | Empty custom list; bundled catalogue still works |
| Followed site's family removed | `followStore` already drops site ids absent from the catalogue on load; `removeCustomWiki` unfollows eagerly so this is belt-and-braces |
| Custom wiki later becomes unreachable | The merged cursor isolates it and the feed reports it, exactly as for any other site |

## Testing

No test performs network I/O; probe responses are fixtures.

| Module | Cases |
| --- | --- |
| `probeWiki` | `candidateApiUrls` handles a bare host, a scheme-less host, an article URL, and an explicit `api.php`; a trailing slash and an uppercase host normalise identically; `toFamily` maps sitename/lang/extensions into a family with one site; capabilities false when extensions are absent; protocol-relative `server` normalises to https |
| `customWikis` | add/remove round-trips through localStorage; `findByApiUrl` matches regardless of typed form; malformed and non-array stored values yield an empty list; entries with a missing `apiUrl` are dropped |
| `catalogue` | `families()` includes custom wikis; `findSite` resolves a custom site id; `searchFamilies` matches custom names; removing a custom wiki removes it from all three; `findSiteByApiUrl` resolves a bundled site from its implied API URL and a custom one from its stored `apiUrl` |
| URL heuristic | `minecraft.wiki` and `https://x.org/wiki/Y` are URLs; `Wikiquote`, `Minecraft Wiki` and an empty string are not |
| Duplicate detection | Rejects a second add of the same canonical URL; rejects `en.wikipedia.org` as already bundled |

## Carried over, not yet built

The previous exchange proposed, but did not build, an **eager debounced feed
refresh on selection change**, together with a fix for a real latent bug: today
`feedStore.reset()` does not cancel an in-flight load, so articles fetched under
the previous selection can be appended to the freshly reset feed. A test
demonstrating it fails with
`expected [ { id: 'old:1' … } ] to deeply equal []`.

This work interacts directly with the present spec — adding and following a
custom wiki is itself a selection change, which makes the race easier to hit —
so it should be done first or alongside, not after.

## Deferred

- Editing a custom wiki's URL in place
- Authenticated or private wikis
- Importing several wikis at once
- Re-probing a custom wiki's capabilities after it upgrades
- Non-MediaWiki source types
