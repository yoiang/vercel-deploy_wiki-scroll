import { A, useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore } from '../feed/followStore.ts'
import styles from './SettingsRoute.module.css'

export default function SettingsRoute() {
  const navigate = useNavigate()

  const summary = () => {
    const count = followStore.followedSiteIds().length
    if (count === 0) return 'None'
    if (count === 1) return '1 wiki'
    return `${count} wikis`
  }

  return (
    <>
      <AppBar title="Settings" leading="back" onLeadingClick={() => navigate('/')} />

      <A href="/settings/wikis" class={styles.row}>
        <span>Wikis</span>
        <span class={styles.rowValue}>{summary()} ›</span>
      </A>
    </>
  )
}
