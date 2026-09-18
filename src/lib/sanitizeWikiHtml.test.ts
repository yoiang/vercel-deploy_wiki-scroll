import { describe, expect, it } from 'vitest'
import { sanitizeWikiHtml } from './sanitizeWikiHtml.ts'

describe('sanitizeWikiHtml', () => {
  it('removes script tags', () => {
    const result = sanitizeWikiHtml('<p>Safe</p><script>alert(1)</script>')
    expect(result).not.toContain('script')
    expect(result).toContain('Safe')
  })

  it('removes inline event handlers', () => {
    const result = sanitizeWikiHtml('<img src="https://example.org/a.jpg" onerror="alert(1)">')
    expect(result).not.toContain('onerror')
  })

  it('preserves ordinary article markup', () => {
    const result = sanitizeWikiHtml('<p>An <b>article</b> with a <a href="/wiki/Link">link</a>.</p>')
    expect(result).toContain('<b>article</b>')
    expect(result).toContain('href="/wiki/Link"')
  })

  it('preserves tables and infoboxes', () => {
    const result = sanitizeWikiHtml('<table class="infobox"><tr><td>Cell</td></tr></table>')
    expect(result).toContain('infobox')
    expect(result).toContain('Cell')
  })

  it('upgrades protocol-relative image sources to https', () => {
    const result = sanitizeWikiHtml('<img src="//upload.wikimedia.org/a.jpg">')
    expect(result).toContain('src="https://upload.wikimedia.org/a.jpg"')
  })

  it('upgrades protocol-relative srcset entries to https', () => {
    const result = sanitizeWikiHtml(
      '<img src="//upload.wikimedia.org/a.jpg" srcset="//upload.wikimedia.org/a2.jpg 2x">',
    )
    expect(result).toContain('https://upload.wikimedia.org/a2.jpg 2x')
  })

  it('leaves absolute image sources untouched', () => {
    const result = sanitizeWikiHtml('<img src="https://upload.wikimedia.org/a.jpg">')
    expect(result).toContain('src="https://upload.wikimedia.org/a.jpg"')
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeWikiHtml('')).toBe('')
  })
})

describe('root-relative urls', () => {
  // Minecraft Wiki emits /images/... for every image (232 of 232 measured),
  // where Wikipedia emits //upload.wikimedia.org/... Without a base, the
  // browser resolves /images/... against the app's own origin and every
  // image 404s.
  const BASE = 'https://minecraft.wiki'

  it('absolutises a root-relative image src against the wiki', () => {
    const result = sanitizeWikiHtml('<img src="/images/thumb/A.png?b9ede">', BASE)
    expect(result).toContain('src="https://minecraft.wiki/images/thumb/A.png?b9ede"')
  })

  it('absolutises root-relative srcset entries', () => {
    const result = sanitizeWikiHtml('<img src="/images/a.png" srcset="/images/a2.png 2x">', BASE)
    expect(result).toContain('https://minecraft.wiki/images/a2.png 2x')
  })

  it('still upgrades protocol-relative sources', () => {
    const result = sanitizeWikiHtml('<img src="//upload.wikimedia.org/a.jpg">', BASE)
    expect(result).toContain('src="https://upload.wikimedia.org/a.jpg"')
  })

  it('leaves absolute sources untouched', () => {
    const result = sanitizeWikiHtml('<img src="https://example.org/a.jpg">', BASE)
    expect(result).toContain('src="https://example.org/a.jpg"')
  })

  it('leaves anchor hrefs relative so the app can intercept them', () => {
    // Absolutising hrefs would make every internal link open outward.
    const result = sanitizeWikiHtml('<a href="/w/Anvil">Anvil</a>', BASE)
    expect(result).toContain('href="/w/Anvil"')
  })

  it('works without a base, leaving root-relative srcs alone', () => {
    const result = sanitizeWikiHtml('<img src="/images/a.png">')
    expect(result).toContain('src="/images/a.png"')
  })
})

describe('wiki-hidden metadata', () => {
  it('removes the machine-readable history-json block', () => {
    // The wiki hides this with its own site CSS, which this app never loads,
    // so it renders as a wall of raw JSON in the middle of the article.
    const result = sanitizeWikiHtml(
      '<p>Real text</p><pre class="history-json noexcerpt">{"rows": []}</pre>',
      'https://minecraft.wiki',
    )
    expect(result).toContain('Real text')
    expect(result).not.toContain('history-json')
    expect(result).not.toContain('"rows"')
  })

  it('keeps ordinary preformatted blocks', () => {
    const result = sanitizeWikiHtml('<pre>/give @p stone</pre>', 'https://minecraft.wiki')
    expect(result).toContain('/give @p stone')
  })
})
