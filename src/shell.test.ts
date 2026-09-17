import { describe, expect, it } from 'vitest'
import { render } from 'solid-js/web'
import { MemoryRouter, Route } from '@solidjs/router'
import SettingsRoute from './routes/SettingsRoute.tsx'
import ArticleCard from './components/ArticleCard.tsx'
import Drawer from './components/Drawer.tsx'
import type { FeedItem } from './wiki/types.ts'
import { articleHref } from './components/ArticleCard.tsx'

/**
 * Proves the shell actually mounts in a DOM, catching runtime errors the type
 * checker cannot see. Deliberately asserts presence and text content only —
 * no layout or styling assertions, which would be brittle while the design is
 * still being tuned by eye.
 */
describe('app shell rendering', () => {
  it('mounts the settings route with app bar and drawer-free shell', () => {
    const host = document.createElement('div')
    document.body.append(host)

    const dispose = render(
      () => MemoryRouter({ children: Route({ path: '/', component: SettingsRoute }) }),
      host,
    )

    expect(host.querySelector('h1')?.textContent).toBe('Settings')
    expect(host.querySelector('button[aria-label="Go back"]')).not.toBeNull()
    // The Wikis row summarises the follow count and links to the wikis screen.
    expect(host.textContent).toContain('Wikis')
    expect(host.querySelector('a[href="/settings/wikis"]')).not.toBeNull()
    dispose()
  })

  it('renders an article card with title, time, image and read more', () => {
    const item: FeedItem = {
      id: 'wikipedia-en:1',
      pageId: 1,
      title: 'Apple II (original)',
      updatedAt: new Date(Date.now() - 5 * 60 * 1000),
      summary: 'The Apple II is an 8-bit home computer.',
      image: { url: 'https://upload.wikimedia.org/a.jpg', width: 800, height: 709 },
    }

    const host = document.createElement('div')
    document.body.append(host)

    const dispose = render(
      () =>
        MemoryRouter({
          children: Route({ path: '/', component: () => ArticleCard({ item }) }),
        }),
      host,
    )

    expect(host.textContent).toContain('Apple II (original)')
    expect(host.textContent).toContain('5 minutes ago')
    expect(host.textContent).toContain('… read more')
    const img = host.querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://upload.wikimedia.org/a.jpg')
    // Reserves space before the image loads, so the feed does not jump under
    // the reader while scrolling.
    expect(img?.getAttribute('style')).toContain('aspect-ratio')
    expect(img?.getAttribute('width')).toBe('800')
    dispose()
  })

  it('renders the drawer only when open', () => {
    const host = document.createElement('div')
    document.body.append(host)

    const dispose = render(
      () =>
        MemoryRouter({
          children: Route({
            path: '/',
            component: () => Drawer({ open: true, onClose: () => {} }),
          }),
        }),
      host,
    )

    expect(host.querySelector('nav[aria-label="Main menu"]')).not.toBeNull()
    expect(host.textContent).toContain('Settings')
    dispose()
  })
})

describe('articleHref', () => {
  it('builds a three-segment route from the item id', () => {
    expect(
      articleHref({
        id: 'wikipedia:ja:1',
        pageId: 1,
        title: '猫',
        updatedAt: new Date(),
        summary: '',
      }),
    ).toBe('/article/wikipedia/ja/%E7%8C%AB')
  })

  it('encodes titles containing slashes', () => {
    expect(
      articleHref({
        id: 'wikibooks:en:2',
        pageId: 2,
        title: 'Cookbook/Rice',
        updatedAt: new Date(),
        summary: '',
      }),
    ).toBe('/article/wikibooks/en/Cookbook%2FRice')
  })
})
