import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadingCurrentExperience, ReadingCurrentShared } from '../components/ReadingCurrentExperience'
import type { Book, ReadingCurrentIntro, ReadingCurrentQuestion, ReadingCurrentResult, User } from '../types'

const user: User = { id: 'reader-1', email: 'reader@example.com', pending_email: null, full_name: 'Test Reader', avatar_url: null, role: 'customer', is_verified: true, default_shipping_address: null }
const book: Book = {
  id: 'book-1', title: 'The Lantern Atlas', slug: 'the-lantern-atlas', isbn: '9780000000001', description: 'A long test description.', publication_year: 2026,
  price_cents: 1800, currency: 'EUR', stock_qty: 0, available: false, cover_url: '/covers/test.svg', featured: false, active: true, rating_average: 4.4, rating_count: 18,
  authors: [{ id: 'author-1', name: 'Iris Vale', slug: 'iris-vale', bio: '', image_url: null }], genres: [{ id: 'genre-1', name: 'Fantasy', slug: 'fantasy', description: 'Wonder.' }],
}
const result: ReadingCurrentResult = {
  version: '2026.1', completed_at: '2026-09-17T12:00:00Z', primary_genre: book.genres[0], related_genres: [
    { id: 'genre-2', name: 'Adventure', slug: 'adventure', description: 'Journeys.' },
    { id: 'genre-3', name: 'Young Adult', slug: 'young-adult', description: 'Becoming.' },
  ], archetype: { id: 'elsewhere-dreamer', name: 'The Elsewhere Dreamer', description: 'You test the border of possibility.' },
  explanation: 'Your choices point to room for wonder, worlds that bend what is possible, and the charged moment of becoming.', traits: ['room for wonder', 'worlds that bend what is possible', 'the charged moment of becoming'], books: [book],
}

function question(step: number): ReadingCurrentQuestion {
  return { id: `q${step}`, prompt: `Question ${step} prompt`, hint: `Question ${step} hint`, scene: step <= 2 ? 'moonlit-harbor' : step <= 4 ? 'doorway-archive' : step <= 6 ? 'forked-forest' : 'distant-lighthouse', step, answers: [
    { id: 'a', label: `Answer A${step}`, description: 'First route.' },
    { id: 'b', label: `Answer B${step}`, description: 'Second route.' },
    { id: 'c', label: `Answer C${step}`, description: 'Third route.' },
    { id: 'd', label: `Answer D${step}`, description: 'Fourth route.' },
  ] }
}
const intro: ReadingCurrentIntro = { version: '2026.1', total_steps: 8, title: 'Find Your Reading Current', introduction: 'Eight choices will chart the stories most likely to keep you reading.', first_question: question(1) }

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function voyageFetch(options: { saveFails?: boolean; onPost?: (path: string, body: Record<string, unknown>) => void } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {}
    if (path.endsWith('/reading-current') && (!init?.method || init.method === 'GET')) return response(intro)
    if (path.endsWith('/reading-current/step')) {
      const answers = body.answers as Array<unknown>
      options.onPost?.(path, body)
      return answers.length === 8
        ? response({ status: 'complete', version: intro.version, total_steps: 8, result })
        : response({ status: 'question', version: intro.version, total_steps: 8, question: question(answers.length + 1) })
    }
    if (path.endsWith('/users/me/reading-current') && init?.method === 'PUT') return options.saveFails ? response({ message: 'Save failed' }, 503) : response({ profile: { version: intro.version, result, updated_at: result.completed_at, is_stale: false }, shares: [] })
    if (path.endsWith('/users/me/reading-current/shares') && init?.method === 'POST') {
      options.onPost?.(path, body)
      return response({ id: 'share-1', url: 'http://localhost/reading-current/shared/public-token', display_name: body.include_display_name ? user.full_name : null, created_at: result.completed_at, expires_at: '2027-09-17T12:00:00Z', revoked_at: null }, 201)
    }
    return response({ message: 'Unexpected request' }, 500)
  })
}

function renderVoyage(currentUser: User | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter><ReadingCurrentExperience user={currentUser} /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('ReadingCurrentExperience', () => {
  it('finishes only after eight explicit choices and preserves the result locally', async () => {
    const fetchMock = voyageFetch()
    vi.stubGlobal('fetch', fetchMock)
    renderVoyage()
    fireEvent.click(await screen.findByRole('button', { name: /Set sail/ }))
    for (let step = 1; step <= 8; step += 1) {
      fireEvent.click(await screen.findByRole('radio', { name: new RegExp(`Answer A${step}`) }))
      fireEvent.click(screen.getByRole('button', { name: step === 8 ? /Reveal my current/ : /Continue/ }))
      if (step < 8) await screen.findByRole('heading', { name: `Question ${step + 1} prompt` })
    }
    expect(await screen.findByRole('heading', { name: 'Fantasy' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/reading-current/step'))).toHaveLength(8)
    expect(JSON.parse(localStorage.getItem('orphaleia:reading-current') || '{}').result.primary_genre.slug).toBe('fantasy')
    expect(screen.getByText('Currently out of stock')).toBeInTheDocument()
  })

  it('retains an earlier selection when going back and discards its downstream route', async () => {
    const posts: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', voyageFetch({ onPost: (_path, body) => posts.push(body) }))
    renderVoyage()
    fireEvent.click(await screen.findByRole('button', { name: /Set sail/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Answer A1/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    await screen.findByRole('heading', { name: 'Question 2 prompt' })
    fireEvent.click(screen.getByRole('radio', { name: /Answer A2/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    await screen.findByRole('heading', { name: 'Question 3 prompt' })
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    await screen.findByRole('heading', { name: 'Question 2 prompt' })
    expect(screen.getByRole('radio', { name: /Answer A2/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /Answer B2/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    await screen.findByRole('heading', { name: 'Question 3 prompt' })
    const lastAnswers = posts.at(-1)?.answers as Array<{ question_id: string; answer_id: string }>
    expect(lastAnswers).toEqual([{ question_id: 'q1', answer_id: 'a' }, { question_id: 'q2', answer_id: 'b' }])
  })

  it('keeps a completed result visible when automatic account saving fails', async () => {
    localStorage.setItem('orphaleia:reading-current', JSON.stringify({ version: intro.version, answers: Array.from({ length: 8 }, (_, index) => ({ question_id: `q${index + 1}`, answer_id: 'a' })), result }))
    vi.stubGlobal('fetch', voyageFetch({ saveFails: true }))
    renderVoyage(user)
    expect(await screen.findByRole('heading', { name: 'Fantasy' })).toBeInTheDocument()
    expect(await screen.findByText(/account saving failed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try account save again' })).toBeInTheDocument()
  })

  it('leaves name sharing unchecked and sends consent only after selection', async () => {
    const posts: Array<{ path: string; body: Record<string, unknown> }> = []
    localStorage.setItem('orphaleia:reading-current', JSON.stringify({ version: intro.version, answers: Array.from({ length: 8 }, (_, index) => ({ question_id: `q${index + 1}`, answer_id: 'a' })), result }))
    vi.stubGlobal('fetch', voyageFetch({ onPost: (path, body) => posts.push({ path, body }) }))
    renderVoyage(user)
    const consent = await screen.findByLabelText(/Include my display name/)
    expect(consent).not.toBeChecked()
    fireEvent.click(consent)
    fireEvent.click(screen.getByRole('button', { name: /Create a share link/ }))
    expect(await screen.findByDisplayValue(/public-token/)).toBeInTheDocument()
    const sharePost = posts.find((item) => item.path.endsWith('/users/me/reading-current/shares'))
    expect(sharePost?.body).toEqual({ include_display_name: true })
  })

  it('discards incompatible local progress when the quiz version changes', async () => {
    localStorage.setItem('orphaleia:reading-current', JSON.stringify({ version: '2025.9', answers: [{ question_id: 'old', answer_id: 'old' }] }))
    vi.stubGlobal('fetch', voyageFetch())
    renderVoyage()
    expect(await screen.findByRole('heading', { name: 'Find Your Reading Current' })).toBeInTheDocument()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('orphaleia:reading-current') || '{}')).toEqual({ version: '2026.1', answers: [] }))
  })
})

describe('ReadingCurrentShared', () => {
  it('shows the dedicated expired state and a route into a new voyage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'This shared reading current is no longer available' }, 410)))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/reading-current/shared/expired']}><Routes><Route path="/reading-current/shared/:token" element={<ReadingCurrentShared />} /></Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('heading', { name: 'This current has moved on' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start your own voyage/ })).toHaveAttribute('href', '/reading-current')
  })
})
