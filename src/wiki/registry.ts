import { MediaWikiSource } from './mediawiki.ts'
import type { MediaWikiSourceConfig } from './mediawiki.ts'
import type { WikiSource } from './types.ts'

/**
 * Wikimedia's API etiquette asks for a User-Agent identifying the application
 * with contact information. The placeholder below must be replaced before this
 * app is distributed — see the README section "Before distributing this app".
 */
export const WIKIPEDIA_EN: MediaWikiSourceConfig = {
  id: 'wikipedia-en',
  displayName: 'Wikipedia (English)',
  domain: 'en.wikipedia.org',
  userAgent: 'wiki-scroll/0.1',
}

/**
 * Every configured wiki. Adding another MediaWiki site means adding an entry
 * here; supporting a non-MediaWiki wiki means writing another WikiSource.
 */
export const SOURCES: MediaWikiSourceConfig[] = [WIKIPEDIA_EN]

let active: WikiSource | null = null

/**
 * The source the app currently reads from. A later iteration makes this
 * selectable from the settings page.
 */
export function getActiveSource(): WikiSource {
  active ??= new MediaWikiSource(WIKIPEDIA_EN)
  return active
}
