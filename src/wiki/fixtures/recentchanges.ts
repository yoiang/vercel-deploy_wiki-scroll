import type { RecentChangesResponse } from '../mediawiki.ts'

/**
 * A real (trimmed) response from en.wikipedia.org. Deliberately preserves
 * three properties of live data:
 *   - pages arrive in page-ID order, NOT timestamp order
 *   - some pages have no thumbnail
 *   - some pages have a very short or absent extract
 */
export const recentChangesBatch: RecentChangesResponse = {
  query: {
    pages: [
      {
        pageid: 1,
        title: 'Apple II (original)',
        extract: 'The Apple II is an 8-bit home computer.',
        thumbnail: { source: 'https://upload.wikimedia.org/a.jpg', width: 800, height: 709 },
        revisions: [{ timestamp: '2026-09-17T10:53:50Z' }],
      },
      {
        pageid: 2,
        title: 'List of Toyota engines',
        extract: 'This is a list of engines.',
        revisions: [{ timestamp: '2026-09-17T10:53:55Z' }],
      },
      {
        pageid: 3,
        title: 'Commonwealth Law Reports',
        extract: 'The Commonwealth Law Reports are law reports.',
        thumbnail: { source: 'https://upload.wikimedia.org/c.jpg', width: 800, height: 602 },
        revisions: [{ timestamp: '2026-09-17T10:53:51Z' }],
      },
      {
        pageid: 4,
        title: 'Alec Smir',
        thumbnail: { source: 'https://upload.wikimedia.org/d.jpg', width: 403, height: 531 },
        revisions: [{ timestamp: '2026-09-17T10:53:49Z' }],
      },
    ],
  },
}
