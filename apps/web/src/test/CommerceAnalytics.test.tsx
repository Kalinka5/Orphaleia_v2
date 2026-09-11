import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { User } from '../types'

const analytics = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('../analytics', () => ({ trackAnalytics: analytics.track }))
vi.mock('../components/BookDetailExperience', () => ({
  BookDetailExperience: ({ notice, onAdd }: { notice: string; onAdd: () => void }) => <div><span>{notice}</span><button onClick={onAdd}>Add to bag</button></div>,
}))

const user: User = {
  id: 'reader-1', email: 'reader@example.com', pending_email: null, full_name: 'Marina Reader', avatar_url: null,
  role: 'customer', is_verified: true, default_shipping_address: null,
}

const book = {
  id: 'book-1', slug: 'the-little-prince', title: 'The Little Prince', description: 'A story about friendship and wonder.',
  isbn: '9780000000001', publication_year: 1943, price_cents: 1250, currency: 'EUR', stock_qty: 4, available: true,
  cover_url: '/covers/little-prince.webp', interior_image_url: null, interior_image_alt: null, pull_quote: null,
  video_url: null, featured: true, rating_average: 4.8, rating_count: 12, authors: [], genres: [], comments: [], related: [],
}

const cart = {
  id: 'cart-1', subtotal_cents: 2500, currency: 'EUR',
  items: [{ id: 'item-1', book_id: book.id, quantity: 2, book: { title: book.title, slug: book.slug, cover_url: book.cover_url, price_cents: book.price_cents, stock_qty: book.stock_qty } }],
}

function renderRoute(fetchMock: ReturnType<typeof vi.fn>, route: string) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></QueryClientProvider>)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  analytics.track.mockReset()
  vi.unstubAllGlobals()
})

describe('commerce analytics events', () => {
  it('records a completed catalogue search without sending the search phrase', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return json({ message: 'Not signed in' }, 401)
      if (url.includes('/books?')) return json({ items: [book], page: 1, page_size: 12, total: 1 })
      if (url.endsWith('/genres') || url.endsWith('/authors')) return json({ items: [] })
      throw new Error(`Unexpected request: ${url}`)
    })
    renderRoute(fetchMock, '/books?q=a+private+phrase')

    expect(await screen.findByText('1 books found · page 1 of 1')).toBeInTheDocument()
    expect(analytics.track).toHaveBeenCalledWith('catalog_search', { has_results: true, result_count: 1 })
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('private phrase')
  })

  it('records an add-to-bag event only after the cart mutation succeeds', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return json(user)
      if (url.endsWith('/cart')) return json({ ...cart, items: [], subtotal_cents: 0 })
      if (url.endsWith('/books/the-little-prince')) return json(book)
      if (url.endsWith('/books/book-1/rating-trend')) return json({ points: [] })
      if (url.endsWith('/cart/items') && init?.method === 'POST') return json({})
      throw new Error(`Unexpected request: ${url}`)
    })
    renderRoute(fetchMock, '/books/the-little-prince')

    fireEvent.click(await screen.findByRole('button', { name: 'Add to bag' }))
    expect(await screen.findByText('Added to your bag')).toBeInTheDocument()
    expect(analytics.track).toHaveBeenCalledWith('add_to_bag', {
      book_slug: 'the-little-prince', quantity: 1, value: 12.5, currency: 'EUR',
    })
  })

  it('records checkout intent from a populated bag', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return json(user)
      if (url.endsWith('/cart')) return json(cart)
      throw new Error(`Unexpected request: ${url}`)
    })
    renderRoute(fetchMock, '/cart')

    fireEvent.click(await screen.findByRole('link', { name: /Continue to delivery/ }))
    expect(analytics.track).toHaveBeenCalledWith('checkout_started', { item_count: 2, value: 25, currency: 'EUR' })
  })

  it('records removal only after the server accepts it', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return json(user)
      if (url.endsWith('/cart')) return json(cart)
      if (url.endsWith('/cart/items/item-1') && init?.method === 'DELETE') return new Response(null, { status: 204 })
      throw new Error(`Unexpected request: ${url}`)
    })
    renderRoute(fetchMock, '/cart')

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(analytics.track).toHaveBeenCalledWith('remove_from_bag', {
      book_slug: 'the-little-prince', quantity: 2, value: 25, currency: 'EUR',
    }))
  })
})
