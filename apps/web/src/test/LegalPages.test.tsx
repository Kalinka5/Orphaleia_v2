import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

function renderRoute(path: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Sign in required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('legal routes', () => {
  it('renders the privacy policy with metadata, contents, identity, and cookie details', async () => {
    renderRoute('/privacy')

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Privacy Policy contents' })).toHaveTextContent('Who is responsible for your data')
    expect(screen.getAllByText('Kalina Ent., trading as Orphaleia').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Calle Sinai 12, 41007 Sevilla, Spain').length).toBeGreaterThan(0)
    expect(screen.getByText('access_token')).toBeInTheDocument()
    expect(screen.getByText('refresh_token')).toBeInTheDocument()
    expect(screen.getByText('csrf_token')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms and Conditions' })).toHaveAttribute('href', '/terms')
    await waitFor(() => expect(document.title).toBe('Privacy Policy · Orphaleia'))
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', 'Learn how Orphaleia collects, uses, shares, and protects personal information.')
  })

  it('renders the terms with consumer rights, withdrawal form, and dispute information', async () => {
    renderRoute('/terms')

    expect(screen.getByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your 14-day right of withdrawal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Model withdrawal notice' })).toBeInTheDocument()
    expect(screen.getByText(/three-year legal conformity period/)).toBeInTheDocument()
    expect(screen.getByText(/We do not require consumers to bring proceedings exclusively in Sevilla/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' }).every((link) => link.getAttribute('href') === '/privacy')).toBe(true)
    await waitFor(() => expect(document.title).toBe('Terms and Conditions · Orphaleia'))
  })

  it('shows linked legal acknowledgement on registration', async () => {
    renderRoute('/register')

    expect(await screen.findByRole('heading', { name: 'Register' })).toBeInTheDocument()
    const acknowledgement = screen.getByText(/By creating an account/)
    expect(acknowledgement).toHaveTextContent('agree to our Terms and Conditions')
    expect(screen.getByRole('link', { name: 'Terms and Conditions' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })
})
