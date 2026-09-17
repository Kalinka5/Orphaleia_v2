import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { User } from '../types'

const analytics = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('../analytics', () => ({ trackAnalytics: analytics.track }))

const user: User = { id: 'demo-1', email: 'portfolio-random@orphaleia.local', pending_email: null, full_name: 'Ariadne Demo', avatar_url: null, role: 'customer', is_verified: true, default_shipping_address: null }

function renderCheckout(fetchMock: ReturnType<typeof vi.fn>, initialEntry = '/checkout') {
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><LocationProbe /><App /></MemoryRouter></QueryClientProvider>)
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
}

afterEach(() => {
  analytics.track.mockReset()
  vi.unstubAllGlobals()
})

describe('portfolio checkout', () => {
  it('uses only a fixed fictional address and clearly labels both payment simulations', async () => {
    const requestBodies: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 2000, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) {
        requestBodies.push(String(init?.body))
        return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    renderCheckout(fetchMock)
    expect(await screen.findByLabelText('Fictional address used for this demonstration')).toHaveTextContent('12 Library Lane')
    expect(screen.getByText(/Visitors are never asked to provide or save a real address/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Calculate demo total' }))
    expect(await screen.findByText('€24.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simulate Stripe checkout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simulate PayPal checkout' })).toBeInTheDocument()
    expect(requestBodies[0]).toContain('12 Library Lane')
    expect(requestBodies[0]).toContain('Fictional address')
  })

  it('never calls the saved-address endpoint while starting a simulated checkout', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 2000, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/checkout/quote')) return new Response(JSON.stringify({ subtotal_cents: 2000, shipping_cents: 400, total_cents: 2400, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/orders')) return new Response(JSON.stringify({ id: 'order-1', total_cents: 2400, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/payments/stripe/start')) return new Response(JSON.stringify({ redirect_url: '#demo-payment' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      throw new Error(`Unexpected request: ${url}`)
    })

    renderCheckout(fetchMock)
    await screen.findByLabelText('Fictional address used for this demonstration')
    fireEvent.click(screen.getByRole('button', { name: 'Calculate demo total' }))
    await screen.findByText('€24.00')
    fireEvent.click(screen.getByRole('button', { name: 'Simulate Stripe checkout' }))
    await waitFor(() => expect(calls.some((url) => url.includes('/payments/stripe/start'))).toBe(true))
    expect(calls.some((url) => url.endsWith('/delivery-address'))).toBe(false)
    expect(analytics.track).toHaveBeenCalledWith('demo_payment_selected', { provider: 'stripe', value: 24, currency: 'EUR' })
  })

  it('ends with the required no-order and no-payment message', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/users/me')) return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/cart')) return new Response(JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/payments/paypal/complete')) return new Response(JSON.stringify({ id: 'demo-order', status: 'paid', total_cents: 2400, currency: 'EUR', items: [{ quantity: 1 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      throw new Error(`Unexpected request: ${url}`)
    })

    renderCheckout(fetchMock, '/payment/return?order=demo-order&provider=paypal&token=demo-reference')
    expect(await screen.findByRole('heading', { name: 'Demo completed. No order was placed and no payment was made.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View demo order UI/ })).toHaveAttribute('href', '/account')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/payment\/return$/))
    expect(screen.getByTestId('location')).not.toHaveTextContent('demo-reference')
    expect(analytics.track).toHaveBeenCalledWith('demo_checkout_completed', { provider: 'paypal', item_count: 1 })
  })
})
