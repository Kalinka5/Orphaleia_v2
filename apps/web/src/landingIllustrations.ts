import type { Book } from './types'

export type LandingIllustrationVariant = 'featured' | 'story'

export type LandingIllustration = {
  src: string
  alt: string
  objectPosition?: string
}

type LandingBook = Pick<Book, 'cover_url' | 'slug' | 'title'>

const asset = (slug: string, variant: LandingIllustrationVariant) => `/assets/landing/${slug}-${variant}.webp`

export const homepageFeaturedBookSlugs = [
  'romeo-and-juliet',
  'the-adventures-of-sherlock-holmes',
  'the-little-prince',
  'twenty-thousand-leagues-under-the-sea',
] as const

export const homepageHeroBookSlugs = [
  'twenty-thousand-leagues-under-the-sea',
  'romeo-and-juliet',
  'the-adventures-of-sherlock-holmes',
  'the-little-prince',
  'the-hobbit',
] as const

export const landingIllustrations = {
  'romeo-and-juliet': {
    featured: {
      src: asset('romeo-and-juliet', 'featured'),
      alt: 'Painterly illustration for Romeo and Juliet: the young lovers meet across a moonlit Verona balcony.',
      objectPosition: '50% center',
    },
    story: {
      src: asset('romeo-and-juliet', 'story'),
      alt: 'Painterly illustration for Romeo and Juliet: two hands nearly meet above a candlelit courtyard.',
      objectPosition: '50% center',
    },
  },
  'the-adventures-of-sherlock-holmes': {
    featured: {
      src: asset('the-adventures-of-sherlock-holmes', 'featured'),
      alt: 'Painterly illustration for The Adventures of Sherlock Holmes: Holmes and Watson follow clues through gaslit London fog.',
      objectPosition: '48% center',
    },
    story: {
      src: asset('the-adventures-of-sherlock-holmes', 'story'),
      alt: 'Painterly illustration for The Adventures of Sherlock Holmes: the detective studies a clue inside a shadowed Victorian stairwell.',
      objectPosition: '50% center',
    },
  },
  'the-little-prince': {
    featured: {
      src: asset('the-little-prince', 'featured'),
      alt: 'Painterly illustration for The Little Prince: a young traveler tends a rose on a tiny asteroid beneath a vast sky.',
      objectPosition: '52% center',
    },
    story: {
      src: asset('the-little-prince', 'story'),
      alt: 'Painterly illustration for The Little Prince: a small figure watches distant planets from the edge of an asteroid.',
      objectPosition: '50% center',
    },
  },
  'twenty-thousand-leagues-under-the-sea': {
    featured: {
      src: asset('twenty-thousand-leagues-under-the-sea', 'featured'),
      alt: 'Painterly illustration for Twenty Thousand Leagues Under the Sea: the Nautilus crosses a luminous ocean trench.',
      objectPosition: '52% center',
    },
    story: {
      src: asset('twenty-thousand-leagues-under-the-sea', 'story'),
      alt: 'Painterly illustration for Twenty Thousand Leagues Under the Sea: a diver approaches the glowing Nautilus in the deep.',
      objectPosition: '50% center',
    },
  },
} satisfies Record<string, Record<LandingIllustrationVariant, LandingIllustration>>

export function orderHomepageBooks(books: Book[]): Book[] {
  const bySlug = new Map(books.map((book) => [book.slug, book]))
  return homepageFeaturedBookSlugs.flatMap((slug) => {
    const book = bySlug.get(slug)
    return book ? [book] : []
  })
}

export function orderHomepageHeroBooks(books: Book[]): Book[] {
  const bySlug = new Map(books.map((book) => [book.slug, book]))
  return homepageHeroBookSlugs.flatMap((slug) => {
    const book = bySlug.get(slug)
    return book ? [book] : []
  })
}

export function getLandingIllustration(book: LandingBook, variant: LandingIllustrationVariant): LandingIllustration {
  const illustrations = landingIllustrations[book.slug as keyof typeof landingIllustrations]
  if (illustrations) return illustrations[variant]
  return { src: book.cover_url, alt: `Cover of ${book.title}`, objectPosition: 'center' }
}
