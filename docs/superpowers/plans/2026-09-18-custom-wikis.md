# Custom Wikis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the reader add any MediaWiki by URL from the wikis search field, follow it alongside the bundled Wikimedia families, and remove it again.

**Architecture:** User-added families live in `localStorage` behind a signal-backed `customWikis` store. `catalogue.ts`'s `families()` becomes `[...bundled, ...custom]`, so every existing screen picks them up with no change. `probeWiki.ts` discovers a wiki's `api.php`, validates it, and reads its name, language and extensions in one request; its pure parts carry the test weight.

**Tech Stack:** TypeScript, Vite, Solid 1.9, Capacitor 8, `m3api`, `@solidjs/router`, Vitest + jsdom, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-17-custom-wikis-design.md`

## Global Constraints

- **Never run `git` commands.** The user owns all version control. Each task ends with verification, not a commit.
- `npm install` and `npx vitest` are permitted and should be used to verify work.
- `verbatimModuleSyntax: true` — all type-only imports must use `import type { … }`.
- `erasableSyntaxOnly: true` — **no `enum`, no `namespace`, no constructor parameter properties.**
- `allowImportingTsExtensions: true` — relative imports carry the extension (`./types.ts`).
- `strict`, `noUnusedLocals`, `noUnusedParameters` all on. `noUnusedLocals` does **not** exempt underscore-prefixed locals.
- **Import direction:** `catalogue.ts` imports `customWikis.ts`; `probeWiki.ts` imports `catalogue.ts`. Neither `catalogue.ts` nor `customWikis.ts` may import `probeWiki.ts`, or the cycle closes.
- Site id format is `` `${familyId}:${lang}` ``; `parseSiteId` splits on the **first** colon, so a family id must never contain one.
- Custom family id is `` `custom-${8 hex chars}` `` from a **synchronous** FNV-1a hash. `crypto.subtle.digest` is async and would infect every caller.
- A custom family has **exactly one site** — MediaWiki offers no reliable way to enumerate sibling language sites (see spec).
- Tests perform no network I/O. `globalThis.fetch` is stubbed where a networked path is exercised.

---

### Task 1: Custom wiki storage

**Files:**
- Modify: `src/wiki/catalogueTypes.ts`
- Create: `src/wiki/customWikis.ts`
- Test: `src/wiki/customWikis.test.ts`

**Interfaces:**
- Consumes: `WikiFamily` from `src/wiki/catalogueTypes.ts`
- Produces:
  - `WikiFamily` gains `custom?: true` and `apiUrl?: string`
  - `const CUSTOM_STORAGE_KEY = 'wiki-scroll.customWikis.v1'`
  - `function customWikis(): WikiFamily[]`
  - `function addCustomWiki(family: WikiFamily): void`
  - `function removeCustomWiki(familyId: string): void`
  - `function findByApiUrl(apiUrl: string): WikiFamily | undefined`
  - `function onCustomWikisChange(listener: () => void): () => void`

- [ ] **Step 1: Extend the family type**

In `src/wiki/catalogueTypes.ts`, add two optional fields to `WikiFamily`, after `capabilities`:

```ts
  /** True for user-added wikis; enables the remove action. */
  custom?: true
  /** Canonical API URL. Present on custom families; the deduplication key. */
  apiUrl?: string
```

Bundled families leave both undefined, so `catalogue.json` is unchanged.

- [ ] **Step 2: Write the failing tests**

Create `src/wiki/customWikis.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_STORAGE_KEY,
  addCustomWiki,
  customWikis,
  findByApiUrl,
  onCustomWikisChange,
  parseStoredCustomWikis,
  removeCustomWiki,
} from './customWikis.ts'
import type { WikiFamily } from './catalogueTypes.ts'

function family(overrides: Partial<WikiFamily> = {}): WikiFamily {
  return {
    id: 'custom-abcd1234',
    name: 'Minecraft Wiki',
    type: 'mediawiki',
    apiPath: '/api.php',
    capabilities: { extracts: true, pageImages: true },
    custom: true,
    apiUrl: 'https://minecraft.wiki/api.php',
    sites: [{ lang: 'en', name: 'English', english: 'English', domain: 'minecraft.wiki' }],
    ...overrides,
  }
}

beforeEach(() => {
  // The module holds its list in a signal read once at import, so clearing
  // storage alone does not empty it — drain it through the public API first.
  for (const existing of customWikis()) removeCustomWiki(existing.id)
  localStorage.clear()
})

describe('customWikis', () => {
  it('starts empty', () => {
    expect(customWikis()).toEqual([])
  })

  it('returns an added wiki', () => {
    addCustomWiki(family())
    expect(customWikis().map((f) => f.name)).toEqual(['Minecraft Wiki'])
  })

  it('persists an added wiki to localStorage', () => {
    addCustomWiki(family())
    expect(localStorage.getItem(CUSTOM_STORAGE_KEY)).toContain('minecraft.wiki')
  })

  it('removes a wiki by id', () => {
    addCustomWiki(family())
    removeCustomWiki('custom-abcd1234')
    expect(customWikis()).toEqual([])
  })

  it('ignores removal of an unknown id', () => {
    addCustomWiki(family())
    removeCustomWiki('custom-nothere')
    expect(customWikis()).toHaveLength(1)
  })

  it('replaces rather than duplicates when the same id is added twice', () => {
    addCustomWiki(family())
    addCustomWiki(family({ name: 'Renamed' }))
    expect(customWikis()).toHaveLength(1)
    expect(customWikis()[0]!.name).toBe('Renamed')
  })
})

describe('findByApiUrl', () => {
  it('finds an added wiki by its canonical url', () => {
    addCustomWiki(family())
    expect(findByApiUrl('https://minecraft.wiki/api.php')?.id).toBe('custom-abcd1234')
  })

  it('returns undefined for an unknown url', () => {
    addCustomWiki(family())
    expect(findByApiUrl('https://example.org/api.php')).toBeUndefined()
  })
})

describe('change notification', () => {
  it('notifies on add', () => {
    const listener = vi.fn()
    const stop = onCustomWikisChange(listener)
    addCustomWiki(family())
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('notifies on remove', () => {
    addCustomWiki(family())
    const listener = vi.fn()
    const stop = onCustomWikisChange(listener)
    removeCustomWiki('custom-abcd1234')
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    onCustomWikisChange(listener)()
    addCustomWiki(family())
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('parseStoredCustomWikis', () => {
  // Tested directly rather than through localStorage. The module reads storage
  // once, at import — so writing to localStorage mid-test and then calling
  // add/remove would exercise the in-memory signal and never re-read, making
  // such a test silently vacuous.

  it('returns nothing when there is no stored value', () => {
    expect(parseStoredCustomWikis(null)).toEqual([])
  })

  it('survives a non-JSON stored value', () => {
    expect(parseStoredCustomWikis('not json')).toEqual([])
  })

  it('survives a stored value that is not an array', () => {
    expect(parseStoredCustomWikis(JSON.stringify({ nope: true }))).toEqual([])
  })

  it('keeps a well-formed entry', () => {
    expect(parseStoredCustomWikis(JSON.stringify([family()]))).toHaveLength(1)
  })

  it('drops entries with no apiUrl', () => {
    const stored = JSON.stringify([{ id: 'custom-x', name: 'Broken', type: 'mediawiki', sites: [] }])
    expect(parseStoredCustomWikis(stored)).toEqual([])
  })

  it('drops entries with no sites', () => {
    const stored = JSON.stringify([
      { id: 'custom-y', name: 'Empty', type: 'mediawiki', apiUrl: 'https://e.org/api.php', sites: [] },
    ])
    expect(parseStoredCustomWikis(stored)).toEqual([])
  })

  it('keeps good entries alongside bad ones', () => {
    const stored = JSON.stringify([family(), { id: 'junk' }])
    expect(parseStoredCustomWikis(stored)).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/customWikis.test.ts`
Expected: FAIL — cannot resolve `./customWikis.ts`.

- [ ] **Step 4: Implement the store**

Create `src/wiki/customWikis.ts`:

```ts
import { createSignal } from 'solid-js'
import type { WikiFamily } from './catalogueTypes.ts'

export const CUSTOM_STORAGE_KEY = 'wiki-scroll.customWikis.v1'

/**
 * A stored entry is only usable if it can actually produce a source: it needs
 * a canonical url for deduplication and exactly the one site it was built with.
 */
function isUsable(entry: unknown): entry is WikiFamily {
  if (typeof entry !== 'object' || entry === null) return false
  const family = entry as Partial<WikiFamily>
  return (
    typeof family.id === 'string' &&
    typeof family.name === 'string' &&
    typeof family.apiUrl === 'string' &&
    Array.isArray(family.sites) &&
    family.sites.length > 0
  )
}

/**
 * Exported and pure so the defensive behaviour is testable. Storage is read
 * once, at module import, so a test that wrote to localStorage and then called
 * add/remove would exercise the in-memory signal and never reach this code.
 */
export function parseStoredCustomWikis(raw: string | null): WikiFamily[] {
  if (raw === null) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isUsable)
}

function readStored(): WikiFamily[] {
  try {
    return parseStoredCustomWikis(localStorage.getItem(CUSTOM_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeStored(families: WikiFamily[]): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(families))
  } catch {
    // A full or unavailable quota must not break adding a wiki; it simply will
    // not survive a relaunch.
  }
}

const [families, setFamilies] = createSignal<WikiFamily[]>(readStored())
const listeners = new Set<() => void>()

function commit(next: WikiFamily[]): void {
  setFamilies(next)
  writeStored(next)
  for (const listener of listeners) listener()
}

export function customWikis(): WikiFamily[] {
  return families()
}

export function addCustomWiki(family: WikiFamily): void {
  commit([...families().filter((existing) => existing.id !== family.id), family])
}

export function removeCustomWiki(familyId: string): void {
  if (!families().some((existing) => existing.id === familyId)) return
  commit(families().filter((existing) => existing.id !== familyId))
}

export function findByApiUrl(apiUrl: string): WikiFamily | undefined {
  return families().find((family) => family.apiUrl === apiUrl)
}

export function onCustomWikisChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/customWikis.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, type check clean. Do not commit.

---

### Task 2: Catalogue includes custom wikis

**Files:**
- Modify: `src/wiki/catalogue.ts`
- Test: `src/wiki/catalogue.test.ts` (add cases)

**Interfaces:**
- Consumes: `customWikis`, `addCustomWiki`, `removeCustomWiki` from `src/wiki/customWikis.ts`
- Produces:
  - `families()` now returns bundled families followed by custom ones
  - `function findSiteByApiUrl(apiUrl: string): { family: WikiFamily; site: WikiSite } | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `src/wiki/catalogue.test.ts`:

```ts
import { addCustomWiki, removeCustomWiki } from './customWikis.ts'
import { findSiteByApiUrl } from './catalogue.ts'
import type { WikiFamily } from './catalogueTypes.ts'

const customFamily: WikiFamily = {
  id: 'custom-deadbeef',
  name: 'Minecraft Wiki',
  type: 'mediawiki',
  apiPath: '/api.php',
  capabilities: { extracts: true, pageImages: true },
  custom: true,
  apiUrl: 'https://minecraft.wiki/api.php',
  sites: [{ lang: 'en', name: 'English', english: 'English', domain: 'minecraft.wiki' }],
}

describe('catalogue with custom wikis', () => {
  afterEach(() => {
    removeCustomWiki('custom-deadbeef')
  })

  it('includes a custom wiki in families()', () => {
    addCustomWiki(customFamily)
    expect(families().map((f) => f.id)).toContain('custom-deadbeef')
  })

  it('lists bundled families before custom ones', () => {
    addCustomWiki(customFamily)
    const ids = families().map((f) => f.id)
    expect(ids[0]).toBe('wikipedia')
    expect(ids[ids.length - 1]).toBe('custom-deadbeef')
  })

  it('resolves a custom site id', () => {
    addCustomWiki(customFamily)
    expect(findSite('custom-deadbeef:en')?.site.domain).toBe('minecraft.wiki')
  })

  it('finds a custom family by name search', () => {
    addCustomWiki(customFamily)
    expect(searchFamilies('minecraft').map((f) => f.id)).toEqual(['custom-deadbeef'])
  })

  it('drops the custom wiki from all lookups once removed', () => {
    addCustomWiki(customFamily)
    removeCustomWiki('custom-deadbeef')
    expect(families().map((f) => f.id)).not.toContain('custom-deadbeef')
    expect(findSite('custom-deadbeef:en')).toBeUndefined()
    expect(searchFamilies('minecraft')).toEqual([])
  })
})

describe('findSiteByApiUrl', () => {
  it('resolves a bundled site from its implied api url', () => {
    // Bundled families carry no apiUrl; the site's is domain + apiPath.
    const found = findSiteByApiUrl('https://en.wikipedia.org/w/api.php')
    expect(found?.family.id).toBe('wikipedia')
    expect(found?.site.lang).toBe('en')
  })

  it('resolves a bundled site of another family', () => {
    expect(findSiteByApiUrl('https://fr.wiktionary.org/w/api.php')?.family.id).toBe('wiktionary')
  })

  it('resolves a custom site from its stored apiUrl', () => {
    addCustomWiki(customFamily)
    expect(findSiteByApiUrl('https://minecraft.wiki/api.php')?.family.id).toBe('custom-deadbeef')
    removeCustomWiki('custom-deadbeef')
  })

  it('returns undefined for an unknown url', () => {
    expect(findSiteByApiUrl('https://nowhere.example/api.php')).toBeUndefined()
  })
})
```

Add `afterEach` to the vitest import at the top of the file:

```ts
import { afterEach, describe, expect, it } from 'vitest'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/catalogue.test.ts`
Expected: FAIL — `findSiteByApiUrl` is not exported, and custom wikis do not appear in `families()`.

- [ ] **Step 3: Make the catalogue dynamic**

In `src/wiki/catalogue.ts`, add the import and replace `families()`:

```ts
import { customWikis } from './customWikis.ts'
```

```ts
/**
 * Bundled families first, then user-added ones. Because `customWikis()` reads a
 * Solid signal, any component calling this during render tracks it and updates
 * when a wiki is added or removed.
 */
export function families(): WikiFamily[] {
  return [...catalogue.families, ...customWikis()]
}
```

Then change `findFamily` and `searchFamilies` to read through `families()` rather than `catalogue.families` directly:

```ts
export function findFamily(familyId: string): WikiFamily | undefined {
  return families().find((family) => family.id === familyId)
}
```

```ts
export function searchFamilies(query: string): WikiFamily[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return families()

  return families().filter(
    (family) =>
      family.name.toLowerCase().includes(needle) || family.id.toLowerCase().includes(needle),
  )
}
```

`findSite` already delegates to `findFamily`, so it needs no change.

- [ ] **Step 4: Add `findSiteByApiUrl`**

Append to `src/wiki/catalogue.ts`:

```ts
/**
 * Finds the site whose API endpoint is `apiUrl`, across bundled and custom
 * families. Bundled families carry no `apiUrl`, so each site's is derived from
 * its domain and the family's api path. That is ~800 short comparisons, run
 * only when a user adds a wiki by hand — not worth indexing.
 */
export function findSiteByApiUrl(
  apiUrl: string,
): { family: WikiFamily; site: WikiSite } | undefined {
  for (const family of families()) {
    const apiPath = family.apiPath ?? DEFAULT_API_PATH
    for (const site of family.sites) {
      if (`https://${site.domain}${apiPath}` === apiUrl) return { family, site }
    }
  }
  return undefined
}
```

Add `DEFAULT_API_PATH` to the existing type import at the top of the file — note it is a **value**, not a type, so it needs a separate plain import:

```ts
import { DEFAULT_API_PATH } from './catalogueTypes.ts'
import type { Catalogue, WikiFamily, WikiSite } from './catalogueTypes.ts'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/`
Expected: PASS. The pre-existing catalogue tests still pass because no custom
wiki is present during them.

- [ ] **Step 6: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, type check clean. Do not commit.

---

### Task 3: URL handling and family construction — the pure parts

**Files:**
- Create: `src/wiki/probeWiki.ts` (pure functions only; the network comes in Task 4)
- Test: `src/wiki/probeWiki.test.ts`

**Interfaces:**
- Consumes: `WikiCapabilities`, `WikiFamily` from `src/wiki/catalogueTypes.ts`
- Produces:
  - `interface ProbedWiki { apiUrl: string; domain: string; apiPath: string; sitename: string; lang: string; capabilities: WikiCapabilities }`
  - `interface SiteInfoResponse` — the shape read from `meta=siteinfo`
  - `function looksLikeUrl(query: string): boolean`
  - `function candidateApiUrls(input: string): string[]`
  - `function familyIdFor(apiUrl: string): string`
  - `function parseSiteInfo(candidateApiUrl: string, response: SiteInfoResponse): ProbedWiki | undefined`
  - `function toFamily(probed: ProbedWiki, name: string): WikiFamily`

- [ ] **Step 1: Write the failing tests**

Create `src/wiki/probeWiki.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  candidateApiUrls,
  familyIdFor,
  looksLikeUrl,
  parseSiteInfo,
  toFamily,
} from './probeWiki.ts'
import type { SiteInfoResponse } from './probeWiki.ts'

describe('looksLikeUrl', () => {
  it('accepts a bare dotted host', () => {
    expect(looksLikeUrl('minecraft.wiki')).toBe(true)
  })

  it('accepts a full article url', () => {
    expect(looksLikeUrl('https://wiki.archlinux.org/title/Installation_guide')).toBe(true)
  })

  it('accepts a multi-label host', () => {
    expect(looksLikeUrl('wiki.openstreetmap.org')).toBe(true)
  })

  it('rejects a plain wiki name', () => {
    expect(looksLikeUrl('Wikiquote')).toBe(false)
  })

  it('rejects a name containing a space', () => {
    expect(looksLikeUrl('Minecraft Wiki')).toBe(false)
  })

  it('rejects an empty query', () => {
    expect(looksLikeUrl('   ')).toBe(false)
  })

  it('rejects a version-like string whose last label is numeric', () => {
    expect(looksLikeUrl('1.47')).toBe(false)
  })
})

describe('candidateApiUrls', () => {
  it('offers both conventions for a bare host', () => {
    expect(candidateApiUrls('minecraft.wiki')).toEqual([
      'https://minecraft.wiki/api.php',
      'https://minecraft.wiki/w/api.php',
    ])
  })

  it('puts an explicit api.php first', () => {
    expect(candidateApiUrls('https://wiki.openstreetmap.org/w/api.php')[0]).toBe(
      'https://wiki.openstreetmap.org/w/api.php',
    )
  })

  it('reduces to the origin for an article url', () => {
    expect(candidateApiUrls('https://minecraft.wiki/w/Anvil')).toEqual([
      'https://minecraft.wiki/api.php',
      'https://minecraft.wiki/w/api.php',
    ])
  })

  it('upgrades a scheme-less host to https', () => {
    expect(candidateApiUrls('minecraft.wiki')[0]!.startsWith('https://')).toBe(true)
  })

  it('normalises an uppercase host', () => {
    expect(candidateApiUrls('https://MineCraft.WIKI/')).toEqual(
      candidateApiUrls('minecraft.wiki'),
    )
  })

  it('normalises a trailing slash', () => {
    expect(candidateApiUrls('https://minecraft.wiki/')).toEqual(candidateApiUrls('minecraft.wiki'))
  })

  it('does not duplicate when the input is already /api.php', () => {
    const candidates = candidateApiUrls('https://minecraft.wiki/api.php')
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('returns nothing for unparseable input', () => {
    expect(candidateApiUrls('http://')).toEqual([])
  })
})

describe('familyIdFor', () => {
  it('is deterministic', () => {
    expect(familyIdFor('https://a.org/api.php')).toBe(familyIdFor('https://a.org/api.php'))
  })

  it('differs for different urls', () => {
    expect(familyIdFor('https://a.org/api.php')).not.toBe(familyIdFor('https://b.org/api.php'))
  })

  it('contains no colon, which parseSiteId would split on', () => {
    expect(familyIdFor('https://a.org/api.php')).not.toContain(':')
  })

  it('is prefixed and fixed width', () => {
    expect(familyIdFor('https://a.org/api.php')).toMatch(/^custom-[0-9a-f]{8}$/)
  })
})

const response: SiteInfoResponse = {
  query: {
    general: {
      generator: 'MediaWiki 1.45.3',
      sitename: 'Minecraft Wiki',
      lang: 'en',
      server: 'https://minecraft.wiki',
    },
    extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }, { name: 'CiteThisPage' }],
  },
}

describe('parseSiteInfo', () => {
  it('reads sitename and language', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!
    expect(probed.sitename).toBe('Minecraft Wiki')
    expect(probed.lang).toBe('en')
  })

  it('detects both capabilities', () => {
    const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!
    expect(probed.capabilities).toEqual({ extracts: true, pageImages: true })
  })

  it('reports missing capabilities as false', () => {
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: 'https://wiki.openstreetmap.org',
        },
        extensions: [{ name: 'Cite' }],
      },
    })!
    expect(probed.capabilities).toEqual({ extracts: false, pageImages: false })
  })

  it('builds the canonical url from the wiki its own server, not the input', () => {
    const probed = parseSiteInfo('https://MineCraft.wiki/api.php', response)!
    expect(probed.apiUrl).toBe('https://minecraft.wiki/api.php')
  })

  it('normalises a protocol-relative server to https', () => {
    // OpenStreetMap really does return "//wiki.openstreetmap.org".
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: '//wiki.openstreetmap.org',
        },
        extensions: [],
      },
    })!
    expect(probed.apiUrl).toBe('https://wiki.openstreetmap.org/w/api.php')
  })

  it('keeps the discovered api path', () => {
    const probed = parseSiteInfo('https://wiki.openstreetmap.org/w/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OSM',
          lang: 'en',
          server: 'https://wiki.openstreetmap.org',
        },
        extensions: [],
      },
    })!
    expect(probed.apiPath).toBe('/w/api.php')
  })

  it('rejects a response with no generator', () => {
    expect(parseSiteInfo('https://x.org/api.php', { query: { general: {} } })).toBeUndefined()
  })

  it('rejects a generator that is not MediaWiki', () => {
    expect(
      parseSiteInfo('https://x.org/api.php', {
        query: { general: { generator: 'DokuWiki 2024', sitename: 'X', lang: 'en', server: 'https://x.org' } },
      }),
    ).toBeUndefined()
  })

  it('rejects an empty response', () => {
    expect(parseSiteInfo('https://x.org/api.php', {})).toBeUndefined()
  })
})

describe('toFamily', () => {
  const probed = parseSiteInfo('https://minecraft.wiki/api.php', response)!

  it('uses the given name', () => {
    expect(toFamily(probed, 'My Wiki').name).toBe('My Wiki')
  })

  it('falls back to the wiki sitename when the name is blank', () => {
    expect(toFamily(probed, '   ').name).toBe('Minecraft Wiki')
  })

  it('marks the family custom and records the canonical url', () => {
    const built = toFamily(probed, 'My Wiki')
    expect(built.custom).toBe(true)
    expect(built.apiUrl).toBe('https://minecraft.wiki/api.php')
  })

  it('creates exactly one site', () => {
    // MediaWiki offers no reliable way to enumerate sibling language sites.
    expect(toFamily(probed, 'My Wiki').sites).toHaveLength(1)
  })

  it('names the site by language rather than repeating the wiki name', () => {
    const site = toFamily(probed, 'My Wiki').sites[0]!
    expect(site.lang).toBe('en')
    expect(site.english).toBe('English')
  })

  it('gives a Japanese site its autonym', () => {
    const jaProbed = parseSiteInfo('https://ja.example.org/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.44',
          sitename: 'Example',
          lang: 'ja',
          server: 'https://ja.example.org',
        },
        extensions: [],
      },
    })!
    const site = toFamily(jaProbed, 'Example').sites[0]!
    expect(site.name).toBe('日本語')
    expect(site.english).toBe('Japanese')
  })

  it('falls back to the raw code for an unusable language tag', () => {
    const oddProbed = parseSiteInfo('https://odd.example.org/api.php', {
      query: {
        general: {
          generator: 'MediaWiki 1.44',
          sitename: 'Odd',
          lang: 'x-invalid',
          server: 'https://odd.example.org',
        },
        extensions: [],
      },
    })!
    const site = toFamily(oddProbed, 'Odd').sites[0]!
    expect(site.name).toBe('x-invalid')
  })

  it('carries the api path onto the family', () => {
    expect(toFamily(probed, 'My Wiki').apiPath).toBe('/api.php')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/probeWiki.test.ts`
Expected: FAIL — cannot resolve `./probeWiki.ts`.

- [ ] **Step 3: Implement the pure functions**

Create `src/wiki/probeWiki.ts`:

```ts
import { DEFAULT_API_PATH } from './catalogueTypes.ts'
import type { WikiCapabilities, WikiFamily } from './catalogueTypes.ts'

export interface ProbedWiki {
  /** Canonical API URL, built from the wiki's own server. The dedupe key. */
  apiUrl: string
  domain: string
  apiPath: string
  sitename: string
  lang: string
  capabilities: WikiCapabilities
}

/** The parts of a `meta=siteinfo&siprop=general|extensions` response we read. */
export interface SiteInfoResponse {
  query?: {
    general?: {
      generator?: string
      sitename?: string
      lang?: string
      server?: string
    }
    extensions?: Array<{ name?: string }>
  }
}

/**
 * Whether a search query should be offered as a URL to add. Wiki names rarely
 * contain dots and never contain a scheme, so ordinary searching is unaffected.
 */
export function looksLikeUrl(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return false
  if (/^https?:\/\//i.test(trimmed)) return true
  // A dotted host whose final label is alphabetic, so "1.47" is not a URL.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/:?#]|$)/i.test(trimmed)
}

/**
 * API endpoints to try, in order. Two conventions cover what is seen in the
 * wild: Minecraft Wiki and Arch Wiki serve /api.php, while OpenStreetMap and
 * Team Fortress serve /w/api.php.
 */
export function candidateApiUrls(input: string): string[] {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return []
  }
  if (url.hostname === '') return []

  const candidates: string[] = []
  if (url.pathname.toLowerCase().endsWith('/api.php')) {
    candidates.push(`${url.origin}${url.pathname}`)
  }
  candidates.push(`${url.origin}/api.php`)
  candidates.push(`${url.origin}${DEFAULT_API_PATH}`)

  return [...new Set(candidates)]
}

/**
 * A stable id for a custom family.
 *
 * FNV-1a rather than crypto.subtle.digest, which is async and would make this
 * function — and every caller — async. Collision resistance is irrelevant:
 * duplicates are detected by comparing canonical URLs, never ids.
 */
export function familyIdFor(apiUrl: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < apiUrl.length; index++) {
    hash ^= apiUrl.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `custom-${hash.toString(16).padStart(8, '0')}`
}

export function parseSiteInfo(
  candidateApiUrl: string,
  response: SiteInfoResponse,
): ProbedWiki | undefined {
  const general = response.query?.general
  if (!general?.generator?.startsWith('MediaWiki')) return undefined
  if (!general.server) return undefined

  // `server` may be protocol-relative, e.g. "//wiki.openstreetmap.org".
  const server = general.server.startsWith('//') ? `https:${general.server}` : general.server

  let host: string
  let apiPath: string
  try {
    host = new URL(server).host
    apiPath = new URL(candidateApiUrl).pathname
  } catch {
    return undefined
  }

  const extensions = new Set((response.query?.extensions ?? []).map((entry) => entry.name))

  return {
    apiUrl: `https://${host}${apiPath}`,
    domain: host,
    apiPath,
    sitename: general.sitename ?? host,
    lang: general.lang ?? 'en',
    capabilities: {
      extracts: extensions.has('TextExtracts'),
      pageImages: extensions.has('PageImages'),
    },
  }
}

/** Human names for a language tag, falling back to the raw code. */
function languageNames(lang: string): { name: string; english: string } {
  try {
    return {
      name: new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang,
      english: new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang,
    }
  } catch {
    // Intl throws on a structurally invalid tag; an unknown-but-valid tag is
    // echoed back rather than throwing.
    return { name: lang, english: lang }
  }
}

export function toFamily(probed: ProbedWiki, name: string): WikiFamily {
  const names = languageNames(probed.lang)

  return {
    id: familyIdFor(probed.apiUrl),
    name: name.trim() === '' ? probed.sitename : name.trim(),
    type: 'mediawiki',
    apiPath: probed.apiPath,
    capabilities: probed.capabilities,
    custom: true,
    apiUrl: probed.apiUrl,
    // Exactly one site: MediaWiki offers no reliable way to enumerate sibling
    // language sites, so each URL added is its own wiki.
    sites: [
      {
        lang: probed.lang,
        name: names.name,
        english: names.english,
        domain: probed.domain,
      },
    ],
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/probeWiki.test.ts`
Expected: PASS, 31 tests.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, type check clean. Do not commit.

---

### Task 4: The networked probe

**Files:**
- Modify: `src/wiki/probeWiki.ts` (add the networked shell)
- Test: `src/wiki/probeWiki.test.ts` (add cases)

**Interfaces:**
- Consumes: `findSiteByApiUrl` from `src/wiki/catalogue.ts`; the pure functions from Task 3
- Produces:
  - `type ProbeFailureKind = 'unreachable' | 'not-mediawiki' | 'duplicate'`
  - `class ProbeError extends Error` with `readonly kind: ProbeFailureKind` and `readonly existingName?: string`
  - `async function probeWiki(input: string): Promise<ProbedWiki>`

- [ ] **Step 1: Write the failing tests**

Append to `src/wiki/probeWiki.test.ts`:

```ts
// `vi` is deliberately not imported here — these tests stub globalThis.fetch
// directly, and an unused import is a build error under noUnusedLocals.
import { afterEach } from 'vitest'
import { ProbeError, probeWiki } from './probeWiki.ts'
import { addCustomWiki, removeCustomWiki } from './customWikis.ts'
import { toFamily as buildFamily } from './probeWiki.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answers only the given URLs; everything else rejects like a failed fetch. */
function stubFetch(byUrl: Record<string, SiteInfoResponse>): () => string[] {
  const requested: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    requested.push(url)
    const base = url.split('?')[0]!
    const body = byUrl[base]
    if (!body) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return () => requested
}

const mcResponse: SiteInfoResponse = {
  query: {
    general: {
      generator: 'MediaWiki 1.45.3',
      sitename: 'Minecraft Wiki',
      lang: 'en',
      server: 'https://minecraft.wiki',
    },
    extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }],
  },
}

describe('probeWiki', () => {
  it('finds a wiki served at /api.php', async () => {
    stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    const probed = await probeWiki('minecraft.wiki')
    expect(probed.sitename).toBe('Minecraft Wiki')
  })

  it('falls through to /w/api.php when /api.php is absent', async () => {
    const osm: SiteInfoResponse = {
      query: {
        general: {
          generator: 'MediaWiki 1.46.0',
          sitename: 'OpenStreetMap Wiki',
          lang: 'en',
          server: '//wiki.openstreetmap.org',
        },
        extensions: [],
      },
    }
    const requested = stubFetch({ 'https://wiki.openstreetmap.org/w/api.php': osm })
    const probed = await probeWiki('wiki.openstreetmap.org')
    expect(probed.apiPath).toBe('/w/api.php')
    expect(requested()).toHaveLength(2)
  })

  it('throws unreachable when nothing responds', async () => {
    stubFetch({})
    await expect(probeWiki('nowhere.example')).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('throws not-mediawiki when something responds but is not a wiki', async () => {
    stubFetch({
      'https://blog.example/api.php': { query: { general: { generator: 'DokuWiki 2024' } } },
    })
    await expect(probeWiki('blog.example')).rejects.toMatchObject({ kind: 'not-mediawiki' })
  })

  it('throws duplicate when the wiki is already a custom entry', async () => {
    stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    const probed = await probeWiki('minecraft.wiki')
    addCustomWiki(buildFamily(probed, 'Minecraft Wiki'))
    try {
      await expect(probeWiki('https://minecraft.wiki/wiki/Anvil')).rejects.toMatchObject({
        kind: 'duplicate',
      })
    } finally {
      removeCustomWiki(buildFamily(probed, 'Minecraft Wiki').id)
    }
  })

  it('throws duplicate when the wiki is already bundled', async () => {
    stubFetch({
      'https://en.wikipedia.org/w/api.php': {
        query: {
          general: {
            generator: 'MediaWiki 1.47.0',
            sitename: 'Wikipedia',
            lang: 'en',
            server: 'https://en.wikipedia.org',
          },
          extensions: [{ name: 'TextExtracts' }, { name: 'PageImages' }],
        },
      },
    })
    await expect(probeWiki('en.wikipedia.org')).rejects.toMatchObject({ kind: 'duplicate' })
  })

  it('names the existing wiki on a duplicate', async () => {
    stubFetch({
      'https://en.wikipedia.org/w/api.php': {
        query: {
          general: {
            generator: 'MediaWiki 1.47.0',
            sitename: 'Wikipedia',
            lang: 'en',
            server: 'https://en.wikipedia.org',
          },
          extensions: [],
        },
      },
    })
    await expect(probeWiki('en.wikipedia.org')).rejects.toMatchObject({
      existingName: 'Wikipedia',
    })
  })

  it('throws unreachable for input that yields no candidates', async () => {
    stubFetch({})
    await expect(probeWiki('http://')).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('sends origin=* so the request can pass CORS', async () => {
    const requested = stubFetch({ 'https://minecraft.wiki/api.php': mcResponse })
    await probeWiki('minecraft.wiki')
    expect(decodeURIComponent(requested()[0]!)).toContain('origin=*')
  })

  it('is a ProbeError, so callers can switch on kind', async () => {
    stubFetch({})
    await expect(probeWiki('nowhere.example')).rejects.toBeInstanceOf(ProbeError)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/wiki/probeWiki.test.ts`
Expected: FAIL — `ProbeError` and `probeWiki` are not exported.

- [ ] **Step 3: Implement the networked shell**

Append to `src/wiki/probeWiki.ts`, and add the catalogue import at the top:

```ts
import { findSiteByApiUrl } from './catalogue.ts'
```

```ts
export type ProbeFailureKind = 'unreachable' | 'not-mediawiki' | 'duplicate'

export class ProbeError extends Error {
  readonly kind: ProbeFailureKind
  /** Set when `kind` is 'duplicate': the wiki already in the list. */
  readonly existingName?: string

  constructor(kind: ProbeFailureKind, message: string, existingName?: string) {
    super(message)
    this.name = 'ProbeError'
    this.kind = kind
    this.existingName = existingName
  }
}

const SITE_INFO_QUERY =
  '?action=query&format=json&formatversion=2&origin=*&meta=siteinfo&siprop=general%7Cextensions'

/** Returns the parsed body, or undefined if the endpoint could not be read. */
async function fetchSiteInfo(apiUrl: string): Promise<SiteInfoResponse | undefined> {
  try {
    const response = await fetch(`${apiUrl}${SITE_INFO_QUERY}`)
    if (!response.ok) return undefined
    return (await response.json()) as SiteInfoResponse
  } catch {
    // A CORS refusal and an unreachable host are indistinguishable here: fetch
    // rejects with a bare TypeError in both cases.
    return undefined
  }
}

/**
 * Discovers and validates a MediaWiki endpoint from user-entered text.
 *
 * Throws a ProbeError whose `kind` tells the caller which message to show.
 */
export async function probeWiki(input: string): Promise<ProbedWiki> {
  let anyResponded = false

  for (const candidate of candidateApiUrls(input)) {
    const response = await fetchSiteInfo(candidate)
    if (!response) continue

    anyResponded = true
    const probed = parseSiteInfo(candidate, response)
    if (!probed) continue

    const existing = findSiteByApiUrl(probed.apiUrl)
    if (existing) {
      throw new ProbeError(
        'duplicate',
        `${existing.family.name} is already in your list`,
        existing.family.name,
      )
    }

    return probed
  }

  if (anyResponded) {
    throw new ProbeError('not-mediawiki', "That address doesn't look like a MediaWiki site")
  }

  throw new ProbeError(
    'unreachable',
    "Couldn't reach this wiki. It may not exist, or it may not allow other apps to read it",
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/probeWiki.test.ts`
Expected: PASS, 41 tests.

- [ ] **Step 5: Verify and report**

Run: `npx vitest run && npx tsc -b`
Expected: all pass, type check clean. Do not commit.

---

### Task 5: Adding a wiki from the search field

**Files:**
- Modify: `src/routes/WikisRoute.tsx`, `src/routes/WikisRoute.module.css`

**Interfaces:**
- Consumes: `looksLikeUrl`, `probeWiki`, `toFamily`, `ProbeError` from `src/wiki/probeWiki.ts`; `addCustomWiki` from `src/wiki/customWikis.ts`; `followStore`; `makeSiteId` from `src/wiki/catalogue.ts`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the styles**

Append to `src/routes/WikisRoute.module.css`:

```css
.addRow {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1.25rem;
  text-align: left;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}

.addRow:active {
  background: var(--border);
}

.addLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addHint {
  color: var(--muted);
  font-size: 0.8rem;
}

.addError {
  padding: 0.75rem 1.25rem;
  color: var(--text);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.confirm {
  padding: 0.9rem 1.25rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.confirmField {
  display: block;
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem 0.75rem;
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
}

.confirmActions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.primary {
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
}

.secondary {
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
}

.textOnly {
  margin-top: 0.4rem;
  color: var(--muted);
  font-size: 0.8rem;
}
```

- [ ] **Step 2: Replace the wikis route**

Replace `src/routes/WikisRoute.tsx`:

```tsx
import { For, Match, Show, Switch, createSignal } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore } from '../feed/followStore.ts'
import { makeSiteId, searchFamilies } from '../wiki/catalogue.ts'
import { addCustomWiki } from '../wiki/customWikis.ts'
import { ProbeError, looksLikeUrl, probeWiki, toFamily } from '../wiki/probeWiki.ts'
import type { ProbedWiki } from '../wiki/probeWiki.ts'
import styles from './WikisRoute.module.css'

type AddState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'confirm'; probed: ProbedWiki }
  | { phase: 'error'; message: string }

export default function WikisRoute() {
  const navigate = useNavigate()
  const [query, setQuery] = createSignal('')
  const [addState, setAddState] = createSignal<AddState>({ phase: 'idle' })
  const [draftName, setDraftName] = createSignal('')

  /** Narrowing helpers, so each Match can hand its child a typed value. */
  const errorMessage = () => {
    const state = addState()
    return state.phase === 'error' ? state.message : undefined
  }
  const confirmable = () => {
    const state = addState()
    return state.phase === 'confirm' ? state.probed : undefined
  }

  /** Reset the add row whenever the query changes, so stale results never show. */
  function onQueryInput(value: string) {
    setQuery(value)
    setAddState({ phase: 'idle' })
  }

  async function check() {
    setAddState({ phase: 'checking' })
    try {
      const probed = await probeWiki(query())
      setDraftName(probed.sitename)
      setAddState({ phase: 'confirm', probed })
    } catch (cause) {
      const message =
        cause instanceof ProbeError ? cause.message : 'Something went wrong checking that address'
      setAddState({ phase: 'error', message })
    }
  }

  function confirmAdd(probed: ProbedWiki) {
    const family = toFamily(probed, draftName())
    addCustomWiki(family)
    followStore.follow(makeSiteId(family.id, family.sites[0]!.lang))
    setQuery('')
    setAddState({ phase: 'idle' })
  }

  return (
    <>
      <AppBar title="Wikis" leading="back" onLeadingClick={() => navigate('/settings')} />

      <div class={styles.page}>
        <div class={styles.sectionLabel}>Following · {followStore.followedSiteIds().length}</div>

        <Show
          when={followStore.followedFamilies().length > 0}
          fallback={<p class={styles.empty}>Not following anything yet.</p>}
        >
          <For each={followStore.followedFamilies()}>
            {(group) => (
              <A href={`/settings/wikis/${group.family.id}`} class={styles.card}>
                <div class={styles.cardHead}>
                  <span>{group.family.name}</span>
                  <span class={styles.count}>{group.sites.length} ›</span>
                </div>
                <div class={styles.chips}>
                  <For each={group.sites}>
                    {(site) => (
                      <span class={styles.chip}>
                        {site.name}
                        <button
                          type="button"
                          aria-label={`Unfollow ${group.family.name} ${site.english}`}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            followStore.unfollow(makeSiteId(group.family.id, site.lang))
                          }}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </A>
            )}
          </For>
        </Show>

        <div class={styles.sectionLabel}>Add a wiki</div>

        <input
          class={styles.search}
          type="search"
          placeholder="Search or add by URL…"
          value={query()}
          onInput={(event) => onQueryInput(event.currentTarget.value)}
        />

        <Show when={looksLikeUrl(query())}>
          <Switch>
            <Match when={addState().phase === 'idle'}>
              <button type="button" class={styles.addRow} onClick={() => void check()}>
                <span class={styles.addLabel}>Add {query().trim()}</span>
                <span class={styles.addHint}>+</span>
              </button>
            </Match>

            <Match when={addState().phase === 'checking'}>
              <div class={styles.addRow}>
                <span class={styles.addLabel}>Checking {query().trim()}…</span>
              </div>
            </Match>

            {/*
              `when` yields the value rather than a boolean, so the child
              receives a typed accessor. Passing a boolean and casting
              `addState()` inside the child would re-read the signal and defeat
              the narrowing.
            */}
            <Match when={errorMessage()}>
              {(message) => (
                <div class={styles.addError}>
                  <p>{message()}</p>
                  <div class={styles.confirmActions}>
                    <button type="button" class={styles.secondary} onClick={() => void check()}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </Match>

            <Match when={confirmable()}>
              {(probed) => (
                <div class={styles.confirm}>
                  <label class={styles.addHint} for="custom-wiki-name">
                    Name
                  </label>
                  <input
                    id="custom-wiki-name"
                    class={styles.confirmField}
                    value={draftName()}
                    onInput={(event) => setDraftName(event.currentTarget.value)}
                  />
                  <div class={styles.addHint}>
                    {probed().domain} · {probed().lang}
                  </div>
                  <Show when={!probed().capabilities.pageImages}>
                    <p class={styles.textOnly}>
                      This wiki provides no images, so its articles stay hidden until the
                      "show imageless articles" setting exists.
                    </p>
                  </Show>
                  <div class={styles.confirmActions}>
                    <button
                      type="button"
                      class={styles.primary}
                      onClick={() => confirmAdd(probed())}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      class={styles.secondary}
                      onClick={() => setAddState({ phase: 'idle' })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Match>
          </Switch>
        </Show>

        <For
          each={searchFamilies(query())}
          fallback={<Show when={!looksLikeUrl(query())}>
            <p class={styles.empty}>No wikis match that.</p>
          </Show>}
        >
          {(family) => (
            <A href={`/settings/wikis/${family.id}`} class={styles.card}>
              <div class={styles.cardHead}>
                <span>{family.name}</span>
                <span class={styles.count}>{family.sites.length} languages ›</span>
              </div>
            </A>
          )}
        </For>
      </div>
    </>
  )
}
```

The "No wikis match that" fallback is suppressed while the query looks like a
URL — otherwise typing an address would show a failure message directly beneath
the add option that is about to succeed.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`

Confirm by hand:
1. Typing `quote` filters to Wikiquote and shows **no** add row.
2. Typing `minecraft.wiki` shows an **Add minecraft.wiki** row under the search box.
3. Tapping it shows "Checking…", then a confirm panel with the name pre-filled **Minecraft Wiki** and `minecraft.wiki · en` beneath.
4. Tapping **Add** clears the search, and Minecraft Wiki appears under *Following* with one chip.
5. Typing `minecraft.wiki` again and tapping Add gives "Minecraft Wiki is already in your list".
6. Typing `en.wikipedia.org` and tapping Add gives "Wikipedia is already in your list".
7. Typing `nowhere.example` gives the "Couldn't reach this wiki…" message with a **Try again** button.
8. Typing `wiki.openstreetmap.org` succeeds and shows the "provides no images" note.

Run: `npx vitest run && npx tsc -b`
Expected: pass and clean. Do not commit.

---

### Task 6: Removing a custom wiki

**Files:**
- Modify: `src/routes/LanguagePickerRoute.tsx`, `src/routes/LanguagePickerRoute.module.css`
- Test: `src/wiki/customWikis.test.ts` (add the unfollow-on-remove case)

**Interfaces:**
- Consumes: `removeCustomWiki` from `src/wiki/customWikis.ts`; `followStore`; `findFamily`, `makeSiteId` from `src/wiki/catalogue.ts`
- Produces:
  - `function removeCustomWikiAndUnfollow(familyId: string): void` in `src/feed/followStore.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/wiki/customWikis.test.ts`:

```ts
import { removeCustomWikiAndUnfollow } from '../feed/followStore.ts'
import { followStore } from '../feed/followStore.ts'

describe('removeCustomWikiAndUnfollow', () => {
  it('removes the wiki and unfollows its site', () => {
    addCustomWiki(family())
    followStore.follow('custom-abcd1234:en')
    expect(followStore.isFollowed('custom-abcd1234:en')).toBe(true)

    removeCustomWikiAndUnfollow('custom-abcd1234')

    expect(customWikis()).toEqual([])
    // A followed site pointing at a family that no longer exists would be
    // dropped on next load anyway, but leaving it is a bug in the meantime.
    expect(followStore.isFollowed('custom-abcd1234:en')).toBe(false)
  })

  it('is safe to call for an unknown family', () => {
    expect(() => removeCustomWikiAndUnfollow('custom-nothere')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wiki/customWikis.test.ts`
Expected: FAIL — `removeCustomWikiAndUnfollow` is not exported.

- [ ] **Step 3: Implement the combined removal**

Append to `src/feed/followStore.ts`:

```ts
import { findFamily, makeSiteId } from '../wiki/catalogue.ts'
import { removeCustomWiki } from '../wiki/customWikis.ts'
```

```ts
/**
 * Removes a custom wiki and unfollows every site it contributed.
 *
 * Unfollowing first matters: a followed site id pointing at a family that no
 * longer exists would linger in storage until the next defensive read.
 */
export function removeCustomWikiAndUnfollow(familyId: string): void {
  const family = findFamily(familyId)
  if (family) {
    for (const site of family.sites) {
      followStore.unfollow(makeSiteId(familyId, site.lang))
    }
  }
  removeCustomWiki(familyId)
}
```

This lives in `followStore.ts` rather than `customWikis.ts` because
`customWikis.ts` must not import the catalogue — `catalogue.ts` imports it, and
the cycle would close.

- [ ] **Step 4: Add the remove control to the picker**

Append to `src/routes/LanguagePickerRoute.module.css`:

```css
.removeBar {
  padding: 1.5rem 1.25rem 0;
}

.remove {
  padding: 0.5rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
}
```

In `src/routes/LanguagePickerRoute.tsx`, add the imports:

```tsx
import { removeCustomWikiAndUnfollow } from '../feed/followStore.ts'
```

and inside the `<div class={styles.page}>`, after the `<For>` over sites:

```tsx
            <Show when={found().custom}>
              <div class={styles.removeBar}>
                <button
                  type="button"
                  class={styles.remove}
                  onClick={() => {
                    removeCustomWikiAndUnfollow(found().id)
                    navigate('/settings/wikis')
                  }}
                >
                  Remove this wiki
                </button>
              </div>
            </Show>
```

Only custom families show this; bundled ones cannot be removed.

**A deliberate narrowing of the spec.** The design doc offers Remove both here
and on the wiki's row in the catalogue list. The catalogue row is an `<A>` whose
whole area navigates, so a second control inside it needs the same
`preventDefault`/`stopPropagation` dance as the unfollow chips — for a
destructive action reachable one tap away on this screen. One entry point is
enough; if it proves inconvenient in use, add the second then.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/wiki/customWikis.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`

Confirm by hand:
1. Add `minecraft.wiki`, then open it from the Following list.
2. The picker shows one language row and a **Remove this wiki** button.
3. Tapping Remove returns to the wikis screen; the wiki is gone from both
   *Following* and *Add a wiki*.
4. Open Wikipedia's picker — **no** Remove button.

Run: `npx vitest run && npx tsc -b`
Expected: pass and clean. Do not commit.

---

### Task 7: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Document custom wikis in the README**

In `README.md`, inside the **Architecture** list, after the catalogue bullet:

```markdown
- **Add any MediaWiki by URL** from the wikis screen's search field. The app
  probes the address for its `api.php`, confirms it is MediaWiki, reads its
  name and language, and records whether it has the `TextExtracts` and
  `PageImages` extensions. User-added wikis live in localStorage under
  `wiki-scroll.customWikis.v1`, not in `catalogue.json`.
- **One URL is one wiki.** MediaWiki offers no reliable way to enumerate a
  site's sibling language editions, so `es.example.org` and `en.example.org`
  are added separately. The reasoning is in the custom-wikis design doc.
```

- [ ] **Step 2: Mark the backlog item**

In `docs/BACKLOG.md`, add under the **Core-API fallback** section a line noting
it now also affects user-added wikis:

```markdown
**Now more valuable:** users can add arbitrary wikis by URL, and three of the
five real third-party wikis measured have neither extension. Without this
fallback a good share of what people add will be text-only.
```

- [ ] **Step 3: Full verification**

Run: `npx vitest run`
Expected: whole suite passes; only the live checks are skipped.

Run: `npx tsc -b`
Expected: clean.

Run: `npm run build`
Expected: exits 0. Report the bundle size.

- [ ] **Step 4: End-to-end check on the built app**

Run: `npm run preview` and walk the flow once:

1. Add `minecraft.wiki` by URL; it is followed automatically.
2. Return to the feed — it resets and now includes Minecraft Wiki articles.
3. Open one; the URL is `/article/custom-<hash>/en/<title>` and the article renders.
4. Go back, remove the wiki, and confirm the feed resets again.

- [ ] **Step 5: Report**

Report the final test count, bundle size, and every file created or modified.
The user reviews and commits.
