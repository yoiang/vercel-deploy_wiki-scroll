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
