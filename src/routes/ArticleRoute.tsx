import { Match, Switch, createResource } from 'solid-js'
import { useLocation, useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
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

  return (
    <>
      <AppBar title={title()} leading="back" onLeadingClick={() => navigate(-1)} />

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
