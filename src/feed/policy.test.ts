import { describe, expect, it } from 'vitest'
import { acceptAll, requireImage } from './policy.ts'
import type { FeedItem } from '../wiki/types.ts'

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'wikipedia-en:1',
    pageId: 1,
    title: 'Test',
    updatedAt: new Date('2026-09-17T10:00:00Z'),
    summary: 'A summary.',
    image: { url: 'https://example.org/a.jpg', width: 800, height: 600 },
    ...overrides,
  }
}

describe('requireImage', () => {
  it('accepts an item with an image', () => {
    expect(requireImage.accept(item())).toBe(true)
  })

  it('rejects an item with no image', () => {
    expect(requireImage.accept(item({ image: undefined }))).toBe(false)
  })
})

describe('acceptAll', () => {
  it('accepts an item with an image', () => {
    expect(acceptAll.accept(item())).toBe(true)
  })

  it('accepts an item with no image', () => {
    expect(acceptAll.accept(item({ image: undefined }))).toBe(true)
  })
})
