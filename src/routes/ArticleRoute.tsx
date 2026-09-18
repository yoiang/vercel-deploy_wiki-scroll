import { Match, Switch, createResource } from 'solid-js'
import { useLocation, useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import appBarStyles from '../components/AppBar.module.css'
import ArticleBody from '../components/ArticleBody.tsx'
import { makeSiteId } from '../wiki/catalogue.ts'
import { getSource } from '../wiki/sources.ts'
import styles from './ArticleRoute.module.css'

export default function ArticleRoute() {
  const params = useParams<{ familyId: string; lang: string; title: string }>()
  const location = useLocation<{ pageId?: number } | undefined>()
  const navigate = useNavigate()

  const title = () => decodeURIComponent(params.title)
  const siteId = () => makeSiteId(params.familyId, params.lang)

  const [article, { refetch }] = createResource(
    // Keyed on site and title, so tapping a link inside an article refetches
    // against the right wiki.
    () => ({ siteId: siteId(), title: title(), pageId: location.state?.pageId }),
    (ref) => getSource(ref.siteId).fetchArticle({ pageId: ref.pageId ?? 0, title: ref.title }),
  )

  /**
   * A real anchor rather than window.open: it is keyboard accessible, and
   * Capacitor's WebView sends target="_blank" anchors to the system browser,
   * where a scripted window.open can be swallowed.
   */
  const openOnWiki = () => {
    const loaded = article()
    if (!loaded) return undefined
    return (
      <a
        class={appBarStyles.trailing}
        href={loaded.canonicalUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${loaded.title} on the wiki`}
        title="Open on the wiki"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none">
          <path
            d="M14 4h6v6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M20 4l-8.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path
            d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </a>
    )
  }

  return (
    <>
      <AppBar
        title={title()}
        leading="back"
        onLeadingClick={() => navigate(-1)}
        trailing={openOnWiki()}
      />

      <Switch>
        <Match when={article.loading}>
          <p class={styles.status}>Loading…</p>
        </Match>
        <Match when={article.error}>
          <div class={styles.status}>
            <p>Couldn't load this article.</p>
            <button type="button" class={styles.retry} onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Match>
        <Match when={article()}>
          {(loaded) => <ArticleBody html={loaded().html} siteId={siteId()} />}
        </Match>
      </Switch>
    </>
  )
}
