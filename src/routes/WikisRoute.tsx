import { For, Match, Show, Switch, createSignal } from 'solid-js'
import { A, useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore } from '../feed/followStore.ts'
import { makeSiteId, searchFamilies } from '../wiki/catalogue.ts'
import { addCustomWiki } from '../wiki/customWikis.ts'
import { ProbeError, looksLikeUrl, probeWiki, toFamily } from '../wiki/probeWiki.ts'
import type { ProbedWiki } from '../wiki/probeWiki.ts'
import styles from './WikisRoute.module.css'

type AddState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'confirm'; probed: ProbedWiki }
  | { phase: 'error'; message: string }

export default function WikisRoute() {
  const navigate = useNavigate()
  const [query, setQuery] = createSignal('')
  const [addState, setAddState] = createSignal<AddState>({ phase: 'idle' })
  const [draftName, setDraftName] = createSignal('')

  /** Narrowing helpers, so each Match can hand its child a typed value. */
  const errorMessage = () => {
    const state = addState()
    return state.phase === 'error' ? state.message : undefined
  }
  const confirmable = () => {
    const state = addState()
    return state.phase === 'confirm' ? state.probed : undefined
  }

  /** Reset the add row whenever the query changes, so stale results never show. */
  function onQueryInput(value: string) {
    setQuery(value)
    setAddState({ phase: 'idle' })
  }

  async function check() {
    setAddState({ phase: 'checking' })
    try {
      const probed = await probeWiki(query())
      setDraftName(probed.sitename)
      setAddState({ phase: 'confirm', probed })
    } catch (cause) {
      const message =
        cause instanceof ProbeError ? cause.message : 'Something went wrong checking that address'
      setAddState({ phase: 'error', message })
    }
  }

  function confirmAdd(probed: ProbedWiki) {
    const family = toFamily(probed, draftName())
    addCustomWiki(family)
    followStore.follow(makeSiteId(family.id, family.sites[0]!.lang))
    setQuery('')
    setAddState({ phase: 'idle' })
  }

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
          placeholder="Search or add by URL…"
          value={query()}
          onInput={(event) => onQueryInput(event.currentTarget.value)}
        />

        <Show when={looksLikeUrl(query())}>
          <Switch>
            <Match when={addState().phase === 'idle'}>
              <button type="button" class={styles.addRow} onClick={() => void check()}>
                <span class={styles.addLabel}>Add {query().trim()}</span>
                <span class={styles.addHint}>+</span>
              </button>
            </Match>

            <Match when={addState().phase === 'checking'}>
              <div class={styles.addRow}>
                <span class={styles.addLabel}>Checking {query().trim()}…</span>
              </div>
            </Match>

            {/*
              `when` yields the value rather than a boolean, so the child
              receives a typed accessor. Passing a boolean and casting
              `addState()` inside the child would re-read the signal and defeat
              the narrowing.
            */}
            <Match when={errorMessage()}>
              {(message) => (
                <div class={styles.addError}>
                  <p>{message()}</p>
                  <div class={styles.confirmActions}>
                    <button type="button" class={styles.secondary} onClick={() => void check()}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </Match>

            <Match when={confirmable()}>
              {(probed) => (
                <div class={styles.confirm}>
                  <label class={styles.addHint} for="custom-wiki-name">
                    Name
                  </label>
                  <input
                    id="custom-wiki-name"
                    class={styles.confirmField}
                    value={draftName()}
                    onInput={(event) => setDraftName(event.currentTarget.value)}
                  />
                  <div class={styles.addHint}>
                    {probed().domain} · {probed().lang}
                  </div>
                  <Show when={!probed().capabilities.pageImages}>
                    <p class={styles.textOnly}>
                      This wiki provides no images, so its articles stay hidden until the "show
                      imageless articles" setting exists.
                    </p>
                  </Show>
                  <div class={styles.confirmActions}>
                    <button type="button" class={styles.primary} onClick={() => confirmAdd(probed())}>
                      Add
                    </button>
                    <button
                      type="button"
                      class={styles.secondary}
                      onClick={() => setAddState({ phase: 'idle' })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </Match>
          </Switch>
        </Show>

        <For
          each={searchFamilies(query())}
          fallback={
            <Show when={!looksLikeUrl(query())}>
              <p class={styles.empty}>No wikis match that.</p>
            </Show>
          }
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
