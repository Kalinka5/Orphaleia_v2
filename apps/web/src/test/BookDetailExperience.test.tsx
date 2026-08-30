import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookDetailExperience } from '../components/BookDetailExperience'
import type { Book } from '../types'

const book: Book = {
  id: 'book-1',
  title: 'The Test Passage',
  slug: 'the-test-passage',
  isbn: '9780000099999',
  description: 'A traveler follows a lantern across a quiet and unfamiliar sea. A second sentence stays in reserve.',
  publication_year: 2026,
  price_cents: 2190,
  currency: 'EUR',
  stock_qty: 5,
  available: true,
  cover_url: '/covers/test.webp',
  featured: true,
  active: true,
  rating_average: 4.2,
  rating_count: 7,
  authors: [{ id: 'author-1', name: 'Mara Vale', slug: 'mara-vale', bio: '' }],
  genres: [{ id: 'genre-1', name: 'Adventure', slug: 'adventure', description: '' }],
}

beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    pointerType: string

    constructor(type: string, parameters: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, parameters)
      this.pointerId = parameters.pointerId ?? 0
      this.pointerType = parameters.pointerType ?? 'mouse'
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

function renderExperience(overrides: Partial<Book> = {}, onAdd = vi.fn()) {
  render(<MemoryRouter><BookDetailExperience book={{ ...book, ...overrides }} adding={false} notice="" onAdd={onAdd} /></MemoryRouter>)
  return onAdd
}

describe('BookDetailExperience', () => {
  it('uses legacy cover and description fallbacks', () => {
    renderExperience()
    expect(screen.getAllByAltText('Cover of The Test Passage')).toHaveLength(6)
    expect(screen.getAllByText('“A traveler follows a lantern across a quiet and unfamiliar sea.”')).toHaveLength(2)
  })

  it('turns spreads with controls and keyboard navigation', () => {
    renderExperience()
    const stage = screen.getByTestId('book-spread')
    expect(stage).toHaveAttribute('data-spread', '1')

    fireEvent.click(screen.getByRole('button', { name: 'Next spread' }))
    expect(stage).toHaveAttribute('data-spread', '2')
    expect(screen.getByRole('button', { name: 'Next spread' })).toBeDisabled()

    fireEvent.keyDown(stage, { key: 'ArrowLeft' })
    expect(stage).toHaveAttribute('data-spread', '1')
  })

  it('commits a sufficiently long page drag and reverses it', () => {
    renderExperience()
    const stage = screen.getByTestId('book-spread')
    const leaf = screen.getByTestId('turning-leaf')
    Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 1000 })

    fireEvent.pointerDown(leaf, { pointerId: 4, pointerType: 'touch', clientX: 900, clientY: 200 })
    fireEvent.pointerMove(leaf, { pointerId: 4, pointerType: 'touch', clientX: 650, clientY: 204 })
    fireEvent.pointerUp(leaf, { pointerId: 4, pointerType: 'touch', clientX: 650, clientY: 204 })
    expect(stage).toHaveAttribute('data-spread', '2')

    fireEvent.pointerDown(leaf, { pointerId: 5, pointerType: 'touch', clientX: 300, clientY: 200 })
    fireEvent.pointerMove(leaf, { pointerId: 5, pointerType: 'touch', clientX: 550, clientY: 204 })
    fireEvent.pointerUp(leaf, { pointerId: 5, pointerType: 'touch', clientX: 550, clientY: 204 })
    expect(stage).toHaveAttribute('data-spread', '1')
  })

  it('exposes four mobile pages and preserves the purchase action', () => {
    const onAdd = renderExperience({}, vi.fn())
    const mobilePages = screen.getByTestId('mobile-book-pages')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(mobilePages).toHaveAttribute('data-page', '2')

    const addButtons = screen.getAllByRole('button', { name: /Add to bag/ })
    fireEvent.click(addButtons[0])
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('disables purchasing when the book is unavailable', () => {
    renderExperience({ available: false, stock_qty: 0 })
    for (const button of screen.getAllByRole('button', { name: /Out of stock/ })) expect(button).toBeDisabled()
  })
})
