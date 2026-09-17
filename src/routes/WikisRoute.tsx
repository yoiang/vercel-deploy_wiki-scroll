import { For, Show, createSignal } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore } from '../feed/followStore.ts'
import { makeSiteId, searchFamilies } from '../wiki/catalogue.ts'
import styles from './WikisRoute.module.css'

export default function WikisRoute() {
  const navigate = useNavigate()
  const [query, setQuery] = createSignal('')

  return (
    <>
      <AppBar title="Wikis" leading="back" onLeadingClick={() => navigate('/settings')} />

      <div class={styles.page}>
        <div class={styles.sectionLabel}>Following · {followStore.followedSiteIds().length}</div>

        <Show
          when={followStore.followedFamilies().length > 0}
          fallback={<p class={styles.empty}>Not following anything yet.</p>}
        >
          <For each={followStore.followedFamilies()}>
            {(group) => (
              <A href={`/settings/wikis/${group.family.id}`} class={styles.card}>
                <div class={styles.cardHead}>
                  <span>{group.family.name}</span>
                  <span class={styles.count}>{group.sites.length} ›</span>
                </div>
                <div class={styles.chips}>
                  <For each={group.sites}>
                    {(site) => (
                      <span class={styles.chip}>
                        {site.name}
                        <button
                          type="button"
                          aria-label={`Unfollow ${group.family.name} ${site.english}`}
                          onClick={(event) => {
                            // The chip sits inside a link to the picker.
                            event.preventDefault()
                            event.stopPropagation()
                            followStore.unfollow(makeSiteId(group.family.id, site.lang))
                          }}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </A>
            )}
          </For>
        </Show>

        <div class={styles.sectionLabel}>Add a wiki</div>

        <input
          class={styles.search}
          type="search"
          placeholder="Search wikis…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />

        <For
          each={searchFamilies(query())}
          fallback={<p class={styles.empty}>No wikis match that.</p>}
        >
          {(family) => (
            <A href={`/settings/wikis/${family.id}`} class={styles.card}>
              <div class={styles.cardHead}>
                <span>{family.name}</span>
                <span class={styles.count}>{family.sites.length} languages ›</span>
              </div>
            </A>
          )}
        </For>
      </div>
    </>
  )
}
