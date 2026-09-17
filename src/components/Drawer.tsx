import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  onClose: () => void
}

export default function Drawer(props: DrawerProps) {
  return (
    <Show when={props.open}>
      <div class={styles.scrim} onClick={() => props.onClose()} aria-hidden="true" />
      <nav class={styles.panel} aria-label="Main menu">
        <h2 class={styles.heading}>Wiki Scroll</h2>
        <A href="/settings" class={styles.item} onClick={() => props.onClose()}>
          Settings
        </A>
      </nav>
    </Show>
  )
}
