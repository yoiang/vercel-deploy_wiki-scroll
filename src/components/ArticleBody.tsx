import { useNavigate } from '@solidjs/router'
import { parseSiteId } from '../wiki/catalogue.ts'
import '../styles/wiki-content.css'
import styles from './ArticleBody.module.css'

interface ArticleBodyProps {
  html: string
  /** The wiki this article came from; internal links resolve against it. */
  siteId: string
}

const WIKI_LINK_PREFIX = '/wiki/'

export default function ArticleBody(props: ArticleBodyProps) {
  const navigate = useNavigate()

  /**
   * One delegated handler for the whole article, rather than rewriting every
   * anchor up front. Internal wiki links stay in the app; anchors scroll within
   * the article; everything else opens outward.
   */
  function onClick(event: MouseEvent) {
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    if (href.startsWith(WIKI_LINK_PREFIX)) {
      event.preventDefault()
      // Resolve against this article's own wiki — otherwise a link inside a
      // Japanese article would open the English one.
      const parsed = parseSiteId(props.siteId)
      if (!parsed) return
      const title = href.slice(WIKI_LINK_PREFIX.length).split('#')[0]!
      navigate(`/article/${parsed.familyId}/${parsed.lang}/${title}`)
      return
    }

    if (href.startsWith('#')) {
      event.preventDefault()
      const target = document.getElementById(decodeURIComponent(href.slice(1)))
      target?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  return (
    <div
      class={`${styles.body} wiki-content`}
      onClick={onClick}
      /* Already sanitised by sanitizeWikiHtml at the source boundary. */
      innerHTML={props.html}
    />
  )
}
