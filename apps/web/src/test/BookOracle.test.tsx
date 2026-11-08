import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BookOracle from '../components/BookOracle'
import { ORACLE_STORAGE_KEY, readOracleRound, type OracleEvent, type OracleManifest, type OracleState } from '../bookOracle'

const manifest: OracleManifest = {
  version: 'oracle-1', title: 'The Book Oracle', introduction: 'Think of a book. Keep its title secret.', library_size: 100,
  choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, { id: 'probably', label: 'Probably' }, { id: 'probably-not', label: 'Probably not' }, { id: 'unknown', label: 'Don’t know' }],
}
const book = { id: 'the-hobbit', title: 'The Hobbit', author: 'J. R. R. Tolkien', explanation: 'Your clues about a journey and a magical world pointed here.', shop_slug: 'the-hobbit' }
const prompts = ['Does it involve a journey?', 'Does it involve magic?', 'Is there a dragon?']
function stateFor(events: OracleEvent[]): OracleState {
  const answers = events.filter((e) => e.type === 'answer')
  const guesses = events.filter((e) => e.type === 'guess')
  const base = { version: manifest.version, question_count: answers.length, guess_count: guesses.length }
  if (guesses.some((e) => e.correct)) return { ...base, status: 'success', book }
  if (guesses.length) return { ...base, status: 'defeat', message: 'Your book may be beyond my shelves.' }
  if (answers.length === 3) return { ...base, status: 'guess', book }
  return { ...base, status: 'question', question: { id: `q${answers.length}`, prompt: prompts[answers.length] } }
}
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function mockApi() {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/book-oracle')) return response(manifest)
    const data = JSON.parse(String(init?.body)) as { events: OracleEvent[] }
    return response(stateFor(data.events))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><BookOracle /></MemoryRouter></QueryClientProvider>)
}
async function start() {
  fireEvent.click(await screen.findByRole('button', { name: 'Let’s begin' }))
  await screen.findByRole('heading', { name: prompts[0] })
}
async function answer() {
  const button = screen.getByRole('button', { name: 'Yes' })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear() })

describe('Book Oracle', () => {
  it('reacts to answers immediately and restores committed reactions on failure, Back, and Restart', async () => {
    const fetchMock = mockApi(); mount(); await start()
    const portrait = screen.getByRole('complementary', { name: 'The Orphaleia book oracle' })
    const respond = async (label: string, count: number) => {
      fetchMock.mockResolvedValueOnce(response({ version: manifest.version, status: 'question', question_count: count, guess_count: 0, question: { id: `q${count}`, prompt: `Clue ${count}?` } }))
      fireEvent.click(screen.getByRole('button', { name: label }))
      await screen.findByRole('heading', { name: `Clue ${count}?` })
    }
    await respond('No', 1)
    expect(portrait).toHaveAttribute('data-emotion', 'skeptical')
    await respond('No', 2)
    await respond('No', 3)
    expect(portrait).toHaveAttribute('data-emotion', 'angry')
    fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Probably' }))
    expect(portrait).toHaveAttribute('data-emotion', 'thinking')
    await screen.findByRole('button', { name: 'Retry' })
    expect(portrait).toHaveAttribute('data-emotion', 'angry')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: prompts[2] })
    expect(portrait).toHaveAttribute('data-emotion', 'skeptical')
    await respond('Probably', 3)
    expect(portrait).toHaveAttribute('data-emotion', 'thinking')
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await screen.findByRole('heading', { name: prompts[0] })
    expect(portrait).toHaveAttribute('data-emotion', 'thinking')
  })

  it('plays as a guest, confirms a guess, and links only an available shop match', async () => {
    mockApi(); mount(); await start()
    for (let i = 0; i < 3; i++) {
      await answer()
      await screen.findByRole('heading', { name: i === 2 ? 'The Hobbit' : prompts[i + 1] })
    }
    expect(screen.getByRole('link', { name: 'Find it on our shelves' })).toHaveAttribute('href', '/books/the-hobbit')
    fireEvent.click(screen.getByRole('button', { name: 'That’s my book' }))
    await screen.findByRole('button', { name: 'Think of another book' })
    expect(screen.getByText(/Found in 3 questions/)).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem(ORACLE_STORAGE_KEY)!).events).toHaveLength(4)
  })

  it('goes back and restarts with server-recomputed transcripts', async () => {
    mockApi(); mount(); await start(); await answer()
    await screen.findByRole('heading', { name: prompts[1] })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: prompts[0] })
    expect(JSON.parse(sessionStorage.getItem(ORACLE_STORAGE_KEY)!).events).toEqual([])
    await answer(); await screen.findByRole('heading', { name: prompts[1] })
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await screen.findByRole('heading', { name: prompts[0] })
  })

  it('resumes an unfinished round from the same tab', async () => {
    mockApi()
    sessionStorage.setItem(ORACLE_STORAGE_KEY, JSON.stringify({ version: manifest.version, events: [{ type: 'answer', question_id: 'q0', answer: 'unknown' }] }))
    mount()
    await screen.findByRole('heading', { name: prompts[1] })
    expect(screen.queryByRole('button', { name: 'Let’s begin' })).not.toBeInTheDocument()
  })

  it('offers a fresh start for outdated and corrupted saved rounds', async () => {
    mockApi()
    sessionStorage.setItem(ORACLE_STORAGE_KEY, JSON.stringify({ version: 'old', events: [] }))
    mount()
    await screen.findByText(/older or unreadable edition/)
    await start()
    expect(JSON.parse(sessionStorage.getItem(ORACLE_STORAGE_KEY)!).version).toBe(manifest.version)
  })

  it('keeps playing when browser storage is blocked', async () => {
    mockApi()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    mount(); await start(); await answer()
    await screen.findByRole('heading', { name: prompts[1] })
    expect(screen.getByText(/This browser can’t save/)).toBeInTheDocument()
  })

  it('retries exactly the failed submission without losing or duplicating the answer', async () => {
    const fetchMock = mockApi(); mount(); await start()
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'))
    await answer()
    await screen.findByRole('button', { name: 'Retry' })
    expect(JSON.parse(sessionStorage.getItem(ORACLE_STORAGE_KEY)!).events).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled()
    const failed = fetchMock.mock.calls.at(-1)![1]!.body
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('heading', { name: prompts[1] })
    expect(fetchMock.mock.calls.at(-1)![1]!.body).toBe(failed)
    expect(JSON.parse(sessionStorage.getItem(ORACLE_STORAGE_KEY)!).events).toHaveLength(1)
  })

  it('lets readers recover from an expired knowledge version', async () => {
    const fetchMock = mockApi(); mount(); await start()
    fetchMock.mockResolvedValueOnce(response({ message: 'Library changed.' }, 409))
    await answer()
    fireEvent.click(await screen.findByRole('button', { name: 'Start a fresh round' }))
    await screen.findByRole('heading', { name: prompts[0] })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled())
  })

  it('admits defeat after a rejected guess and supports going back', async () => {
    mockApi(); mount(); await start()
    for (let i = 0; i < 3; i++) {
      await answer()
      await screen.findByRole('heading', { name: i === 2 ? 'The Hobbit' : prompts[i + 1] })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Keep looking' }))
    await screen.findByRole('button', { name: 'Try another book' })
    expect(screen.getByText(/beyond my shelves/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('heading', { name: 'The Hobbit' })
    expect(screen.getByRole('button', { name: 'Keep looking' })).toBeInTheDocument()
  })

  it('does not invent shop links for titles outside the catalog', async () => {
    const fetchMock = mockApi(); mount(); await start()
    fetchMock.mockResolvedValueOnce(response({ version: manifest.version, status: 'guess', question_count: 3, guess_count: 0, book: { ...book, shop_slug: null } }))
    await answer(); await screen.findByRole('heading', { name: 'The Hobbit' })
    expect(screen.queryByRole('link', { name: 'Find it on our shelves' })).not.toBeInTheDocument()
  })

  it('rejects malformed browser saves without sending them to the API', () => {
    sessionStorage.setItem(ORACLE_STORAGE_KEY, '{bad json')
    expect(readOracleRound()).toEqual({ round: null, unavailable: false, invalid: true })
    sessionStorage.setItem(ORACLE_STORAGE_KEY, JSON.stringify({ version: manifest.version, events: [{ type: 'guess', book_id: 'the-hobbit', correct: 'false' }] }))
    expect(readOracleRound().invalid).toBe(true)
  })
})
