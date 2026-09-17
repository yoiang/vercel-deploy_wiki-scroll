import { getActiveSource } from '../wiki/registry.ts'
import { createFeedStore } from './feedStore.ts'
import { requireImage } from './policy.ts'

/**
 * The app's one feed store. Being a module singleton is what makes the
 * in-memory cache work: navigating to an article and back re-mounts FeedRoute
 * against the same already-populated store, with no refetch.
 */
export const feedStore = createFeedStore(getActiveSource(), requireImage)
