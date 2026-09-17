import { describe, expect, it } from 'vitest'
import { UnknownSiteError, getSource } from './sources.ts'

describe('getSource', () => {
  it('builds a source for a known site', () => {
    const source = getSource('wikipedia:en')
    expect(source.id).toBe('wikipedia:en')
    expect(typeof source.openFeed).toBe('function')
    expect(typeof source.fetchArticle).toBe('function')
  })

  it('names the source with family and language', () => {
    expect(getSource('wikipedia:ja').displayName).toBe('Wikipedia (Japanese)')
  })

  it('memoises per site id', () => {
    expect(getSource('wikipedia:en')).toBe(getSource('wikipedia:en'))
  })

  it('returns different instances for different sites', () => {
    expect(getSource('wikipedia:en')).not.toBe(getSource('wikipedia:de'))
  })

  it('builds sources for other families too', () => {
    expect(getSource('wiktionary:en').id).toBe('wiktionary:en')
  })

  it('throws UnknownSiteError for an unknown site', () => {
    expect(() => getSource('nosuchwiki:en')).toThrow(UnknownSiteError)
  })

  it('names the offending site id in the error', () => {
    expect(() => getSource('nosuchwiki:en')).toThrow(/nosuchwiki:en/)
  })
})
