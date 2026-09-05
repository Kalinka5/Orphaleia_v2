import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountHub } from '../components/AccountHub'
import type { User } from '../types'

const user: User = {
  id: 'reader-1',
  email: 'reader@example.com',
  pending_email: null,
  full_name: 'Test Reader',
  avatar_url: null,
  role: 'customer',
  is_verified: true,
}

function renderHub(path = '/account', currentUser = user, refresh = vi.fn(async () => {})) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AccountHub user={currentUser} refresh={refresh} /></MemoryRouter></QueryClientProvider>)
  return { client, refresh }
}

afterEach(() => vi.unstubAllGlobals())

describe('AccountHub', () => {
  it('defaults invalid sections to the order history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHub('/account?section=unknown')
    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('heading', { name: 'Books on their way and on your shelf' })).toBeInTheDocument()
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

  it('catches password confirmation mismatch before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHub('/account?section=security')
    fireEvent.change(screen.getByLabelText('Current password', { selector: '#password-current' }), { target: { value: 'ReaderPass!2026' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A-New-Password!2026' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A-Different-Password!2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('New passwords do not match.')
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})
