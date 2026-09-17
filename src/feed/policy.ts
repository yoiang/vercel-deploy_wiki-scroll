import type { FeedItem } from '../wiki/types.ts'

/**
 * Decides which items may enter the feed.
 *
 * This indirection exists for planned features: a settings toggle will swap
 * `requireImage` for `acceptAll`, and generated images will become a transform
 * stage applied before `accept` is consulted. Neither change touches feedStore.
 */
export interface FeedPolicy {
  accept(item: FeedItem): boolean
}

/**
 * V1 default. Roughly half of recently-edited articles have no thumbnail;
 * skipping them keeps the feed's visual rhythm consistent.
 */
export const requireImage: FeedPolicy = {
  accept: (item) => item.image !== undefined,
}

/** Lets every item through. Wired to a settings toggle in a later iteration. */
export const acceptAll: FeedPolicy = {
  accept: () => true,
}
