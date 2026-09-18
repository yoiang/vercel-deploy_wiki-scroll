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
      {
        id: 'custom-y',
        name: 'Empty',
        type: 'mediawiki',
        apiUrl: 'https://e.org/api.php',
        sites: [],
      },
    ])
    expect(parseStoredCustomWikis(stored)).toEqual([])
  })

  it('keeps good entries alongside bad ones', () => {
    const stored = JSON.stringify([family(), { id: 'junk' }])
    expect(parseStoredCustomWikis(stored)).toHaveLength(1)
  })
})

import { followStore, removeCustomWikiAndUnfollow } from '../feed/followStore.ts'

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
