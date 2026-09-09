import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminOrderOperations } from '../components/AdminOrderOperations'
import type { Order } from '../types'

const order: Order = {
  id: 'order-1',
  number: 'ORP-260905-7536',
  status: 'processing',
  subtotal_cents: 4200,
  shipping_cents: 770,
  total_cents: 4970,
  currency: 'EUR',
  tracking_reference: null,
  tracking_carrier: null,
  tracking_url: null,
  status_history: [
    { status: 'paid', occurred_at: '2026-09-05T10:01:00Z' },
    { status: 'processing', occurred_at: '2026-09-05T12:00:00Z' },
  ],
  created_at: '2026-09-05T10:00:00Z',
  shipping: { name: 'Test Reader', line1: '1 Odyssey Way', line2: '', city: 'Madrid', postal_code: '28001', country: 'ES' },
  items: [{ book_id: 'book-1', title: 'The Test Passage', isbn: '9780000099999', cover_url: '/covers/test.svg', unit_price_cents: 4200, quantity: 1 }],
}

function renderOrder(value = order) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><AdminOrderOperations order={value} /></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('AdminOrderOperations', () => {
  it('collects and confirms required shipment tracking details', async () => {
    let submitted: unknown
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ ...order, status: 'shipped' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderOrder()
    fireEvent.click(screen.getByRole('button', { name: /Manage/ }))
    fireEvent.change(screen.getByLabelText('Carrier'), { target: { value: 'Correos' } })
    fireEvent.change(screen.getByLabelText('Tracking reference'), { target: { value: 'PQ48392761ES' } })
    fireEvent.change(screen.getByLabelText(/Tracking URL/), { target: { value: 'https://www.correos.es/track/PQ48392761ES' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review shipment' }))
    expect(screen.getByText(/customer will receive Correos tracking details/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm update' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(submitted).toEqual({
      status: 'shipped',
      tracking_carrier: 'Correos',
      tracking_reference: 'PQ48392761ES',
      tracking_url: 'https://www.correos.es/track/PQ48392761ES',
    })
  })

  it('warns that refund status does not execute a provider refund', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderOrder({ ...order, status: 'paid', status_history: order.status_history.slice(0, 1) })
    fireEvent.click(screen.getByRole('button', { name: /Manage/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Record as refunded' }))
    expect(screen.getByText(/does not send money through Stripe or PayPal/i)).toBeInTheDocument()
  })

  it('shows the safe review reason and offers an administrator-confirmed refund', () => {
    vi.stubGlobal('fetch', vi.fn())
    renderOrder({
      ...order,
      status: 'payment_review',
      payment_review_reason: 'order_cancelled',
      status_history: [{ status: 'payment_review', occurred_at: '2026-09-05T10:01:00Z' }],
    })
    fireEvent.click(screen.getByRole('button', { name: /Manage/ }))
    expect(screen.getByText(/Reason: order cancelled/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record as refunded' })).toBeInTheDocument()
  })
})
