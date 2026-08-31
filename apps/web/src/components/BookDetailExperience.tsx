import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Feather, HandSwipeLeft, Sailboat, ShoppingBag, Star } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { money } from '../api'
import type { Book } from '../types'
import BookSlider, { type BookSliderHandle, type BookSliderState } from './ui/book-slider'
import s from './BookDetailExperience.module.css'

type Props = {
  book: Book
  adding: boolean
  notice: string
  onAdd: () => void
}

type MobileDragState = {
  pointerId: number
  startX: number
  startY: number
  startTime: number
  horizontal: boolean
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function firstSentence(description: string) {
  const sentence = description.trim().match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? description.trim()
  return sentence.length <= 280 ? sentence : `${sentence.slice(0, 277).trimEnd()}…`
}

function Rating({ book }: { book: Book }) {
  const filled = Math.round(book.rating_average)
  return <div className={s.rating} aria-label={`${book.rating_average.toFixed(1)} out of 5 from ${book.rating_count} rating${book.rating_count === 1 ? '' : 's'}`}>
    <span aria-hidden="true">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={15} weight={value <= filled ? 'fill' : 'regular'} />)}</span>
    <small>{book.rating_average.toFixed(1)} · {book.rating_count}</small>
  </div>
}

function Authors({ book, focusable = true }: { book: Book; focusable?: boolean }) {
  return <>{book.authors.map((author, index) => <span key={author.id}>
    {index > 0 && ', '}
    <Link to={`/authors/${author.slug}`} tabIndex={focusable ? undefined : -1}>{author.name}</Link>
  </span>)}</>
}

function BookFacts({ book }: { book: Book }) {
  return <dl className={s.facts}>
    <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>
    <div><dt>Edition</dt><dd>Paperback</dd></div>
    <div><dt>Availability</dt><dd>{book.available ? `${book.stock_qty} in stock` : 'Returning soon'}</dd></div>
  </dl>
}

function TitlePage({ book, focusable = true }: { book: Book; focusable?: boolean }) {
  return <div className={s.titlePageContent} data-page-copy>
    <p className={s.kicker}>{book.genres.map((genre) => genre.name).join(' · ')} · {book.publication_year}</p>
    <div>
      <h1>{book.title}</h1>
      <p className={s.byline}>by <Authors book={book} focusable={focusable} /></p>
      <Rating book={book} />
    </div>
    <div className={s.editionMark} aria-hidden="true">
      <span><Sailboat size={54} weight="thin" /></span>
    </div>
    <small className={s.imprint}>Orphaleia · Independent booksellers</small>
  </div>
}

function QuotePage({ book, quote }: { book: Book; quote: string }) {
  return <div className={s.quotePageContent} data-page-copy>
    <div className={s.quoteMark} aria-hidden="true"><Feather size={82} weight="thin" /></div>
    <blockquote>“{quote}”</blockquote>
    <p>— {book.authors.map((author) => author.name).join(', ')}</p>
  </div>
}

function DetailsPage({ book }: { book: Book }) {
  return <div className={s.detailsPageContent} data-page-copy>
    <p className={s.kicker}>Inside this edition</p>
    <h2>About the book</h2>
    <p className={s.description}>{book.description}</p>
    <BookFacts book={book} />
    <div className={s.pagePrice}>
      <strong>{money(book.price_cents, book.currency)}</strong>
      <span>VAT included</span>
    </div>
  </div>
}

export function BookDetailExperience({ book, adding, notice, onAdd }: Props) {
  const flipBookRef = useRef<BookSliderHandle>(null)
  const pendingFocusRef = useRef<(() => void) | null>(null)
  const mobileDragRef = useRef<MobileDragState | null>(null)
  const previousSpreadRef = useRef<HTMLButtonElement>(null)
  const nextSpreadRef = useRef<HTMLButtonElement>(null)
  const previousPageRef = useRef<HTMLButtonElement>(null)
  const nextPageRef = useRef<HTMLButtonElement>(null)
  const [spread, setSpread] = useState<0 | 1>(0)
  const [pageTurning, setPageTurning] = useState(false)
  const [mobilePage, setMobilePage] = useState(0)
  const [mobileDragging, setMobileDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const pullQuote = useMemo(() => book.pull_quote || firstSentence(book.description), [book.description, book.pull_quote])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    setSpread(0)
    setMobilePage(0)
    setPageTurning(false)
    flipBookRef.current?.turnToPage(0)
  }, [book.id])

  function settleSpread(target: 0 | 1, focusAfter?: () => void) {
    if (target === spread) {
      requestAnimationFrame(() => focusAfter?.())
      return
    }
    pendingFocusRef.current = focusAfter ?? null
    const bookApi = flipBookRef.current
    if (!bookApi) {
      setSpread(target)
      requestAnimationFrame(() => pendingFocusRef.current?.())
      pendingFocusRef.current = null
      return
    }
    if (reducedMotion) {
      bookApi.turnToPage(target * 2)
      setSpread(target)
      requestAnimationFrame(() => pendingFocusRef.current?.())
      pendingFocusRef.current = null
      return
    }
    bookApi.flipToPage(target * 2, 'bottom')
  }

  function handlePageChange(page: number) {
    setSpread(page >= 2 ? 1 : 0)
    requestAnimationFrame(() => pendingFocusRef.current?.())
    pendingFocusRef.current = null
  }

  function handlePageState(state: BookSliderState) {
    setPageTurning(state !== 'read')
  }

  function goMobilePage(nextPage: number, focusAfter?: () => void) {
    setMobilePage(clamp(nextPage, 0, 3))
    requestAnimationFrame(() => focusAfter?.())
  }

  function beginMobileDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    mobileDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: performance.now(), horizontal: false }
    setMobileDragging(true)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic pointer events may not own capture. */ }
  }

  function moveMobileDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mobileDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) drag.horizontal = true
    if (!drag.horizontal) return
    event.preventDefault()
    const atBoundary = (mobilePage === 0 && dx > 0) || (mobilePage === 3 && dx < 0)
    event.currentTarget.style.setProperty('--mobile-drag', `${atBoundary ? dx * 0.2 : dx}px`)
  }

  function endMobileDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = mobileDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const velocity = dx / Math.max(1, performance.now() - drag.startTime)
    const threshold = Math.max(58, event.currentTarget.clientWidth * 0.2)
    const shouldMove = !cancelled && drag.horizontal && (Math.abs(dx) >= threshold || Math.abs(velocity) >= 0.45)
    mobileDragRef.current = null
    setMobileDragging(false)
    if (shouldMove) goMobilePage(mobilePage + (dx < 0 ? 1 : -1))
    requestAnimationFrame(() => event.currentTarget.style.setProperty('--mobile-drag', '0px'))
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      void settleSpread(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      void settleSpread(0)
    }
  }

  const purchaseButton = <button className={s.purchaseButton} type="button" disabled={!book.available || adding} onClick={onAdd}>
    <ShoppingBag size={18} weight="bold" aria-hidden="true" />
    {adding ? 'Adding…' : book.available ? 'Add to bag' : 'Out of stock'}
    {book.available && !adding && <ArrowRight size={17} aria-hidden="true" />}
  </button>

  return <section className={s.experience} aria-label={`Interactive preview of ${book.title}`}>
    <div className={s.intro}>
      <p>Open the cover. Meet the story.</p>
      <span><HandSwipeLeft size={18} aria-hidden="true" /> Drag the page or use the controls</span>
    </div>

    <div className={s.desktopExperience}>
      <div
        className={s.bookStage}
        data-testid="book-spread"
        data-spread={spread + 1}
        data-dragging={pageTurning}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <span className={s.pageBlockRight} aria-hidden="true" />
        <span className={s.pageBlockBottom} data-testid="book-page-block-bottom" aria-hidden="true" />
        <BookSlider
          key={book.id}
          ref={flipBookRef}
          className={s.flipBook}
          testId="turning-leaf"
          reducedMotion={reducedMotion}
          onPageChange={handlePageChange}
          onInteractionStateChange={handlePageState}
        >
          <article className={`${s.flipPage} ${s.coverPage}`} aria-hidden={spread === 1}>
            <img src={book.cover_url} alt={`Cover of ${book.title}`} width="720" height="1080" fetchPriority="high" />
            {book.featured && <span>Keeper’s choice</span>}
          </article>
          <article className={`${s.flipPage} ${s.titleFlipPage}`} aria-hidden={spread === 1}>
            <TitlePage book={book} focusable={spread === 0} />
          </article>
          <article className={`${s.flipPage} ${s.quoteFlipPage}`} aria-hidden={spread === 0}><QuotePage book={book} quote={pullQuote} /></article>
          <article className={`${s.flipPage} ${s.detailsPage}`} aria-hidden={spread === 0}><DetailsPage book={book} /></article>
        </BookSlider>
        <span className={s.spine} aria-hidden="true" />
      </div>
      <div className={s.desktopFooter}>
        <nav className={s.spreadControls} aria-label="Book spreads">
          <button ref={previousSpreadRef} type="button" aria-label="Previous spread" disabled={spread === 0} onClick={() => void settleSpread(0, () => nextSpreadRef.current?.focus())}><ArrowLeft size={18} aria-hidden="true" /></button>
          <span>Spread {spread + 1} of 2</span>
          <button ref={nextSpreadRef} type="button" aria-label="Next spread" disabled={spread === 1} onClick={() => void settleSpread(1, () => previousSpreadRef.current?.focus())}><ArrowRight size={18} aria-hidden="true" /></button>
        </nav>
        <div className={s.purchaseDock}>
          <div><strong>{money(book.price_cents, book.currency)}</strong><span>{book.available ? `${book.stock_qty} in stock` : 'Returning soon'} · VAT included</span></div>
          {purchaseButton}
        </div>
      </div>
    </div>

    <div className={s.mobileExperience}>
      <div
        className={s.mobileViewport}
        data-testid="mobile-book-pages"
        data-page={mobilePage + 1}
        data-dragging={mobileDragging}
        style={{ '--mobile-page': mobilePage, '--mobile-drag': '0px' } as CSSProperties}
        onPointerDown={beginMobileDrag}
        onPointerMove={moveMobileDrag}
        onPointerUp={(event) => endMobileDrag(event)}
        onPointerCancel={(event) => endMobileDrag(event, true)}
      >
        <span className={s.mobilePageBlock} aria-hidden="true" />
        <div className={s.mobileTrack}>
          <article className={`${s.mobilePage} ${s.mobileCover}`} aria-hidden={mobilePage !== 0}><img src={book.cover_url} alt={`Cover of ${book.title}`} width="720" height="1080" /></article>
          <article className={s.mobilePage} aria-hidden={mobilePage !== 1}>
            <TitlePage book={book} focusable={mobilePage === 1} />
            <span className={`${s.pageCorner} ${s.mobileCorner}`} aria-hidden="true" />
          </article>
          <article className={s.mobilePage} aria-hidden={mobilePage !== 2}><QuotePage book={book} quote={pullQuote} /></article>
          <article className={s.mobilePage} aria-hidden={mobilePage !== 3}><DetailsPage book={book} /></article>
        </div>
      </div>
      <nav className={s.mobileControls} aria-label="Book pages">
        <button ref={previousPageRef} type="button" aria-label="Previous page" disabled={mobilePage === 0} onClick={() => goMobilePage(mobilePage - 1, mobilePage === 1 ? () => nextPageRef.current?.focus() : undefined)}><ArrowLeft size={18} aria-hidden="true" /></button>
        <span>Page {mobilePage + 1} of 4</span>
        <button ref={nextPageRef} type="button" aria-label="Next page" disabled={mobilePage === 3} onClick={() => goMobilePage(mobilePage + 1, mobilePage === 2 ? () => previousPageRef.current?.focus() : undefined)}><ArrowRight size={18} aria-hidden="true" /></button>
      </nav>
      <div className={s.mobilePurchase}>
        <div><strong>{money(book.price_cents, book.currency)}</strong><span>{book.available ? 'In stock' : 'Returning soon'} · VAT included</span></div>
        {purchaseButton}
      </div>
    </div>

    <p className={`${s.srOnly} ${s.desktopAnnouncement}`} role="status" aria-live="polite">{`Showing ${spread === 0 ? 'spread 1 of 2, cover and title' : 'spread 2 of 2, quote and description'}.`}</p>
    <p className={`${s.srOnly} ${s.mobileAnnouncement}`} role="status" aria-live="polite">{`Showing page ${mobilePage + 1} of 4.`}</p>
    {notice && <div className={s.notice} role="status" aria-live="polite">{notice}</div>}
  </section>
}
