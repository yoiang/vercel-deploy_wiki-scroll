import { Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { formatRelativeTime } from '../lib/formatRelativeTime.ts'
import { parseSiteId } from '../wiki/catalogue.ts'
import type { FeedItem } from '../wiki/types.ts'
import styles from './ArticleCard.module.css'

interface ArticleCardProps {
  item: FeedItem
}

/**
 * FeedItem.id is `${familyId}:${lang}:${pageId}`, so the site id is everything
 * before the final colon. The title is encoded because titles may contain
 * slashes, which would otherwise produce a broken four-segment URL.
 */
export function articleHref(item: FeedItem): string {
  const lastColon = item.id.lastIndexOf(':')
  const parsed = parseSiteId(item.id.slice(0, lastColon))
  if (!parsed) return '/'

  return `/article/${parsed.familyId}/${parsed.lang}/${encodeURIComponent(item.title)}`
}

export default function ArticleCard(props: ArticleCardProps) {
  const navigate = useNavigate()

  function open() {
    navigate(articleHref(props.item), { state: { pageId: props.item.pageId } })
  }

  return (
    <article>
      <button type="button" class={styles.card} onClick={open}>
        <div class={styles.header}>
          <span class={styles.headerTitle}>{props.item.title}</span>
          <time class={styles.timestamp} dateTime={props.item.updatedAt.toISOString()}>
            {formatRelativeTime(props.item.updatedAt)}
          </time>
        </div>

        <Show when={props.item.image}>
          {(image) => (
            <img
              class={styles.image}
              src={image().url}
              alt=""
              loading="lazy"
              decoding="async"
              width={image().width}
              height={image().height}
              style={{ 'aspect-ratio': `${image().width} / ${image().height}` }}
            />
          )}
        </Show>

        <div class={styles.caption}>
          <h2 class={styles.captionTitle}>{props.item.title}</h2>
          <p class={styles.summary}>
            {props.item.summary}
            <span class={styles.readMore}>… read more</span>
          </p>
        </div>
      </button>
    </article>
  )
}
