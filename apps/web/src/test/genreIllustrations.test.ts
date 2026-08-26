import { describe, expect, it } from 'vitest'
import { genreIllustrations, getGenreIllustration, homepageGenreSlugs } from '../genreIllustrations'

const visibleGenres = [
  ['romance', 'Romance'],
  ['mystery-crime', 'Mystery and Crime'],
  ['childrens-literature', 'Children’s Literature'],
  ['dark-fantasy', 'Dark Fantasy'],
  ['science-fiction', 'Science Fiction'],
] as const

describe('genre illustrations', () => {
  it('keeps the homepage genre order intentional', () => {
    expect(homepageGenreSlugs).toEqual(visibleGenres.map(([slug]) => slug))
  })

  it.each(visibleGenres)('maps generated artwork for %s', (slug, name) => {
    const illustration = getGenreIllustration({ slug })

    expect(illustration).toEqual(genreIllustrations[slug])
    expect(illustration?.alt).toContain(name)
    expect(illustration?.src.endsWith('.webp')).toBe(true)
    expect(illustration?.objectPosition).toBeTruthy()
  })

  it('returns no image for an unmapped genre', () => {
    expect(getGenreIllustration({ slug: 'new-shelf' })).toBeUndefined()
  })
})
