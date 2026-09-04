import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenreDirectory } from '../components/GenreDirectory'
import type { Genre } from '../types'

const genres: Genre[] = [
  {
    id: 'romance-id',
    slug: 'romance',
    name: 'Romance',
    description: 'Stories centered on love and longing.',
  },
  {
    id: 'fantasy-id',
    slug: 'fantasy',
    name: 'Fantasy',
    description: 'Journeys through invented worlds.',
  },
  {
    id: 'new-shelf-id',
    slug: 'new-shelf',
    name: 'New Shelf',
    description: 'A future genre without a mapped cover.',
  },
]

function mockPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches: coarse,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

function renderDirectory() {
  return render(
    <MemoryRouter initialEntries={['/genres']}>
      <Routes>
        <Route path="/genres" element={<GenreDirectory genres={genres} />} />
        <Route path="/genres/:slug" element={<p>Genre shelf opened</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GenreDirectory', () => {
  beforeEach(() => mockPointer(false))

  it('renders ordered genre links with mapped covers and descriptions', () => {
    const { container } = renderDirectory()

    expect(screen.getByRole('list', { name: 'Genre collections' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /Romance/ })).toHaveAttribute('href', '/genres/romance')
    expect(screen.getByText('Stories centered on love and longing.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Romeo and Juliet book cover representing Romance/ })).toHaveAttribute('src', '/covers/romeo-and-juliet.webp')
    const rows = container.querySelectorAll('li')
    expect(rows[0]).toHaveTextContent(/^01Romance/)
    expect(rows[1]).toHaveTextContent(/^02Fantasy/)
  })

  it('keeps an unmapped genre as a usable text-only link', () => {
    renderDirectory()

    const link = screen.getByRole('link', { name: /New Shelf/ })
    expect(link).toHaveAttribute('href', '/genres/new-shelf')
    expect(link.querySelector('img')).not.toBeInTheDocument()
    expect(link).toHaveTextContent('A future genre without a mapped cover.')
  })

  it('previews one touch row at a time and opens it on the second tap', () => {
    mockPointer(true)
    renderDirectory()
    const romance = screen.getByRole('link', { name: /Romance/ })
    const fantasy = screen.getByRole('link', { name: /Fantasy/ })

    fireEvent.click(romance, { detail: 1 })
    expect(romance).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByText('Genre shelf opened')).not.toBeInTheDocument()

    fireEvent.click(fantasy, { detail: 1 })
    expect(romance).not.toHaveAttribute('aria-expanded')
    expect(fantasy).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(fantasy, { detail: 1 })
    expect(screen.getByText('Genre shelf opened')).toBeInTheDocument()
  })

  it('keeps keyboard activation as direct navigation on coarse pointers', () => {
    mockPointer(true)
    renderDirectory()

    fireEvent.click(screen.getByRole('link', { name: /Romance/ }), { detail: 0 })
    expect(screen.getByText('Genre shelf opened')).toBeInTheDocument()
  })
})
