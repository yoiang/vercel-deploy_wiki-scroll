import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from 'solid-js'
import { A } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import ArticleCard from '../components/ArticleCard.tsx'
import Drawer from '../components/Drawer.tsx'
import { feedStore } from '../feed/activeFeedStore.ts'
import { followStore } from '../feed/followStore.ts'
import { findSite } from '../wiki/catalogue.ts'
import styles from './FeedRoute.module.css'

export default function FeedRoute() {
  const [menuOpen, setMenuOpen] = createSignal(false)
  let sentinel: HTMLDivElement | undefined

  /** "Wikipedia (Japanese)" reads better in a warning than "wikipedia:ja". */
  const degraded = () =>
    feedStore.sourceErrors().map(({ siteId }) => {
      const found = findSite(siteId)
      return found ? `${found.family.name} (${found.site.english})` : siteId
    })

  onMount(() => {
    // Restore the scroll position from before the user opened an article.
    // The store already holds the items, so there is nothing to wait for.
    window.scrollTo(0, feedStore.scrollOffset())

    const onScroll = () => feedStore.setScrollOffset(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    onCleanup(() => window.removeEventListener('scroll', onScroll))

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void feedStore.loadMore()
      },
      { rootMargin: '600px' },
    )
    if (sentinel) observer.observe(sentinel)
    onCleanup(() => observer.disconnect())

    // Following nothing is a valid state; loading would spin forever.
    if (feedStore.items().length === 0 && followStore.followedSiteIds().length > 0) {
      void feedStore.loadMore()
    }
  })

  return (
    <>
      <AppBar title="Wiki Scroll" leading="menu" onLeadingClick={() => setMenuOpen(true)} />
      <Drawer open={menuOpen()} onClose={() => setMenuOpen(false)} />

      <main class={styles.feed}>
        <Show when={degraded().length > 0}>
          <p class={styles.notice}>Couldn't reach {degraded().join(', ')}.</p>
        </Show>

        <Show when={followStore.followedSiteIds().length === 0}>
          <div class={styles.emptyState}>
            <p>You're not following any wikis.</p>
            <A href="/settings/wikis" class={styles.emptyAction}>
              Choose some wikis
            </A>
          </div>
        </Show>

        <For each={feedStore.items()}>{(item) => <ArticleCard item={item} />}</For>

        <div ref={sentinel} class={styles.sentinel} />

        <Switch>
          <Match when={feedStore.status() === 'loading'}>
            <p class={styles.status}>Loading…</p>
          </Match>
          <Match when={feedStore.status() === 'error'}>
            <div class={styles.status}>
              <p>Couldn't load more articles.</p>
              <button type="button" class={styles.retry} onClick={() => void feedStore.retry()}>
                Try again
              </button>
            </div>
          </Match>
          <Match when={feedStore.status() === 'exhausted'}>
            <p class={styles.status}>That's everything.</p>
          </Match>
        </Switch>
      </main>
    </>
  )
}
