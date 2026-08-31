import { fireEvent, render, screen } from '@testing-library/react'
import type { ForwardedRef, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookDetailExperience } from '../components/BookDetailExperience'
import type { Book } from '../types'

vi.mock('react-pageflip', async () => {
  const React = await import('react')
  const MockFlipBook = React.forwardRef(function MockFlipBook(
    props: { children: ReactNode; className?: string; onFlip?: (event: { data: number }) => void; onChangeState?: (event: { data: string }) => void },
    ref: ForwardedRef<unknown>,
  ) {
    const currentPage = React.useRef(0)
    const changePage = (page: number) => {
      props.onChangeState?.({ data: 'flipping' })
      currentPage.current = page
      props.onFlip?.({ data: page })
      props.onChangeState?.({ data: 'read' })
    }
    React.useImperativeHandle(ref, () => ({
      pageFlip: () => ({
        flip: (page: number) => changePage(page),
        flipNext: () => changePage(Math.min(3, currentPage.current + 2)),
        flipPrev: () => changePage(Math.max(0, currentPage.current - 2)),
        getCurrentPageIndex: () => currentPage.current,
        turnToPage: (page: number) => changePage(page),
      }),
    }))
    return React.createElement('div', { className: props.className }, props.children)
  })
  return { default: MockFlipBook }
})

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
    expect(screen.getAllByAltText('Cover of The Test Passage')).toHaveLength(2)
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

  it('provides four desktop pages to the physical page-turn surface', () => {
    renderExperience()
    const leaf = screen.getByTestId('turning-leaf')
    expect(leaf.querySelectorAll('article')).toHaveLength(4)
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
