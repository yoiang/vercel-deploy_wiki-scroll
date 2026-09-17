import { Match, Switch, createResource } from 'solid-js'
import { useLocation, useNavigate, useParams } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import ArticleBody from '../components/ArticleBody.tsx'
import { getActiveSource } from '../wiki/registry.ts'
import styles from './ArticleRoute.module.css'

export default function ArticleRoute() {
  const params = useParams<{ title: string }>()
  const location = useLocation<{ pageId?: number } | undefined>()
  const navigate = useNavigate()

  const title = () => decodeURIComponent(params.title)

  const [article, { refetch }] = createResource(
    // Keyed on the title so tapping a link inside an article refetches.
    () => ({ title: title(), pageId: location.state?.pageId }),
    (ref) => getActiveSource().fetchArticle({ pageId: ref.pageId ?? 0, title: ref.title }),
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
        <Match when={article()}>{(loaded) => <ArticleBody html={loaded().html} />}</Match>
      </Switch>
    </>
  )
}
