import DOMPurify from 'dompurify'

/** Rewrites a protocol-relative URL (`//host/path`) to explicit https. */
function toHttps(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

/** Rewrites every URL in a srcset descriptor list. */
function srcsetToHttps(srcset: string): string {
  return srcset
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim()
      const spaceAt = trimmed.indexOf(' ')
      if (spaceAt === -1) return toHttps(trimmed)
      return `${toHttps(trimmed.slice(0, spaceAt))}${trimmed.slice(spaceAt)}`
    })
    .join(', ')
}

/**
 * Sanitises article HTML from the wiki and normalises its image URLs.
 *
 * Wikipedia content is user-editable and we inject it with innerHTML, so
 * sanitisation is mandatory rather than defensive. MediaWiki also emits
 * protocol-relative image URLs, which break under Capacitor's custom scheme,
 * so they are upgraded to https here.
 */
export function sanitizeWikiHtml(html: string): string {
  if (html === '') return ''

  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  const parsed = new DOMParser().parseFromString(clean, 'text/html')

  for (const image of parsed.querySelectorAll('img')) {
    const source = image.getAttribute('src')
    if (source) image.setAttribute('src', toHttps(source))

    const srcset = image.getAttribute('srcset')
    if (srcset) image.setAttribute('srcset', srcsetToHttps(srcset))
  }

  return parsed.body.innerHTML
}
