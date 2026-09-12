import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountHub } from '../components/AccountHub'
import type { Order, User } from '../types'

const user: User = {
  id: 'reader-1',
  email: 'reader@example.com',
  pending_email: null,
  full_name: 'Test Reader',
  avatar_url: null,
  role: 'customer',
  is_verified: true,
  default_shipping_address: null,
}

const deliveredOrder: Order = {
  id: 'order-1',
  number: 'ORP-260905-7536',
  status: 'delivered',
  subtotal_cents: 4200,
  shipping_cents: 770,
  total_cents: 4970,
  currency: 'EUR',
  tracking_carrier: 'Correos',
  tracking_reference: 'PQ48392761ES',
  tracking_url: 'https://www.correos.es/track/PQ48392761ES',
  created_at: '2026-09-05T10:00:00Z',
  status_history: [
    { status: 'paid', occurred_at: '2026-09-05T10:01:00Z' },
    { status: 'processing', occurred_at: '2026-09-05T12:00:00Z' },
    { status: 'shipped', occurred_at: '2026-09-06T08:00:00Z' },
    { status: 'out_for_delivery', occurred_at: '2026-09-08T07:00:00Z' },
    { status: 'delivered', occurred_at: '2026-09-08T14:00:00Z' },
  ],
  shipping: { name: 'Test Reader', line1: '1 Odyssey Way', line2: '', city: 'Madrid', postal_code: '28001', country: 'ES' },
  items: [{ book_id: 'book-1', title: 'The Test Passage', isbn: '9780000099999', cover_url: '/covers/test.svg', unit_price_cents: 4200, quantity: 1 }],
}

function renderHub(path = '/account', currentUser = user, refresh = vi.fn(async () => {})) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AccountHub user={currentUser} refresh={refresh} /></MemoryRouter></QueryClientProvider>)
  return { client, refresh }
}

afterEach(() => vi.unstubAllGlobals())

describe('AccountHub', () => {
  it('welcomes the reader with the Dorian Gray portrait scene', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub()
    expect(screen.getByRole('heading', { name: 'Welcome, Test' })).toBeInTheDocument()
    expect(screen.getByAltText(/Dorian Gray leans against the page/)).toHaveAttribute('src', '/assets/account/dorian-gray-account-header-v3.png')
  })

  it('defaults invalid sections to the order history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=unknown')
    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { name: 'Books on their way and on your shelf' })).toBeInTheDocument()
  })

  it('opens a deep-linked order with timeline, delivery, and safe carrier tracking', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [deliveredOrder] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=orders&order=order-1')
    const summary = await screen.findByRole('button', { name: /ORP-260905-7536/ })
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list', { name: /Delivery progress/ })).toBeInTheDocument()
    expect(screen.getByText('PQ48392761ES')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Track with carrier/ })).toHaveAttribute('href', deliveredOrder.tracking_url)
    expect(screen.getByText((_content, element) => element?.tagName === 'ADDRESS' && Boolean(element.textContent?.includes('1 Odyssey Way')))).toBeInTheDocument()
  })

  it('explains missing legacy history without inventing dates', async () => {
    const legacyOrder = { ...deliveredOrder, status: 'shipped' as const, status_history: [] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [legacyOrder] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub()
    fireEvent.click(await screen.findByRole('button', { name: /ORP-260905-7536/ }))
    expect(screen.getByText('Earlier updates were recorded before timeline tracking began.')).toBeInTheDocument()
    expect(screen.getAllByText('Recorded before timeline tracking began')).toHaveLength(3)
  })

  it('shows refunded orders as an exception rather than a delivery step', async () => {
    const refundedOrder = { ...deliveredOrder, status: 'refunded' as const, status_history: [...deliveredOrder.status_history.slice(0, 2), { status: 'refunded' as const, occurred_at: '2026-09-06T09:00:00Z' }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [refundedOrder] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=orders&order=order-1')
    expect(await screen.findByText('This order is recorded as refunded. Contact the shop if you need payment details.')).toBeInTheDocument()
    expect(screen.queryByText('Earlier updates were recorded before timeline tracking began.')).not.toBeInTheDocument()
  })

  it('explains provider-confirmed orders awaiting payment review', async () => {
    const reviewOrder = {
      ...deliveredOrder,
      status: 'payment_review' as const,
      payment_review_reason: 'stock_unavailable' as const,
      status_history: [
        { status: 'payment_review' as const, occurred_at: '2026-09-05T10:01:00Z' },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [reviewOrder] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=orders&order=order-1')
    expect(await screen.findByText(/needs manual review/)).toBeInTheDocument()
    expect(screen.getByText(/arrange a refund/)).toBeInTheDocument()
  })

  it('saves a public display name from the profile section', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init
      return new Response(JSON.stringify({ ...user, full_name: 'Marina Reader' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderHub('/account?section=profile')
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Marina Reader' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save display name' }))
    await screen.findByText('Display name saved.')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ full_name: 'Marina Reader' })
  })

  it('shows pending email state and cancels it', async () => {
    const pendingUser = { ...user, pending_email: 'next@example.com' }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...pendingUser, pending_email: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderHub('/account?section=security', pendingUser)
    expect(screen.getByText('next@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await screen.findByText('Pending email change cancelled.')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('saves and removes a private default delivery address', async () => {
    const savedAddress = { name: 'Test Reader', line1: '14 Library Lane', line2: '', city: 'Madrid', postal_code: '28001', country: 'ES' }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
      ...user,
      default_shipping_address: init?.method === 'DELETE' ? null : savedAddress,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    renderHub('/account?section=delivery')
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: savedAddress.line1 } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: savedAddress.city } })
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: savedAddress.postal_code } })
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
    await screen.findByText('Default delivery address saved.')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(savedAddress)

    fireEvent.click(screen.getByRole('button', { name: 'Remove saved address' }))
    await screen.findByText('Default delivery address removed.')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('catches password confirmation mismatch before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHub('/account?section=security')
    fireEvent.change(screen.getByLabelText('Current password', { selector: '#password-current' }), { target: { value: 'ReaderPass!2026' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A-New-Password!2026' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A-Different-Password!2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('New passwords do not match.')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('aria-describedby', 'password-confirm-error')
    await waitFor(() => expect(screen.getByLabelText('Confirm new password')).toHaveFocus())
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })

  it('associates API delivery validation with the affected field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      message: 'Check the highlighted fields',
      field_errors: { line1: 'Address must contain at least 3 characters' },
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=delivery')
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '14 Library Lane' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Madrid' } })
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '28001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save delivery address' }))
    const address = screen.getByLabelText('Address')
    expect(await screen.findByText('Address must contain at least 3 characters')).toBeInTheDocument()
    expect(address).toHaveAttribute('aria-invalid', 'true')
    expect(address).toHaveAccessibleDescription('Address must contain at least 3 characters')
  })
})
