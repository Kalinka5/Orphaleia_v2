import type { SalesRankingResponse } from './types'

// Fictional presentation data only. Never imported into the sales database.
const books = [
  { title: 'The Glass Orchard', authors: ['Elena Valdés'], genre: 'Fantasy', units: [2486300, 1942800, 186420, 142730] },
  { title: 'A Map of Quiet Places', authors: ['Clara Whitmore'], genre: 'Fiction', units: [2134750, 2213400, 214860, 196320] },
  { title: 'The Last Summer in Alba', authors: ['Mateo Soler'], genre: 'Romance', units: [1798200, 1546800, 173450, 162840] },
  { title: 'Small Rituals, Ordinary Days', authors: ['Nora Ellison'], genre: 'Non-fiction', units: [1428900, 1692400, 128670, 147580] },
  { title: 'Letters from the Tide', authors: ['Inés Morell'], genre: 'Fiction', units: [1167450, 986300, 151240, 118760] },
  { title: 'The Moonkeeper’s Atlas', authors: ['Adrian Lark'], genre: 'Fantasy', units: [984600, 1137800, 94730, 103460] },
  { title: 'Where the Lemon Trees Grow', authors: ['Lucía Ferrer'], genre: 'Romance', units: [763250, 684900, 116580, 97420] },
  { title: 'The Art of Paying Attention', authors: ['Theo Mercer'], genre: 'Non-fiction', units: [592800, 748650, 68390, 81450] },
]

export function getRankingPreview(year: string, market: string, genre: string): SalesRankingResponse {
  const selectedYear = year === '2024' ? 2024 : 2025
  const selectedMarket = market === 'spain' ? 'spain' : 'all-covered'
  const index = (selectedMarket === 'spain' ? 2 : 0) + (selectedYear === 2024 ? 1 : 0)
  const categories = ['Fantasy', 'Fiction', 'Non-fiction', 'Romance'].map((label) => ({ value: label.toLowerCase(), label }))
  return {
    status: 'published', year: selectedYear, market: selectedMarket,
    scope_label: selectedMarket === 'spain' ? 'Spain (demo)' : 'Covered markets (demo)',
    available_years: [2025, 2024],
    available_markets: [{ value: 'all-covered', label: 'Covered markets (demo)' }, { value: 'spain', label: 'Spain (demo)' }],
    available_genres: categories,
    items: books.filter((book) => !genre || book.genre.toLowerCase() === genre)
      .map((book) => ({ title: book.title, authors: book.authors, genre: book.genre, units_sold: book.units[index] }))
      .sort((a, b) => b.units_sold - a.units_sold || a.title.localeCompare(b.title))
      .map((book, index) => ({ ...book, rank: index + 1 })),
  }
}
