import { Route, Router } from '@solidjs/router'
import ArticleRoute from './routes/ArticleRoute.tsx'
import FeedRoute from './routes/FeedRoute.tsx'
import LanguagePickerRoute from './routes/LanguagePickerRoute.tsx'
import SettingsRoute from './routes/SettingsRoute.tsx'
import WikisRoute from './routes/WikisRoute.tsx'

export default function App() {
  return (
    <Router>
      <Route path="/" component={FeedRoute} />
      <Route path="/article/:familyId/:lang/:title" component={ArticleRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="/settings/wikis" component={WikisRoute} />
      <Route path="/settings/wikis/:familyId" component={LanguagePickerRoute} />
    </Router>
  )
}
