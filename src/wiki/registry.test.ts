import { describe, expect, it } from 'vitest'
import { WIKIPEDIA_EN, getActiveSource } from './registry.ts'

describe('registry', () => {
  it('configures English Wikipedia', () => {
    expect(WIKIPEDIA_EN.domain).toBe('en.wikipedia.org')
    expect(WIKIPEDIA_EN.id).toBe('wikipedia-en')
  })

  it('sets an identifying user agent', () => {
    expect(WIKIPEDIA_EN.userAgent).toContain('wiki-scroll')
  })

  it('returns a source exposing the WikiSource interface', () => {
    const source = getActiveSource()
    expect(source.id).toBe('wikipedia-en')
    expect(typeof source.openFeed).toBe('function')
    expect(typeof source.fetchArticle).toBe('function')
  })

  it('returns the same instance on repeated calls', () => {
    expect(getActiveSource()).toBe(getActiveSource())
  })
})
