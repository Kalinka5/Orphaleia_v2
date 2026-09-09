import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Address, User } from '../types'

const savedAddress: Address = { name: 'Marina Reader', line1: '14 Library Lane', line2: 'Floor 2', city: 'Madrid', postal_code: '28001', country: 'ES' }
const user: User = { id: 'reader-1', email: 'reader@example.com', pending_email: null, full_name: 'Marina Reader', avatar_url: null, role: 'customer', is_verified: true, default_shipping_address: savedAddress }

function renderCheckout(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/checkout']}><App /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('Checkout saved delivery address', () => {
  it('prefills checkout without persisting ordinary edits', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      throw new Error(`Unexpected request: ${url}`)
    })
    renderCheckout(fetchMock)
    expect(await screen.findByLabelText('Address')).toHaveValue('14 Library Lane')
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '8 Order Road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery' }))
    await screen.findByText('€24.00')
    expect(screen.getByText(/confirm an obligation to pay/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Terms and Conditions' }).some((link) => link.closest('aside') && link.getAttribute('href') === '/terms')).toBe(true)
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' }).some((link) => link.closest('aside') && link.getAttribute('href') === '/privacy')).toBe(true)
    expect(calls.some((url) => url.endsWith('/delivery-address'))).toBe(false)
  })

  it('saves the edited address before creating an order when opted in', async () => {
    const mutations: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/users/me') && !init?.method) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/delivery-address')) { mutations.push('address'); return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
      if (url.endsWith('/orders')) { mutations.push('order'); return new Response(JSON.stringify({ id: 'order-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
      if (url.includes('/payments/stripe/start')) { mutations.push('payment'); return new Response(JSON.stringify({ redirect_url: '#payment' }), { status: 200, headers: { 'Content-Type': 'application/json' } }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    renderCheckout(fetchMock)
    await screen.findByLabelText('Address')
    fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery' }))
    await screen.findByText('€24.00')
    fireEvent.click(screen.getByRole('checkbox', { name: /Save as my default delivery address/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Stripe' }))
    await waitFor(() => expect(mutations).toEqual(['address', 'order', 'payment']))
  })

  it('does not create an order when saving the opted-in address fails', async () => {
    let orderCreated = false
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/delivery-address')) return new Response(JSON.stringify({ message: 'Address could not be saved' }), { status: 422, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/orders')) { orderCreated = true; return new Response('{}', { status: 200 }) }
      throw new Error(`Unexpected request: ${url}`)
    })
    renderCheckout(fetchMock)
    await screen.findByLabelText('Address')
    fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery' }))
    await screen.findByText('€24.00')
    fireEvent.click(screen.getByRole('checkbox', { name: /Save as my default delivery address/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Stripe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Address could not be saved')
    expect(orderCreated).toBe(false)
  })

  it('reuses the same idempotency key when an order request is retried', async () => {
    const orderKeys: string[] = []
    let attempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/orders')) {
        orderKeys.push(new Headers(init?.headers).get('Idempotency-Key') || '')
        attempts += 1
        if (attempts === 1) return new Response(JSON.stringify({ message: 'Please retry' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        return new Response(JSON.stringify({ id: 'order-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('/payments/stripe/start')) return new Response(JSON.stringify({ redirect_url: '#payment' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      throw new Error(`Unexpected request: ${url}`)
    })
    renderCheckout(fetchMock)
    await screen.findByLabelText('Address')
    fireEvent.click(screen.getByRole('button', { name: 'Calculate delivery' }))
    await screen.findByText('€24.00')
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Stripe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please retry')
    fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Stripe' }))
    await waitFor(() => expect(orderKeys).toHaveLength(2))
    expect(orderKeys[0]).toHaveLength(36)
    expect(orderKeys[1]).toBe(orderKeys[0])
  })
})
