import { useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import styles from './SettingsRoute.module.css'

export default function SettingsRoute() {
  const navigate = useNavigate()

  return (
    <>
      <AppBar title="Settings" leading="back" onLeadingClick={() => navigate('/')} />
      <p class={styles.body}>No settings yet.</p>
    </>
  )
}
