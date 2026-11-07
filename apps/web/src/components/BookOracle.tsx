import { ArrowClockwise, ArrowLeft, ArrowRight, BookOpen, Check, Sparkle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiRequestError, errorMessage } from '../api'
import { ORACLE_STORAGE_KEY, readOracleRound, type OracleAnswer, type OracleEvent, type OracleManifest, type OracleState } from '../bookOracle'
import s from './BookOracle.module.css'

const art = '/assets/book-oracle/'

export default function BookOracle() {
  const manifest = useQuery({ queryKey: ['book-oracle'], queryFn: () => api<OracleManifest>('/book-oracle'), retry: false })
  const [state, setState] = useState<OracleState | null>(null)
  const [events, setEvents] = useState<OracleEvent[]>([])
  const [pending, setPending] = useState<OracleEvent[] | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [stale, setStale] = useState(false)
  const initialized = useRef(false)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!manifest.data || initialized.current) return
    initialized.current = true
    const saved = readOracleRound()
    setStorageUnavailable(saved.unavailable)
    if (saved.invalid || (saved.round && saved.round.version !== manifest.data.version)) setStale(true)
    else if (saved.round) setPending(saved.round.events)
  }, [manifest.data])

  useEffect(() => {
    if (pending === null || !manifest.data) return
    let cancelled = false
    const submission = pending
    setBusy(true)
    setError(null)
    void api<OracleState>('/book-oracle/step', { method: 'POST', body: JSON.stringify({ version: manifest.data.version, events: submission }) })
      .then((next) => {
        if (cancelled) return
        setBusy(false)
        setState(next)
        setEvents(submission)
        setPending(null)
        setStale(false)
        try {
          sessionStorage.setItem(ORACLE_STORAGE_KEY, JSON.stringify({ version: next.version, events: submission }))
        } catch { setStorageUnavailable(true) }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setBusy(false)
        setError(err)
        if (err instanceof ApiRequestError && (err.status === 409 || err.status === 422)) setStale(true)
      })
    return () => { cancelled = true }
  }, [pending, attempt, manifest.data])

  useEffect(() => {
    if (state && !busy) title.current?.focus({ preventScroll: true })
  }, [state, busy])

  const waiting = busy || pending !== null
  function restart() {
    setError(null)
    setStale(false)
    setState(null)
    setEvents([])
    setPending([])
  }
  function answer(value: OracleAnswer) {
    if (state?.status !== 'question' || waiting) return
    setPending([...events, { type: 'answer', question_id: state.question.id, answer: value }])
  }
  function confirm(correct: boolean) {
    if (state?.status !== 'guess' || waiting) return
    setPending([...events, { type: 'guess', book_id: state.book.id, correct }])
  }
  const expression = state?.status === 'success' ? 'successful' : state?.status === 'defeat' ? 'defeated' : state ? 'thinking' : 'welcoming'
  const needsFreshStart = stale && error instanceof ApiRequestError

  return <div className={s.page}>
    <div className={s.topline}><Link to="/books"><ArrowLeft size={16} aria-hidden="true" /> Back to the shelves</Link><span><BookOpen size={16} aria-hidden="true" /> Orphaleia’s Book Oracle</span></div>
    <div className={s.stage}>
      <aside className={s.portrait} aria-label="The Orphaleia book oracle">
        <div className={s.portraitCircle} aria-hidden="true" />
        <img className={s.oracle} src={`${art}${expression}.webp`} alt={`An illustrated oracle in a green robe, ${expression === 'successful' ? 'smiling with delight' : expression === 'defeated' ? 'giving an amused shrug' : expression === 'thinking' ? 'considering your clues' : 'welcoming you with an open book'}.`} width="900" height="900" fetchPriority="high" />
        <p className={s.portraitCaption}>A keeper of stories.<br /><span>A reader of clues.</span></p>
      </aside>
      <section className={s.conversation} aria-label="Book guessing game" aria-busy={busy}>
        <p className={s.eyebrow}><Sparkle size={15} aria-hidden="true" /> {state ? state.status === 'question' ? `Question ${state.question_count + 1}` : state.status === 'guess' ? 'A story comes to mind' : state.status === 'success' ? 'A little magic, a few good clues' : 'A mystery for another day' : 'A book in mind. A little magic.'}</p>
        {!state && <>
          <h1 ref={title} tabIndex={-1}>Think of a book.<br /><span>Keep its title secret.</span></h1>
          <p className={s.lead}>Somewhere between your answers, a story is waiting to be found. Shall we see if I know it?</p>
          <p className={s.instructions}>Choose one of the {manifest.data?.library_size ?? 100} well-known stories on my shelves, mostly classics. Answer a few questions about the book itself. If a detail escapes you, “Don’t know” is always welcome.</p>
          {manifest.isPending ? <p role="status" className={s.loading}>Opening the oracle’s library…</p> : manifest.error ? <div className={s.error} role="alert"><p>{errorMessage(manifest.error)}</p><button onClick={() => void manifest.refetch()} className={s.secondary}>Try again</button></div> : <>
            {stale && !error && <p role="status" className={s.note}>Your saved round belongs to an older or unreadable edition. Start fresh with today’s library.</p>}
            <button className={s.primary} onClick={restart} disabled={waiting}>Let’s begin <ArrowRight size={18} aria-hidden="true" /></button>
            <p className={s.fine}>No sign-in. No major spoilers. Just you and a book.</p>
          </>}
        </>}
        {state?.status === 'question' && <>
          <h1 key={state.question.id} ref={title} tabIndex={-1} className={s.question}>{state.question.prompt}</h1>
          <p className={s.hint}>Think about the book, rather than its film adaptation.</p>
          <div className={s.answers} aria-label="Your answer">{manifest.data?.choices.map((choice) => <button key={choice.id} type="button" onClick={() => answer(choice.id)} disabled={waiting} className={choice.id === 'yes' || choice.id === 'no' ? s.definite : undefined}>{choice.label}<ArrowRight size={17} aria-hidden="true" /></button>)}</div>
        </>}
        {(state?.status === 'guess' || state?.status === 'success') && <>
          <p className={s.guessLabel}>{state.status === 'success' ? 'The story you were thinking of' : 'Is this your book?'}</p>
          <h1 ref={title} tabIndex={-1} className={s.bookTitle}>{state.book.title}</h1>
          <p className={s.author}>{state.book.author}</p>
          <p className={s.explanation}>{state.book.explanation}</p>
          {state.status === 'guess' ? <div className={s.confirmation}><button className={s.primary} onClick={() => confirm(true)} disabled={waiting}><Check size={18} aria-hidden="true" /> That’s my book</button><button className={s.secondary} onClick={() => confirm(false)} disabled={waiting}>Keep looking</button></div> : <>
            <p className={s.success}>Found in {state.question_count} questions. You brought the story; I followed the clues.</p>
            <button className={s.primary} onClick={restart} disabled={waiting}>Think of another book <ArrowClockwise size={18} aria-hidden="true" /></button>
          </>}
          {state.book.shop_slug && <Link className={s.bookLink} to={`/books/${state.book.shop_slug}`}>Find it on our shelves <ArrowRight size={16} aria-hidden="true" /></Link>}
        </>}
        {state?.status === 'defeat' && <>
          <h1 ref={title} tabIndex={-1}>You’ve outwitted<br /><span>the oracle.</span></h1>
          <p className={s.lead}>{state.message}</p>
          <button className={s.primary} onClick={restart} disabled={waiting}>Try another book <ArrowClockwise size={18} aria-hidden="true" /></button>
        </>}
        <p className={s.requestStatus} role="status" aria-live="polite">{busy ? 'Following your clues…' : ''}</p>
        {error != null && <div className={s.error} role="alert"><p>{errorMessage(error)}</p>{needsFreshStart ? <button onClick={() => { void manifest.refetch(); restart() }} className={s.secondary}>Start a fresh round</button> : <><p>Your last confirmed answer is safe.</p><button className={s.secondary} onClick={() => setAttempt((n) => n + 1)}>Retry</button></>}</div>}
        {state && <div className={s.controls}>
          <button className={s.textButton} onClick={() => setPending(events.slice(0, -1))} disabled={busy || events.length === 0}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          <span>{state.question_count} {state.question_count === 1 ? 'answer' : 'answers'}{state.guess_count > 0 ? ` · ${state.guess_count} ${state.guess_count === 1 ? 'guess' : 'guesses'}` : ''}</span>
          <button className={s.textButton} onClick={restart} disabled={busy}><ArrowClockwise size={16} aria-hidden="true" /> Restart</button>
        </div>}
        {storageUnavailable && <p role="status" className={s.note}>You can keep playing. This browser can’t save the round, so refreshing may start a new game.</p>}
      </section>
    </div>
    <div className={s.bottomNote}><span>Stories, not mind reading.</span><p>I follow your clues through a library of {manifest.data?.library_size ?? 100} books. Sometimes the mystery wins.</p></div>
  </div>
}
