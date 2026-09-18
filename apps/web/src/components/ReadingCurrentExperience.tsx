import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Compass, Copy, Repeat, ShareNetwork, SignIn, Sparkle, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiRequestError, errorMessage, money } from '../api'
import { trackAnalytics } from '../analytics'
import type {
  ReadingCurrentAnswer,
  ReadingCurrentIntro,
  ReadingCurrentResult,
  ReadingCurrentShare,
  ReadingCurrentStep,
  ReadingCurrentQuestion,
  User,
} from '../types'
import { PageMeta } from './PageMeta'
import { ErrorState, RouteState as State } from './ui/RouteState'
import s from './ReadingCurrentExperience.module.css'

const STORAGE_KEY = 'orphaleia:reading-current'
const GUEST_SHARES_KEY = 'orphaleia:reading-current:guest-shares'

const scenes = {
  'moonlit-harbor': { name: 'Moonlit Harbor', alt: 'A moonlit literary harbor where ships with pages for sails wait beside a stone quay.' },
  'doorway-archive': { name: 'Doorway Archive', alt: 'A grand circular library with four open doorways leading into different story worlds.' },
  'forked-forest': { name: 'Forked Forest', alt: 'A lantern-lit forest where four paths lead toward wonder, mystery, mountains, and moonlight.' },
  'distant-lighthouse': { name: 'Distant Lighthouse', alt: 'A small sailing boat crossing a star-lit sea toward a lighthouse built upon enormous books.' },
} as const

type SceneName = keyof typeof scenes
type StoredVoyage = { version: string; answers: ReadingCurrentAnswer[]; result?: ReadingCurrentResult }
type GuestShare = ReadingCurrentShare & { revoke_token: string }

function sceneSources(scene: SceneName) {
  const root = `/assets/reading-current/${scene}`
  return {
    src: `${root}-1280.webp`,
    srcSet: `${root}-768.webp 768w, ${root}-1280.webp 1280w, ${root}-1536.webp 1536w`,
  }
}

function readStoredVoyage(): StoredVoyage | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredVoyage | null
  } catch {
    return null
  }
}

function rememberGuestShare(share: GuestShare) {
  try {
    const existing = JSON.parse(localStorage.getItem(GUEST_SHARES_KEY) || '[]') as GuestShare[]
    localStorage.setItem(GUEST_SHARES_KEY, JSON.stringify([share, ...existing.filter((item) => item.id !== share.id)].slice(0, 12)))
  } catch {
    localStorage.setItem(GUEST_SHARES_KEY, JSON.stringify([share]))
  }
}

function latestGuestShare(): GuestShare | null {
  try {
    const shares = JSON.parse(localStorage.getItem(GUEST_SHARES_KEY) || '[]') as GuestShare[]
    const now = Date.now()
    return shares.find((item) => item.revoke_token && new Date(item.expires_at).getTime() > now) ?? null
  } catch {
    return null
  }
}

function forgetGuestShare(shareId: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(GUEST_SHARES_KEY) || '[]') as GuestShare[]
    localStorage.setItem(GUEST_SHARES_KEY, JSON.stringify(existing.filter((item) => item.id !== shareId)))
  } catch {
    localStorage.removeItem(GUEST_SHARES_KEY)
  }
}

function Scene({ scene, priority = false }: { scene: SceneName; priority?: boolean }) {
  const source = sceneSources(scene)
  return <figure className={s.scene}>
    <img {...source} sizes="(max-width: 840px) 100vw, 48vw" alt={scenes[scene].alt} width="1536" height="1024" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" />
    <figcaption><Compass size={15} aria-hidden="true" /> {scenes[scene].name}</figcaption>
  </figure>
}

function ResultBooks({ result }: { result: ReadingCurrentResult }) {
  return <section className={s.recommendations} aria-labelledby="current-books-title">
    <div className={s.sectionHeading}><span>THREE BOOKS IN YOUR CURRENT</span><h2 id="current-books-title">Begin with one of these</h2><p>Availability never changes the match. If a book is away from the shelf, you can still keep it on your horizon.</p></div>
    <div className={s.bookGrid}>{result.books.map((book, index) => <article className={s.book} key={book.id}>
      <Link to={`/books/${book.slug}`} onClick={() => trackAnalytics('reading_current_recommendation_clicked', { destination: 'book', position: index + 1 })}>
        <span className={s.cover}><img src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy" /></span>
        <span className={s.bookCopy}><small>{book.genres.map((genre) => genre.name).join(' · ')}</small><h3>{book.title}</h3><p>{book.authors.map((author) => author.name).join(', ')}</p><strong>{money(book.price_cents, book.currency)}</strong><em data-available={book.available || undefined}>{book.available ? 'Available now' : 'Currently out of stock'}</em></span>
      </Link>
    </article>)}</div>
  </section>
}

function ResultTableau({ result, sharedBy }: { result: ReadingCurrentResult; sharedBy?: string | null }) {
  return <>
    <section className={s.resultHero} aria-labelledby="reading-current-result-title">
      <picture className={s.resultArt}>
        <source srcSet="/assets/reading-current/reading-current-result-768.webp 768w, /assets/reading-current/reading-current-result-1280.webp 1280w, /assets/reading-current/reading-current-result-1536.webp 1536w" sizes="100vw" />
        <img src="/assets/reading-current/reading-current-result-1280.webp" alt="An open book and compass beneath a constellation map of many reading paths." width="1536" height="1024" decoding="async" />
      </picture>
      <div className={s.resultCard}>
        <span className={s.kicker}>{sharedBy ? `${sharedBy} found their current` : 'YOUR READING CURRENT'}</span>
        <h1 id="reading-current-result-title" tabIndex={-1}>{result.primary_genre.name}</h1>
        <p className={s.archetype}><Sparkle size={17} weight="fill" aria-hidden="true" /> {result.archetype.name}</p>
        <p className={s.explanation}>{result.explanation}</p>
        <p className={s.archetypeNote}>{result.archetype.description}</p>
        <div className={s.traits} aria-label="Your strongest reading preferences">{result.traits.map((trait) => <span key={trait}>{trait}</span>)}</div>
        <div className={s.nearby}><span>NEARBY SHORES</span>{result.related_genres.map((genre, index) => <Link key={genre.id} to={`/genres/${genre.slug}`} onClick={() => trackAnalytics('reading_current_recommendation_clicked', { destination: 'genre', position: index + 2 })}>{genre.name}<ArrowRight size={14} aria-hidden="true" /></Link>)}</div>
        <Link className={s.primaryAction} to={`/genres/${result.primary_genre.slug}`} onClick={() => trackAnalytics('reading_current_recommendation_clicked', { destination: 'genre', position: 1 })}>Explore your shelf <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
    <ResultBooks result={result} />
  </>
}

export function ReadingCurrentExperience({ user, source = 'direct' }: { user: User | null; source?: string }) {
  const queryClient = useQueryClient()
  const intro = useQuery({ queryKey: ['reading-current', 'intro'], queryFn: () => api<ReadingCurrentIntro>('/reading-current') })
  const [started, setStarted] = useState(false)
  const [answers, setAnswers] = useState<ReadingCurrentAnswer[]>([])
  const [question, setQuestion] = useState<ReadingCurrentQuestion | null>(null)
  const [selected, setSelected] = useState('')
  const [result, setResult] = useState<ReadingCurrentResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [journeyError, setJourneyError] = useState<unknown>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [share, setShare] = useState<GuestShare | ReadingCurrentShare | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState<unknown>(null)
  const [shareNotice, setShareNotice] = useState('')
  const [includeName, setIncludeName] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const questionPanelRef = useRef<HTMLDivElement>(null)
  const restored = useRef(false)
  const savedCompletion = useRef('')
  const trackedCompletion = useRef('')

  useEffect(() => {
    if (!intro.data || restored.current) return
    restored.current = true
    const stored = readStoredVoyage()
    if (!stored || stored.version !== intro.data.version) {
      localStorage.removeItem(STORAGE_KEY)
      setQuestion(intro.data.first_question)
      return
    }
    setStarted(Boolean(stored.answers.length || stored.result))
    setAnswers(stored.answers)
    if (stored.result) {
      setResult(stored.result)
      return
    }
    if (!stored.answers.length) {
      setQuestion(intro.data.first_question)
      return
    }
    setBusy(true)
    api<ReadingCurrentStep>('/reading-current/step', { method: 'POST', body: JSON.stringify({ version: stored.version, answers: stored.answers }) })
      .then((next) => next.status === 'complete' ? setResult(next.result) : setQuestion(next.question))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        setAnswers([])
        setStarted(false)
        setQuestion(intro.data.first_question)
      })
      .finally(() => setBusy(false))
  }, [intro.data])

  useEffect(() => {
    if (!intro.data) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: intro.data.version, answers, ...(result ? { result } : {}) }))
  }, [answers, intro.data, result])

  useEffect(() => {
    if (!question) return
    const focusFrame = requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch { /* jsdom has no scrolling surface */ }
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      headingRef.current?.focus({ preventScroll: true })
    })
    const sequence: SceneName[] = ['moonlit-harbor', 'doorway-archive', 'forked-forest', 'distant-lighthouse']
    const nextScene = sequence[sequence.indexOf(question.scene) + 1]
    if (nextScene) {
      const image = new Image()
      image.src = sceneSources(nextScene).src
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => cancelAnimationFrame(focusFrame)
    }
    let cancelled = false
    let animation: { kill: () => void } | undefined
    void import('gsap').then(({ default: gsap }) => {
      if (cancelled || !questionPanelRef.current) return
      animation = gsap.fromTo(questionPanelRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .48, ease: 'power3.out' })
    })
    return () => {
      cancelAnimationFrame(focusFrame)
      cancelled = true
      animation?.kill()
    }
  }, [question, started])

  useEffect(() => {
    if (!result) return
    const focusFrame = requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch { /* jsdom has no scrolling surface */ }
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      document.getElementById('reading-current-result-title')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [result])

  async function saveResult() {
    if (!user || !intro.data || !result) return
    setSaveState('saving')
    try {
      await api('/users/me/reading-current', { method: 'PUT', body: JSON.stringify({ version: intro.data.version, answers }) })
      savedCompletion.current = `${user.id}:${result.completed_at}`
      setSaveState('saved')
      void queryClient.invalidateQueries({ queryKey: ['reading-current', 'account'] })
    } catch {
      setSaveState('failed')
    }
  }

  useEffect(() => {
    if (!user || !result) return
    const completion = `${user.id}:${result.completed_at}`
    if (savedCompletion.current === completion || saveState === 'saving') return
    void saveResult()
  // saveResult is intentionally triggered only by a new completed result or signed-in reader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.completed_at, user?.id])

  useEffect(() => {
    if (!result || trackedCompletion.current === result.completed_at) return
    trackedCompletion.current = result.completed_at
    trackAnalytics('reading_current_completed', { archetype: result.archetype.id, primary_genre: result.primary_genre.slug })
  }, [result])

  useEffect(() => {
    if (!user && result && !share) setShare(latestGuestShare())
  }, [result, share, user])

  function begin() {
    if (!intro.data) return
    setStarted(true)
    setQuestion(intro.data.first_question)
    trackAnalytics('reading_current_started', { source })
  }

  async function advance() {
    if (!intro.data || !question || !selected) return
    const nextAnswers = [...answers, { question_id: question.id, answer_id: selected }]
    setBusy(true); setJourneyError(null)
    try {
      const next = await api<ReadingCurrentStep>('/reading-current/step', { method: 'POST', body: JSON.stringify({ version: intro.data.version, answers: nextAnswers }) })
      setAnswers(nextAnswers)
      setSelected('')
      if (next.status === 'complete') {
        setQuestion(null)
        setResult(next.result)
      } else setQuestion(next.question)
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        localStorage.removeItem(STORAGE_KEY)
        setAnswers([])
        setQuestion(intro.data.first_question)
      }
      setJourneyError(error)
    } finally {
      setBusy(false)
    }
  }

  async function goBack() {
    if (!intro.data) return
    if (!answers.length) {
      setStarted(false)
      return
    }
    const prior = answers[answers.length - 1]
    const previousAnswers = answers.slice(0, -1)
    setBusy(true); setJourneyError(null); setResult(null)
    try {
      if (!previousAnswers.length) {
        setQuestion(intro.data.first_question)
      } else {
        const previous = await api<ReadingCurrentStep>('/reading-current/step', { method: 'POST', body: JSON.stringify({ version: intro.data.version, answers: previousAnswers }) })
        if (previous.status === 'question') setQuestion(previous.question)
      }
      setAnswers(previousAnswers)
      setSelected(prior.answer_id)
    } catch (error) {
      setJourneyError(error)
    } finally {
      setBusy(false)
    }
  }

  function retake() {
    if (!intro.data) return
    localStorage.removeItem(STORAGE_KEY)
    setAnswers([]); setResult(null); setQuestion(intro.data.first_question); setSelected(''); setShare(null); setShareError(null); setShareNotice(''); setSaveState('idle'); setStarted(true)
    requestAnimationFrame(() => headingRef.current?.focus())
  }

  async function createShare() {
    if (!intro.data || !result) return
    setShareBusy(true); setShareError(null); setShareNotice('')
    try {
      const created = user
        ? await api<ReadingCurrentShare>('/users/me/reading-current/shares', { method: 'POST', body: JSON.stringify({ include_display_name: includeName }) })
        : await api<GuestShare>('/reading-current/shares', { method: 'POST', body: JSON.stringify({ version: intro.data.version, answers }) })
      setShare(created)
      if (!user) rememberGuestShare(created as GuestShare)
      trackAnalytics('reading_current_shared', { account_state: user ? 'member' : 'guest', named: Boolean(user && includeName) })
    } catch (error) {
      setShareError(error)
    } finally {
      setShareBusy(false)
    }
  }

  async function copyShare() {
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      setShareNotice('Share link copied.')
    } catch {
      setShareNotice('Select the link and copy it from your browser.')
    }
  }

  async function revokeShare() {
    if (!share) return
    setShareBusy(true); setShareError(null)
    try {
      if (user) await api(`/users/me/reading-current/shares/${share.id}`, { method: 'DELETE' })
      else {
        const token = new URL(share.url).pathname.split('/').pop()
        await api(`/reading-current/shares/${token}`, { method: 'DELETE', headers: { 'X-Share-Revoke-Token': (share as GuestShare).revoke_token } })
        forgetGuestShare(share.id)
      }
      setShare(null)
      setShareNotice('That public link has been revoked.')
      void queryClient.invalidateQueries({ queryKey: ['reading-current', 'account'] })
    } catch (error) {
      setShareError(error)
    } finally {
      setShareBusy(false)
    }
  }

  if (intro.isLoading) return <State title="Charting the reading currents…" loading viewport />
  if (intro.error) return <ErrorState error={intro.error} retry={() => void intro.refetch()} viewport />

  if (result) return <div className={s.page}>
    <PageMeta title="Your Reading Current" description="Your personal Orphaleia reading current and book recommendations." canonicalPath="/reading-current" />
    <ResultTableau result={result} />
    <section className={s.resultActions} aria-labelledby="keep-current-title">
      <div><span className={s.kicker}>KEEP THIS CURRENT</span><h2 id="keep-current-title">Return, share, or set sail again</h2>
        {user ? <p role="status" aria-live="polite">{saveState === 'saving' ? 'Saving to your account…' : saveState === 'saved' ? 'Saved to your account.' : saveState === 'failed' ? 'Your result is safe on this device, but account saving failed.' : 'Your result remains on this device.'}</p> : <p>Your result is saved on this device. Sign in only if you want it carried into your account.</p>}
        {saveState === 'failed' && <button className={s.textAction} type="button" onClick={() => void saveResult()}>Try account save again</button>}
      </div>
      <div className={s.actionStack}>
        {user && <label className={s.nameConsent}><input type="checkbox" checked={includeName} onChange={(event) => setIncludeName(event.target.checked)} /> Include my display name on a new public link</label>}
        {!share ? <button className={s.shareButton} type="button" disabled={shareBusy || Boolean(user && saveState !== 'saved')} onClick={() => void createShare()}><ShareNetwork size={18} aria-hidden="true" /> {shareBusy ? 'Creating link…' : user && saveState !== 'saved' ? 'Save before sharing' : 'Create a share link'}</button> : <div className={s.sharePanel}>
          <label htmlFor="reading-current-share">Your public link</label><div><input id="reading-current-share" readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyShare()} aria-label="Copy public share link"><Copy size={18} aria-hidden="true" /></button></div>
          <button className={s.revokeButton} type="button" disabled={shareBusy} onClick={() => void revokeShare()}><Trash size={16} aria-hidden="true" /> Revoke this link</button>
        </div>}
        {shareNotice && <p className={s.notice} role="status">{shareNotice}</p>}
        {Boolean(shareError) && <p className={s.error} role="alert">{errorMessage(shareError)}</p>}
        {!user && <Link className={s.secondaryAction} to="/sign-in" state={{ from: '/reading-current', saveReadingCurrent: true }}><SignIn size={18} aria-hidden="true" /> Sign in to save this current</Link>}
        <button className={s.textAction} type="button" onClick={retake}><Repeat size={17} aria-hidden="true" /> Retake the voyage</button>
      </div>
    </section>
  </div>

  if (!started) return <div className={`${s.page} ${s.introPage}`}>
    <PageMeta title="Find Your Reading Current" description="Answer eight illustrated questions and discover the Orphaleia genres and books closest to you." canonicalPath="/reading-current" />
    <section className={s.intro} aria-labelledby="reading-current-title">
      <Scene scene="moonlit-harbor" priority />
      <div className={s.introCopy}><span className={s.kicker}>A TWO-MINUTE READING VOYAGE</span><h1 id="reading-current-title">Find Your Reading Current</h1><p>{intro.data?.introduction}</p><ul><li><Check size={16} aria-hidden="true" /> Exactly eight choices</li><li><Check size={16} aria-hidden="true" /> No wrong or noble answers</li><li><Check size={16} aria-hidden="true" /> Three books waiting at the end</li></ul><button className={s.primaryAction} type="button" onClick={begin}>Set sail <ArrowRight size={17} aria-hidden="true" /></button><small>Your progress stays in this browser. There is no timer.</small></div>
    </section>
  </div>

  return <div className={`${s.page} ${s.questionPage}`}>
    <PageMeta title="Find Your Reading Current" description="An illustrated eight-question reading voyage from Orphaleia." canonicalPath="/reading-current" />
    {question && <section className={s.questionLayout} key={question.id}>
      <Scene scene={question.scene} priority={question.step === 1} />
      <div ref={questionPanelRef} className={s.questionPanel} aria-busy={busy || undefined}>
        <div className={s.progress}><span>QUESTION {question.step} OF 8</span><span>{scenes[question.scene].name}</span></div>
        <form onSubmit={(event) => { event.preventDefault(); void advance() }}>
          <fieldset disabled={busy}>
            <legend><h1 ref={headingRef} tabIndex={-1}>{question.prompt}</h1></legend>
            <p className={s.hint}>{question.hint}</p>
            <div className={s.choices}>{question.answers.map((choice) => <label key={choice.id} className={s.choice} data-selected={selected === choice.id || undefined}>
              <input type="radio" name={question.id} value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} />
              <span className={s.choiceMark}><Check size={15} weight="bold" aria-hidden="true" /></span><span><b>{choice.label}</b><small>{choice.description}</small></span>
            </label>)}</div>
          </fieldset>
          {Boolean(journeyError) && <p className={s.error} role="alert">{errorMessage(journeyError)}</p>}
          <div className={s.questionActions}><button className={s.backButton} type="button" onClick={() => void goBack()} disabled={busy}><ArrowLeft size={17} aria-hidden="true" /> Back</button><button className={s.primaryAction} disabled={!selected || busy}>{busy ? 'Reading the current…' : question.step === 8 ? 'Reveal my current' : 'Continue'} <ArrowRight size={17} aria-hidden="true" /></button></div>
        </form>
        <p className={s.srStatus} aria-live="polite">{busy ? 'Loading the next question' : `Question ${question.step} of 8`}</p>
      </div>
    </section>}
  </div>
}

export function ReadingCurrentShared() {
  const { token = '' } = useParams()
  const shared = useQuery({ queryKey: ['reading-current', 'share', token], queryFn: () => api<{ result: ReadingCurrentResult; display_name: string | null; expires_at: string }>(`/reading-current/shares/${token}`), retry: false })
  return <div className={s.page}>
    <PageMeta title="A Shared Reading Current" description="A reader has shared an Orphaleia reading current." canonicalPath={null} noIndex />
    {shared.isLoading ? <State title="Following the shared current…" loading viewport /> : shared.error ? <section className={s.unavailable}>
      <Compass size={38} aria-hidden="true" /><span className={s.kicker}>THE TIDE HAS TURNED</span><h1>{shared.error instanceof ApiRequestError && shared.error.status === 410 ? 'This current has moved on' : 'This current could not be found'}</h1><p>Shared voyages are private by design once they expire or are revoked.</p><Link className={s.primaryAction} to="/reading-current">Start your own voyage <ArrowRight size={17} aria-hidden="true" /></Link>
    </section> : shared.data && <><ResultTableau result={shared.data.result} sharedBy={shared.data.display_name} /><div className={s.sharedCta}><div><span className={s.kicker}>YOUR TURN AT THE HARBOR</span><h2>No two readers take the same route.</h2><p>Eight choices are enough to find the shelf already calling your name.</p></div><Link className={s.primaryAction} to="/reading-current">Start your own voyage <ArrowRight size={17} aria-hidden="true" /></Link></div></>}
  </div>
}
