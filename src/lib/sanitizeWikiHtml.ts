import DOMPurify from 'dompurify'

/**
 * Elements a wiki hides with its own site CSS, which this app never loads.
 * Without removing them they render as raw content mid-article — Minecraft
 * Wiki's `history-json` block is a wall of JSON.
 */
const WIKI_HIDDEN_SELECTORS = ['pre.history-json', '.mw-kartographer-maplink'].join(',')

/**
 * Resolves one URL against the wiki it came from.
 *
 * Three forms occur in practice:
 *   //upload.wikimedia.org/…  protocol-relative — Wikipedia's form
 *   /images/…                 root-relative — most third-party wikis' form
 *   https://…                 already absolute
 *
 * Root-relative is the dangerous one: the browser resolves it against *this
 * app's* origin, so every image 404s. Measured on Minecraft Wiki, 232 of 232
 * images are root-relative; on Wikipedia, 0 of 19 are.
 */
function toAbsolute(url: string, baseUrl?: string): string {
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/') && baseUrl !== undefined) return `${baseUrl}${url}`
  return url
}

/** Rewrites every URL in a srcset descriptor list. */
function srcsetToAbsolute(srcset: string, baseUrl?: string): string {
  return srcset
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim()
      const spaceAt = trimmed.indexOf(' ')
      if (spaceAt === -1) return toAbsolute(trimmed, baseUrl)
      return `${toAbsolute(trimmed.slice(0, spaceAt), baseUrl)}${trimmed.slice(spaceAt)}`
    })
    .join(', ')
}

/**
 * Sanitises article HTML from the wiki, resolves its image URLs, and strips
 * elements the source wiki hides with CSS this app does not load.
 *
 * Wikipedia content is user-editable and we inject it with innerHTML, so
 * sanitisation is mandatory rather than defensive.
 *
 * `baseUrl` is the wiki's origin, e.g. `https://minecraft.wiki`. Anchor hrefs
 * are deliberately left relative: ArticleBody intercepts them to navigate
 * inside the app, and absolutising them would send every internal link out to
 * the browser instead.
 */
export function sanitizeWikiHtml(html: string, baseUrl?: string): string {
  if (html === '') return ''

  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const parsed = new DOMParser().parseFromString(clean, 'text/html')

  for (const hidden of parsed.querySelectorAll(WIKI_HIDDEN_SELECTORS)) {
    hidden.remove()
  }

  for (const image of parsed.querySelectorAll('img')) {
    const source = image.getAttribute('src')
    if (source) image.setAttribute('src', toAbsolute(source, baseUrl))

    const srcset = image.getAttribute('srcset')
    if (srcset) image.setAttribute('srcset', srcsetToAbsolute(srcset, baseUrl))
  }

  return parsed.body.innerHTML
}
