import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FOLLOWED, STORAGE_KEY, createFollowStore } from './followStore.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('createFollowStore', () => {
  it('defaults to English Wikipedia on first run', () => {
    expect(createFollowStore().followedSiteIds()).toEqual(DEFAULT_FOLLOWED)
  })

  it('restores what was stored', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['wikipedia:de', 'wiktionary:fr']))
    expect(createFollowStore().followedSiteIds()).toEqual(['wikipedia:de', 'wiktionary:fr'])
  })

  it('persists a follow', () => {
    const store = createFollowStore()
    store.follow('wikipedia:ja')
    expect(createFollowStore().followedSiteIds()).toContain('wikipedia:ja')
  })

  it('persists an unfollow', () => {
    const store = createFollowStore()
    store.follow('wikipedia:ja')
    store.unfollow('wikipedia:en')
    expect(createFollowStore().followedSiteIds()).toEqual(['wikipedia:ja'])
  })

  it('ignores a duplicate follow', () => {
    const store = createFollowStore()
    store.follow('wikipedia:ja')
    store.follow('wikipedia:ja')
    expect(store.followedSiteIds().filter((id) => id === 'wikipedia:ja')).toHaveLength(1)
  })

  it('refuses to follow a site that is not in the catalogue', () => {
    const store = createFollowStore()
    store.follow('nosuchwiki:en')
    expect(store.followedSiteIds()).not.toContain('nosuchwiki:en')
  })

  it('reports whether a site is followed', () => {
    const store = createFollowStore()
    expect(store.isFollowed('wikipedia:en')).toBe(true)
    expect(store.isFollowed('wikipedia:ja')).toBe(false)
  })

  it('allows unfollowing everything', () => {
    const store = createFollowStore()
    store.unfollow('wikipedia:en')
    expect(store.followedSiteIds()).toEqual([])
  })

  describe('defensive reads', () => {
    it('falls back to the default when the stored value is not JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not json at all')
      expect(createFollowStore().followedSiteIds()).toEqual(DEFAULT_FOLLOWED)
    })

    it('falls back to the default when the stored value is not an array', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ wikipedia: true }))
      expect(createFollowStore().followedSiteIds()).toEqual(DEFAULT_FOLLOWED)
    })

    it('drops stored ids that are no longer in the catalogue', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['wikipedia:en', 'retired:xx']))
      expect(createFollowStore().followedSiteIds()).toEqual(['wikipedia:en'])
    })

    it('drops non-string entries', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['wikipedia:en', 42, null]))
      expect(createFollowStore().followedSiteIds()).toEqual(['wikipedia:en'])
    })

    it('keeps an explicitly empty selection rather than resurrecting the default', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
      expect(createFollowStore().followedSiteIds()).toEqual([])
    })
  })

  describe('grouping', () => {
    it('lists followed sites of one family', () => {
      const store = createFollowStore()
      store.follow('wikipedia:ja')
      expect(
        store
          .followedSitesOf('wikipedia')
          .map((s) => s.lang)
          .sort(),
      ).toEqual(['en', 'ja'])
    })

    it('returns nothing for a family with no follows', () => {
      expect(createFollowStore().followedSitesOf('wikiquote')).toEqual([])
    })

    it('groups followed sites by family, in catalogue order', () => {
      const store = createFollowStore()
      store.follow('wiktionary:fr')
      const grouped = store.followedFamilies()
      expect(grouped.map((g) => g.family.id)).toEqual(['wikipedia', 'wiktionary'])
      expect(grouped[1]!.sites.map((s) => s.lang)).toEqual(['fr'])
    })

    it('omits families with no followed sites', () => {
      expect(createFollowStore().followedFamilies().map((g) => g.family.id)).toEqual(['wikipedia'])
    })
  })

  describe('change notification', () => {
    it('notifies listeners on follow', () => {
      const store = createFollowStore()
      const listener = vi.fn()
      store.onChange(listener)
      store.follow('wikipedia:ja')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('notifies listeners on unfollow', () => {
      const store = createFollowStore()
      const listener = vi.fn()
      store.onChange(listener)
      store.unfollow('wikipedia:en')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('does not notify when nothing changed', () => {
      const store = createFollowStore()
      const listener = vi.fn()
      store.onChange(listener)
      store.unfollow('wikipedia:ja')
      expect(listener).not.toHaveBeenCalled()
    })

    it('stops notifying after unsubscribe', () => {
      const store = createFollowStore()
      const listener = vi.fn()
      store.onChange(listener)()
      store.follow('wikipedia:ja')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
