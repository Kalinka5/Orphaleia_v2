import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

function renderRoute(path: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Sign in required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('portfolio information routes', () => {
  it('replaces commercial terms and business identity with a portfolio notice', async () => {
    renderRoute('/terms')

    expect(await screen.findByRole('heading', { level: 1, name: 'Portfolio Demo Notice' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No sales, payments, or delivery' })).toBeInTheDocument()
    expect(screen.getByText(/not an operating bookseller, registered trading business/)).toBeInTheDocument()
    expect(screen.getByText(/No contract, order, invoice, shipment/)).toBeInTheDocument()
    expect(screen.queryByText(/NIF/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Registro Mercantil/)).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Portfolio Demo Notice · Orphaleia'))
  })

  it('tells visitors to use fictional details and avoid real personal data', async () => {
    renderRoute('/privacy')

    expect(await screen.findByRole('heading', { level: 1, name: 'Demo Privacy Note' })).toBeInTheDocument()
    expect(screen.getByText(/without providing a real identity, email, postal address, or payment information/)).toBeInTheDocument()
    expect(screen.getByText(/random local demo identity/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Portfolio Demo Notice' })).toHaveAttribute('href', '/terms')
    await waitFor(() => expect(document.title).toBe('Demo Privacy Note · Orphaleia'))
  })

  it('redirects registration and recovery routes to one-click demo access', async () => {
    renderRoute('/register')
    expect(await screen.findByRole('heading', { name: 'Enter the demo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Explore as demo reader/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.getByText('Portfolio demonstration — no books are sold and no payments are taken.')).toBeInTheDocument()
  })
})
