import { Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { formatRelativeTime } from '../lib/formatRelativeTime.ts'
import type { FeedItem } from '../wiki/types.ts'
import styles from './ArticleCard.module.css'

interface ArticleCardProps {
  item: FeedItem
}

export default function ArticleCard(props: ArticleCardProps) {
  const navigate = useNavigate()

  function open() {
    navigate(`/article/${encodeURIComponent(props.item.title)}`, {
      state: { pageId: props.item.pageId },
    })
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
            <img class={styles.image} src={image().url} alt="" loading="lazy" decoding="async" />
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
