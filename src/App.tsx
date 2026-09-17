import { Route, Router } from '@solidjs/router'
import ArticleRoute from './routes/ArticleRoute.tsx'
import FeedRoute from './routes/FeedRoute.tsx'
import SettingsRoute from './routes/SettingsRoute.tsx'

export default function App() {
  return (
    <Router>
      <Route path="/" component={FeedRoute} />
      <Route path="/article/:title" component={ArticleRoute} />
      <Route path="/settings" component={SettingsRoute} />
    </Router>
  )
}
