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
