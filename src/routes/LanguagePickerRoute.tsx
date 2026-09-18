import { For, Show, createMemo, createSignal } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore, removeCustomWikiAndUnfollow } from '../feed/followStore.ts'
import { findFamily, makeSiteId, searchSites } from '../wiki/catalogue.ts'
import styles from './LanguagePickerRoute.module.css'

export default function LanguagePickerRoute() {
  const params = useParams<{ familyId: string }>()
  const navigate = useNavigate()
  const [query, setQuery] = createSignal('')

  const family = () => findFamily(params.familyId)

  /** Followed languages first, so the current selection is never buried. */
  const sites = createMemo(() => {
    const found = family()
    if (!found) return []

    const matches = searchSites(found, query())
    const followed = matches.filter((site) =>
      followStore.isFollowed(makeSiteId(found.id, site.lang)),
    )
    const rest = matches.filter((site) => !followStore.isFollowed(makeSiteId(found.id, site.lang)))
    return [...followed, ...rest]
  })

  function toggle(lang: string) {
    const found = family()
    if (!found) return
    const siteId = makeSiteId(found.id, lang)
    if (followStore.isFollowed(siteId)) followStore.unfollow(siteId)
    else followStore.follow(siteId)
  }

  return (
    <>
      <AppBar
        title={family()?.name ?? 'Unknown wiki'}
        leading="back"
        onLeadingClick={() => navigate('/settings/wikis')}
      />

      <Show when={family()} fallback={<p class={styles.empty}>No such wiki.</p>}>
        {(found) => (
          <div class={styles.page}>
            <input
              class={styles.search}
              type="search"
              placeholder={`Search ${found().sites.length} languages…`}
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
            />

            <For each={sites()} fallback={<p class={styles.empty}>No languages match that.</p>}>
              {(site) => {
                const on = () => followStore.isFollowed(makeSiteId(found().id, site.lang))
                return (
                  <button
                    type="button"
                    class={styles.row}
                    role="checkbox"
                    aria-checked={on()}
                    onClick={() => toggle(site.lang)}
                  >
                    <span class={`${styles.box} ${on() ? styles.boxOn : ''}`}>
                      {on() ? '✓' : ''}
                    </span>
                    <span class={styles.names}>
                      {site.name}
                      <Show when={site.english !== site.name}>
                        <span class={styles.english}> · {site.english}</span>
                      </Show>
                    </span>
                    <span class={styles.code}>{site.lang}</span>
                  </button>
                )
              }}
            </For>

            <Show when={found().custom}>
              <div class={styles.removeBar}>
                <button
                  type="button"
                  class={styles.remove}
                  onClick={() => {
                    removeCustomWikiAndUnfollow(found().id)
                    navigate('/settings/wikis')
                  }}
                >
                  Remove this wiki
                </button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </>
  )
}
