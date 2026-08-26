import type { Genre } from './types'

export type GenreIllustration = {
  src: string
  alt: string
  objectPosition?: string
}

type LandingGenre = Pick<Genre, 'slug'>

export const homepageGenreSlugs = [
  'romance',
  'mystery-crime',
  'childrens-literature',
  'dark-fantasy',
  'science-fiction',
] as const

export const genreIllustrations = {
  romance: {
    src: '/assets/landing/romeo-and-juliet-featured.webp',
    alt: 'Painterly Romance scene of two young lovers meeting across a moonlit Verona balcony.',
    objectPosition: '50% center',
  },
  'mystery-crime': {
    src: '/assets/landing/the-adventures-of-sherlock-holmes-featured.webp',
    alt: 'Painterly Mystery and Crime scene of two investigators following clues through gaslit London fog.',
    objectPosition: '48% center',
  },
  'childrens-literature': {
    src: '/assets/landing/the-little-prince-featured.webp',
    alt: 'Painterly Children’s Literature scene of a young traveler tending a rose on a tiny asteroid.',
    objectPosition: '52% center',
  },
  'dark-fantasy': {
    src: '/covers/the-picture-of-dorian-gray.webp',
    alt: 'Painterly Dark Fantasy scene of a Victorian man confronting an altered portrait in a shadowed room.',
    objectPosition: '50% center',
  },
  'science-fiction': {
    src: '/assets/landing/twenty-thousand-leagues-under-the-sea-featured.webp',
    alt: 'Painterly Science Fiction scene of the Nautilus crossing a luminous ocean trench.',
    objectPosition: '52% center',
  },
} satisfies Record<string, GenreIllustration>

export function getGenreIllustration(genre: LandingGenre): GenreIllustration | undefined {
  return genreIllustrations[genre.slug as keyof typeof genreIllustrations]
}
