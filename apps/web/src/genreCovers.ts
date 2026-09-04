import type { Genre } from './types'

export type GenreCover = {
  src: string
  alt: string
}

type GenreIdentity = Pick<Genre, 'slug'>

export const genreCovers = {
  romance: {
    src: '/covers/romeo-and-juliet.webp',
    alt: 'Romeo and Juliet book cover representing Romance',
  },
  tragedy: {
    src: '/covers/romeo-and-juliet.webp',
    alt: 'Romeo and Juliet book cover representing Tragedy',
  },
  'literary-fiction': {
    src: '/covers/the-great-gatsby.webp',
    alt: 'The Great Gatsby book cover representing Literary Fiction',
  },
  'gothic-fiction': {
    src: '/covers/wuthering-heights.webp',
    alt: 'Wuthering Heights book cover representing Gothic Fiction',
  },
  'mystery-crime': {
    src: '/covers/the-adventures-of-sherlock-holmes.webp',
    alt: 'The Adventures of Sherlock Holmes book cover representing Mystery and Crime',
  },
  'childrens-literature': {
    src: '/covers/alices-adventures-in-wonderland.webp',
    alt: 'Alice’s Adventures in Wonderland book cover representing Children’s Literature',
  },
  'philosophical-fiction': {
    src: '/covers/the-little-prince.webp',
    alt: 'The Little Prince book cover representing Philosophical Fiction',
  },
  fantasy: {
    src: '/covers/the-hobbit.webp',
    alt: 'The Hobbit book cover representing Fantasy',
  },
  'psychological-thriller': {
    src: '/covers/the-picture-of-dorian-gray.webp',
    alt: 'The Picture of Dorian Gray book cover representing Psychological Thriller',
  },
  'dark-fantasy': {
    src: '/covers/the-picture-of-dorian-gray.webp',
    alt: 'The Picture of Dorian Gray book cover representing Dark Fantasy',
  },
  'science-fiction': {
    src: '/covers/1984.webp',
    alt: '1984 book cover representing Science Fiction',
  },
  'dystopian-fiction': {
    src: '/covers/1984.webp',
    alt: '1984 book cover representing Dystopian Fiction',
  },
  adventure: {
    src: '/covers/twenty-thousand-leagues-under-the-sea.webp',
    alt: 'Twenty Thousand Leagues Under the Sea book cover representing Adventure',
  },
  'young-adult': {
    src: '/covers/harry-potter-and-the-philosophers-stone.webp',
    alt: 'Harry Potter and the Philosopher’s Stone book cover representing Young Adult',
  },
} satisfies Record<string, GenreCover>

export function getGenreCover(genre: GenreIdentity): GenreCover | undefined {
  return genreCovers[genre.slug as keyof typeof genreCovers]
}
