import { createSignal } from 'solid-js'
import { families, findSite } from '../wiki/catalogue.ts'
import type { WikiFamily, WikiSite } from '../wiki/catalogueTypes.ts'

export const STORAGE_KEY = 'wiki-scroll.following.v1'

/** So the app shows something on first launch rather than an empty feed. */
export const DEFAULT_FOLLOWED = ['wikipedia:en']

export interface FollowStore {
  followedSiteIds: () => string[]
  isFollowed: (siteId: string) => boolean
  follow: (siteId: string) => void
  unfollow: (siteId: string) => void
  followedSitesOf: (familyId: string) => WikiSite[]
  followedFamilies: () => Array<{ family: WikiFamily; sites: WikiSite[] }>
  /** Returns an unsubscribe function. */
  onChange: (listener: () => void) => () => void
}

/**
 * Reads the stored selection defensively. A corrupt value must never stop the
 * app from starting, and ids for sites that have left the catalogue are
 * dropped rather than carried around as dead weight.
 */
function readStored(): string[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return [...DEFAULT_FOLLOWED]
  }

  if (raw === null) return [...DEFAULT_FOLLOWED]

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [...DEFAULT_FOLLOWED]
  }

  if (!Array.isArray(parsed)) return [...DEFAULT_FOLLOWED]

  // An empty array is a real choice — the reader unfollowed everything — and
  // must not be overwritten with the default.
  return parsed.filter(
    (entry): entry is string => typeof entry === 'string' && findSite(entry) !== undefined,
  )
}

function writeStored(siteIds: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(siteIds))
  } catch {
    // A full or unavailable quota must not break following a wiki; the
    // selection simply will not survive a relaunch.
  }
}

export function createFollowStore(): FollowStore {
  const [siteIds, setSiteIds] = createSignal<string[]>(readStored())
  const listeners = new Set<() => void>()

  function commit(next: string[]): void {
    setSiteIds(next)
    writeStored(next)
    for (const listener of listeners) listener()
  }

  return {
    followedSiteIds: siteIds,

    isFollowed: (siteId) => siteIds().includes(siteId),

    follow(siteId) {
      if (siteIds().includes(siteId)) return
      if (!findSite(siteId)) return
      commit([...siteIds(), siteId])
    },

    unfollow(siteId) {
      if (!siteIds().includes(siteId)) return
      commit(siteIds().filter((id) => id !== siteId))
    },

    followedSitesOf(familyId) {
      return siteIds()
        .map((id) => findSite(id))
        .filter((found) => found?.family.id === familyId)
        .map((found) => found!.site)
    },

    followedFamilies() {
      const followed = siteIds()
      return families()
        .map((family) => ({
          family,
          sites: followed
            .map((id) => findSite(id))
            .filter((found) => found?.family.id === family.id)
            .map((found) => found!.site),
        }))
        .filter((group) => group.sites.length > 0)
    },

    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The app's one follow store. */
export const followStore = createFollowStore()
