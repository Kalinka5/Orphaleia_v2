import { describe, expect, it } from 'vitest'
import {
  getLandingIllustration,
  homepageFeaturedBookSlugs,
  homepageHeroBookSlugs,
  landingIllustrations,
  orderHomepageBooks,
  orderHomepageHeroBooks,
  type LandingIllustrationVariant,
} from '../landingIllustrations'
import type { Book } from '../types'

const seededBooks = [
  ['romeo-and-juliet', 'Romeo and Juliet'],
  ['the-adventures-of-sherlock-holmes', 'The Adventures of Sherlock Holmes'],
  ['the-little-prince', 'The Little Prince'],
  ['twenty-thousand-leagues-under-the-sea', 'Twenty Thousand Leagues Under the Sea'],
] as const

const variants: LandingIllustrationVariant[] = ['featured', 'story']

describe('landing illustrations', () => {
  it.each(seededBooks)('maps both illustration variants for %s', (slug, title) => {
    for (const variant of variants) {
      const illustration = getLandingIllustration({ slug, title, cover_url: `/covers/${slug}.svg` }, variant)
      expect(illustration).toEqual(landingIllustrations[slug][variant])
      expect(illustration.src).toBe(`/assets/landing/${slug}-${variant}.webp`)
      expect(illustration.alt).toContain(title)
      expect(illustration.objectPosition).toBeTruthy()
    }
  })

  it('orders the homepage books independently of the API response order', () => {
    const apiBooks = [...seededBooks].reverse().map(([slug, title]) => ({ slug, title })) as Book[]

    expect(orderHomepageBooks(apiBooks).map((book) => book.slug)).toEqual(homepageFeaturedBookSlugs)
  })

  it('orders the five-book hero independently from the four-book featured grid', () => {
    const apiBooks = [...homepageHeroBookSlugs].reverse().map((slug) => ({ slug, title: slug })) as Book[]

    expect(orderHomepageHeroBooks(apiBooks).map((book) => book.slug)).toEqual(homepageHeroBookSlugs)
    expect(homepageFeaturedBookSlugs).toHaveLength(4)
    expect(homepageHeroBookSlugs).toHaveLength(5)
  })

  it('falls back to a canonical cover for books without generated art', () => {
    expect(getLandingIllustration({ slug: 'new-arrival', title: 'New Arrival', cover_url: '/covers/new.svg' }, 'featured')).toEqual({
      src: '/covers/new.svg',
      alt: 'Cover of New Arrival',
      objectPosition: 'center',
    })
  })
})
