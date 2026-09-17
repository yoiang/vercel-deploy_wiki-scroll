import styles from './AppBar.module.css'

interface AppBarProps {
  title: string
  leading: 'menu' | 'back'
  onLeadingClick: () => void
}

export default function AppBar(props: AppBarProps) {
  return (
    <header class={styles.bar}>
      <button
        type="button"
        class={styles.leading}
        aria-label={props.leading === 'menu' ? 'Open menu' : 'Go back'}
        onClick={() => props.onLeadingClick()}
      >
        {props.leading === 'menu' ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 6h18M3 12h18M3 18h18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        )}
      </button>
      <h1 class={styles.title}>{props.title}</h1>
    </header>
  )
}
