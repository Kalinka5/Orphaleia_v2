import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CaretRight, Check, Eye, EyeSlash, MagnifyingGlass, Pause, Play, Sparkle, Star } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, money } from './api'
import { PageMeta } from './components/PageMeta'
import { ErrorState, RouteState as State } from './components/ui/RouteState'
import { SelectControl, type SelectOption } from './components/ui/SelectControl'
import { CtaWithMarquee } from './components/ui/cta-with-marquee'
import { TestimonialsColumn, type Testimonial } from './components/ui/testimonials-columns-1'
import { getGenreIllustration, homepageGenreSlugs } from './genreIllustrations'
import { getLandingIllustration, orderHomepageBooks } from './landingIllustrations'
import type { Address, Author, Book, Cart, Genre, Order, Page, User } from './types'
import s from './styles.module.css'

type AuthValue = { user: User | null; loading: boolean; signOut: () => Promise<void>; refresh: () => Promise<void> }
const AuthContext = createContext<AuthValue>({ user: null, loading: true, signOut: async () => {}, refresh: async () => {} })
const useAuth = () => useContext(AuthContext)

function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/users/me').catch(() => null) })
  async function signOut() {
    await api('/auth/logout', { method: 'POST' })
    client.setQueryData(['me'], null)
    client.removeQueries({ queryKey: ['cart'] })
  }
  return <AuthContext.Provider value={{ user: query.data ?? null, loading: query.isPending, signOut, refresh: async () => { await query.refetch() } }}>{children}</AuthContext.Provider>
}

function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [menu, setMenu] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const previousPath = useRef(location.pathname)
  const cart = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: !!user })
  const count = cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const isAuthRoute = location.pathname === '/sign-in' || location.pathname === '/register'
  useEffect(() => {
    setMenu(false)
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true }))
    }
  }, [location.pathname])
  useEffect(() => {
    if (!menu) return
    navRef.current?.querySelector<HTMLElement>('a')?.focus()
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false)
        requestAnimationFrame(() => menuButtonRef.current?.focus())
      }
    }
    document.addEventListener('keydown', closeMenu)
    return () => document.removeEventListener('keydown', closeMenu)
  }, [menu])
  const routeMeta = getRouteMeta(location.pathname)
  return <>
    <PageMeta title={routeMeta.title} description={routeMeta.description} />
    <header className={`${s.header} ${location.pathname === '/' ? s.headerHome : ''} ${isAuthRoute ? s.headerAuth : ''}`}>
      <Link className={s.brand} to="/" aria-label="Orphaleia home">
        <span className={s.brandMark}><img src="/brand/orphaleia-mark.svg" alt="" /></span><span><b>Orphaleia</b><small>INDEPENDENT BOOKSELLERS</small></span>
      </Link>
      {isAuthRoute ? <>
        <Link className={s.authBack} to="/" aria-label="Back to shop"><ArrowLeft size={18} aria-hidden="true" /><span>Back</span></Link>
        <nav className={s.authNav} aria-label="Account page navigation">
          <Link to="/books">Browse books</Link>
          <Link className={s.authBag} to="/cart" aria-label={`Cart with ${count} items`}>Bag <span>{count}</span></Link>
        </nav>
      </> : <>
        <button ref={menuButtonRef} className={s.menuButton} onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="main-navigation" aria-label={menu ? 'Close navigation' : 'Open navigation'}>Menu</button>
        <nav ref={navRef} id="main-navigation" className={`${s.nav} ${menu ? s.navOpen : ''}`} aria-label="Main navigation" onClick={() => setMenu(false)}>
          <NavLink to="/books">All books</NavLink><NavLink to="/genres">Genres</NavLink><NavLink to="/authors">Authors</NavLink><NavLink to="/rankings">Yearly charts</NavLink>
        </nav>
        <div className={s.actions}>
          {user ? <><Link to="/account">{user.full_name.split(' ')[0]}</Link>{user.role === 'admin' && <Link to="/admin">Admin</Link>}<button className={s.textButton} onClick={() => void signOut()}>Sign out</button></> : <Link to="/sign-in">Sign in</Link>}
          <Link className={s.cartLink} to="/cart" aria-label={`Cart with ${count} items`}>Bag <span>{count}</span></Link>
        </div>
      </>}
    </header>
    <main id="main" tabIndex={-1} className={`${s.siteMain} ${isAuthRoute ? s.authMain : ''}`}>{children}</main>
    {!isAuthRoute && <footer className={s.footer}>
      <div className={s.footerLead}><div className={s.footerBrand}>Orphaleia</div><p>Independent bookselling for restless minds and unhurried shelves.</p></div>
      <div><b>Browse</b><Link to="/books">All books</Link><Link to="/rankings">Readers’ charts</Link><Link to="/genres">Collections</Link></div>
      <div><b>Elsewhere</b><Link to="/authors">Our authors</Link><Link to="/account">Your account</Link><span>Spain and EU delivery</span></div>
      <p className={s.copyright}>© 2026 Orphaleia. Built for the long read.</p>
    </footer>}
  </>
}

function getRouteMeta(pathname: string) {
  if (pathname === '/') return { title: 'Independent bookshop', description: 'Books for curious voyages, chosen with care by Orphaleia.' }
  if (pathname === '/books') return { title: 'All books', description: 'Search Orphaleia’s complete catalogue by title, author, genre, rating, and availability.' }
  if (pathname.startsWith('/books/')) return { title: 'Book details', description: 'Read about this Orphaleia edition, reader ratings, and related books.' }
  if (pathname === '/genres') return { title: 'Genres', description: 'Explore literary collections and follow a new reading current.' }
  if (pathname.startsWith('/genres/')) return { title: 'Genre collection', description: 'Browse books from this Orphaleia collection.' }
  if (pathname === '/authors') return { title: 'Authors', description: 'Follow the voices represented on Orphaleia’s shelves.' }
  if (pathname.startsWith('/authors/')) return { title: 'Author', description: 'Discover books by this Orphaleia author.' }
  if (pathname === '/rankings') return { title: 'Readers’ charts', description: 'Explore yearly book rankings from Orphaleia readers.' }
  if (pathname === '/sign-in') return { title: 'Sign in', description: 'Continue your Orphaleia reading journey.' }
  if (pathname === '/register') return { title: 'Create an account', description: 'Create an Orphaleia reader account.' }
  if (pathname.includes('password')) return { title: 'Account recovery', description: 'Recover access to your Orphaleia account.' }
  if (pathname === '/verify') return { title: 'Verify email', description: 'Verify your Orphaleia reader account.' }
  if (pathname === '/cart') return { title: 'Your bag', description: 'Review the books in your Orphaleia bag.' }
  if (pathname === '/checkout') return { title: 'Checkout', description: 'Choose delivery and complete your Orphaleia order.' }
  if (pathname === '/payment/return') return { title: 'Payment status', description: 'Review your Orphaleia payment status.' }
  if (pathname === '/account') return { title: 'Your account', description: 'View your Orphaleia reader account and orders.' }
  if (pathname.startsWith('/admin')) return { title: 'Shop admin', description: 'Manage the Orphaleia catalogue and orders.' }
  return { title: 'Page not found', description: 'This page could not be found at Orphaleia.' }
}

function RequireUser({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <State title="Checking your reader’s pass…" loading />
  if (!user) return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}
function Stars({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value)
  return <span className={s.stars} aria-label={`${value} out of 5 stars`}>{[0, 1, 2, 3, 4].map((index) => <Star key={index} size={14} weight={index < rounded ? 'fill' : 'regular'} aria-hidden="true" />)}{count !== undefined && <small>{value.toFixed(1)} · {count}</small>}</span>
}

const readerTestimonials: Testimonial[] = [
  {
    text: 'The recommendations feel like they came from a bookseller who actually listened. I have discovered three writers I would never have found on my own.',
    image: '/assets/testimonials/mara-vidal.webp',
    name: 'Mara Vidal',
    role: 'Reader in Valencia',
  },
  {
    text: 'Every parcel feels considered, from the edition chosen to the small note tucked inside. Orphaleia has made buying books feel personal again.',
    image: '/assets/testimonials/elias-moreau.webp',
    name: 'Elias Moreau',
    role: 'Reader in Lyon',
  },
  {
    text: 'I came for one novel and left with a reading path for the whole season. The collections make following an idea wonderfully easy.',
    image: '/assets/testimonials/nadia-clarke.webp',
    name: 'Nadia Clarke',
    role: 'Reader in London',
  },
  {
    text: 'A rare online shop that still has the warmth and point of view of an independent bookshop. I trust the shelf more than any algorithm.',
    image: '/assets/testimonials/sofia-ramos.webp',
    name: 'Sofia Ramos',
    role: 'Reader in Porto',
  },
  {
    text: 'The yearly charts led our book club to its liveliest conversation yet. Thoughtful curation, beautiful editions, and quick delivery.',
    image: '/assets/testimonials/jonas-berg.webp',
    name: 'Jonas Berg',
    role: 'Book-club host in Malmö',
  },
  {
    text: 'I love browsing by mood instead of category. It is the closest an online catalogue has come to the pleasure of wandering a real shelf.',
    image: '/assets/testimonials/leila-haddad.webp',
    name: 'Leila Haddad',
    role: 'Reader in Marseille',
  },
  {
    text: 'My order arrived in Madrid the next day, beautifully packed. The book itself was exactly the kind of quiet, strange novel I had been looking for.',
    image: '/assets/testimonials/tomas-ibarra.webp',
    name: 'Tomás Ibarra',
    role: 'Reader in Madrid',
  },
  {
    text: 'The catalogue is compact enough to feel edited and broad enough to keep surprising me. I never leave without adding something to my list.',
    image: '/assets/testimonials/camille-laurent.webp',
    name: 'Camille Laurent',
    role: 'Reader in Brussels',
  },
  {
    text: 'These are books worth keeping. Even the descriptions have a voice, and every suggestion has earned its place on my shelves.',
    image: '/assets/testimonials/adrian-novak.webp',
    name: 'Adrian Novak',
    role: 'Reader in Prague',
  },
]

function Testimonials() {
  const [paused, setPaused] = useState(false)
  const firstColumn = readerTestimonials.slice(0, 3)
  const secondColumn = readerTestimonials.slice(3, 6)
  const thirdColumn = readerTestimonials.slice(6, 9)

  return <section className={s.testimonialsSection} aria-labelledby="reader-notes-title">
    <div className={s.testimonialsHeadingStage} data-testid="reader-notes-characters">
      <figure className={`${s.readerNotesCharacter} ${s.readerNotesPeter}`} data-testid="reader-notes-peter" aria-hidden="true">
        <img src="/assets/landing/peter-pan-reader-notes.png" alt="" width="1024" height="1536" loading="lazy" decoding="async" />
      </figure>
      <div className={s.testimonialsHeading}>
        <p>Notes from the reading room</p>
        <h2 id="reader-notes-title">Books travel farther<br />when readers talk.</h2>
        <span>Thoughts from people who followed their curiosity through our shelves.</span>
        <button className={s.motionToggle} type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          {paused ? 'Resume reader notes' : 'Pause reader notes'}
        </button>
      </div>
      <figure className={`${s.readerNotesCharacter} ${s.readerNotesHook}`} data-testid="reader-notes-hook" aria-hidden="true">
        <img src="/assets/landing/captain-hook-reader-notes.png" alt="" width="1024" height="1536" loading="lazy" decoding="async" />
      </figure>
    </div>
    <div className={s.testimonialsColumns}>
      <TestimonialsColumn testimonials={firstColumn} duration={18} paused={paused} />
      <TestimonialsColumn testimonials={secondColumn} className={s.testimonialsSecondColumn} duration={22} paused={paused} />
      <TestimonialsColumn testimonials={thirdColumn} className={s.testimonialsThirdColumn} duration={20} paused={paused} />
    </div>
  </section>
}

function BookCard({ book, routeIndex }: { book: Book; routeIndex?: number }) {
  return <article className={s.bookCard}>
    {routeIndex !== undefined && <span className={s.routeIndex}>PORT {String(routeIndex + 1).padStart(2, '0')}</span>}
    <Link className={s.coverWrap} to={`/books/${book.slug}`}><img src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy" /></Link>
    <div className={s.cardBody}>
      <div className={s.eyebrow}>{book.genres[0]?.name} · {book.publication_year}</div>
      <h3><Link to={`/books/${book.slug}`}>{book.title}</Link></h3>
      <p className={s.byline}>by {book.authors.map((a) => a.name).join(', ')}</p>
      <div className={s.cardMeta}><Stars value={book.rating_average} count={book.rating_count} /><b>{money(book.price_cents)}</b></div>
    </div>
  </article>
}

function HeroMedia() {
  const [videoReady, setVideoReady] = useState(false)

  return <div className={s.heroMedia}>
    <picture className={s.heroPoster}>
      <source media="(max-width: 760px)" srcSet="/assets/landing/ophelia-hero-mobile.webp" />
      <img
        src="/assets/landing/ophelia-hero-desktop.webp"
        alt="A cinematic interpretation of Ophelia floating peacefully among river flowers beneath a misty willow."
        width="1537"
        height="1023"
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </picture>
    <video
      className={`${s.heroVideo} ${videoReady ? s.heroVideoReady : ''}`}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onCanPlay={() => setVideoReady(true)}
    >
      <source media="(prefers-reduced-motion: no-preference)" src="/assets/landing/ophelia-hero.mp4" type="video/mp4" />
    </video>
  </div>
}

function Home() {
  const query = useQuery({ queryKey: ['home-selection'], queryFn: () => api<Page<Book>>('/books?featured=true&page_size=4&sort=title') })
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres') })
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    let context: { revert: () => void } | undefined
    async function animate() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      if (cancelled || !root.current) return
      gsap.registerPlugin(ScrollTrigger)
      context = gsap.context(() => {
        gsap.timeline()
          .from(`.${s.heroPoster} img, .${s.heroVideo}`, { scale: 1.025, duration: 1.2, ease: 'power2.out' })
          .from(`.${s.heroWord}`, { yPercent: 112, opacity: 0, duration: 1, ease: 'power4.out' }, '-=.8')
          .from(`.${s.heroReveal}`, { y: 18, opacity: 0, duration: .72, stagger: .08, ease: 'power3.out' }, '-=.62')
          .from(`.${s.heroButtons}`, { y: 18, duration: .72, ease: 'power3.out' }, '-=.56')

        gsap.utils.toArray<HTMLElement>(`.${s.stackCard}`).forEach((card, index) => {
          gsap.fromTo(card, { y: 110, scale: 0.92, rotate: index % 2 ? 1.5 : -1.5 }, { y: 0, scale: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: card, start: 'top 92%', end: 'top 38%', scrub: 1 } })
        })

        gsap.from(`.${s.quixoteTableau}`, {
          y: 38,
          opacity: 0,
          duration: .9,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.collectionStory}`, start: 'top 78%', once: true },
        })

        gsap.from(`.${s.wonderlandTeaParty}`, {
          y: 54,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.wonderlandTeaParty}`, start: 'top 88%', once: true },
        })
      }, root)
    }
    void animate()
    return () => { cancelled = true; context?.revert() }
  }, [])

  const featured = orderHomepageBooks(query.data?.items ?? [])
  const collectionGenres = homepageGenreSlugs.flatMap((slug) => {
    const genre = genres.data?.items.find((item) => item.slug === slug)
    return genre ? [genre] : []
  })

  return <div ref={root} className={s.home}>
    <section className={s.hero} aria-labelledby="home-hero-title">
      <HeroMedia />
      <div className={s.heroScrim} aria-hidden="true" />
      <div className={s.heroCopy}>
        <p className={`${s.kicker} ${s.heroReveal}`}>A literary afterlife</p>
        <h1 id="home-hero-title" className={`max-w-6xl ${s.heroTitle}`}>
          <span className={s.heroLine}><span className={s.heroWord}>Ophelia, beyond the page.</span></span>
        </h1>
        <p className={`${s.heroDescription} ${s.heroReveal}`}>Her story has inspired centuries of poems, paintings, and songs, showing how literature lives beyond its final page.</p>
        <div className={s.heroButtons}><Link className={s.primaryButton} to="/books">Browse books <ArrowUpRight size={16} aria-hidden="true" /></Link><Link className={s.heroSecondary} to="/rankings">Readers’ charts</Link></div>
      </div>
    </section>

    <section className={s.featuredSection}>
      <div className={s.editorialHeading}><h2>Books that leave<br />the light on.</h2><p>Four classics chosen not by algorithm, but by attention. Read slowly, underline freely, lend reluctantly.</p></div>
      {query.isLoading ? <State title="Opening the shelves" /> : query.error ? <ErrorState error={query.error} /> :
        <div className={s.featuredBento} data-testid="featured-bento">
          {featured.map((book, index) => {
            const illustration = getLandingIllustration(book, 'featured')
            return <Link
              className={`${s.bentoBook} ${s[`bentoBook${index + 1}` as keyof typeof s]}`}
              data-featured-layout={index === 1 ? 'horizontal' : index === 0 ? 'lead' : 'small'}
              data-featured-slug={book.slug}
              key={book.id}
              to={`/books/${book.slug}`}
            >
              <div className={s.bentoImage}><img src={illustration.src} alt={illustration.alt} loading="lazy" decoding="async" style={{ objectPosition: illustration.objectPosition }} /></div>
              <div className={s.bentoCopy}><span>{book.genres[0]?.name} · {book.publication_year}</span><h3>{book.title}</h3><p>{book.authors.map((author) => author.name).join(', ')}</p><b>{money(book.price_cents)}</b></div>
            </Link>
          })}
        </div>}
    </section>

    <section className={s.collectionStory} aria-labelledby="collection-story-title">
      <div className={s.collectionIntro} data-testid="collection-intro">
        <p>Chosen with intent</p>
        <h2 id="collection-story-title">A shelf should feel like a conversation.</h2>
        <span>Each month, our booksellers follow one idea across eras, continents, and forms.</span>
        <Link to="/genres">Explore all collections <ArrowUpRight size={15} aria-hidden="true" /></Link>
        <figure className={s.quixoteTableau} data-testid="don-quixote-tableau" aria-hidden="true">
          <picture>
            <source media="(max-width: 1050px)" srcSet="/assets/landing/don-quixote-tableau-mobile.png" width="1254" height="1254" />
            <img
              src="/assets/landing/don-quixote-tableau-desktop.png"
              alt=""
              width="1536"
              height="1024"
              loading="lazy"
              decoding="async"
            />
          </picture>
        </figure>
      </div>
      <div className={s.collectionStack} data-testid="collection-stack">
        {featured.map((book, index) => {
          const illustration = getLandingIllustration(book, 'story')
          return <article className={s.stackCard} data-collection-slug={book.slug} key={book.id} style={{ zIndex: index + 1 }}>
            <div><span>{String(index + 1).padStart(2, '0')}</span><h3>{book.title}</h3><p>{book.description}</p><Link to={`/books/${book.slug}`}>Open this book</Link></div>
            <Link className={s.stackImage} to={`/books/${book.slug}`}><img src={illustration.src} alt={illustration.alt} loading="lazy" decoding="async" style={{ objectPosition: illustration.objectPosition }} /></Link>
          </article>
        })}
      </div>
    </section>

    <section className={s.genreSection} aria-labelledby="genre-section-title">
      <div className={`${s.editorialHeading} ${s.genreHeading}`}>
        <h2 id="genre-section-title">Follow your<br />reading instinct.</h2>
        <div className={s.genreCompanion} data-testid="genre-companion">
          <figure className={s.cheshireCat} aria-hidden="true">
            <img src="/assets/landing/cheshire-cat-flying.png" alt="" loading="lazy" decoding="async" />
          </figure>
          <p>Move sideways through the shelves. The collection that opens is the one asking for your attention.</p>
        </div>
      </div>
      <div className={s.genreAccordion} data-testid="genre-accordion">{collectionGenres.map((genre, index) => {
        const illustration = getGenreIllustration(genre)
        return <Link
          to={`/genres/${genre.slug}`}
          key={genre.id}
          className={`${s.genreSlice} ${illustration ? s.genreSliceWithArt : s.genreSliceFallback}`}
          data-genre-slug={genre.slug}
        >
          {illustration && <span className={s.genreArt}>
            <img
              src={illustration.src}
              alt={illustration.alt}
              width="1024"
              height="1024"
              loading="lazy"
              decoding="async"
              style={{ objectPosition: illustration.objectPosition }}
            />
          </span>}
          <span className={s.genreIndex}>{String(index + 1).padStart(2, '0')}</span>
          <div className={s.genreCopy}><h3>{genre.name}</h3><p>{genre.description}</p><b>Explore collection</b></div>
        </Link>
      })}</div>
      <figure className={s.wonderlandTeaParty} data-testid="wonderland-tea-party" aria-hidden="true">
        <picture>
          <source media="(max-width: 760px)" srcSet="/assets/landing/wonderland-tea-party-mobile.png" />
          <img
            src="/assets/landing/wonderland-tea-party-desktop.png"
            alt=""
            width="1672"
            height="941"
            loading="lazy"
            decoding="async"
          />
        </picture>
      </figure>
    </section>

    <Testimonials />

    <CtaWithMarquee />
  </div>
}

function Catalog() {
  const [params, setParams] = useSearchParams()
  const queryParam = params.get('q') || ''
  const [searchTerm, setSearchTerm] = useState(queryParam)
  const queryString = params.toString()
  const books = useQuery({ queryKey: ['books', queryString], queryFn: () => api<Page<Book>>(`/books?${queryString}`), placeholderData: keepPreviousData })
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres') })
  const authors = useQuery({ queryKey: ['authors'], queryFn: () => api<{ items: Author[] }>('/authors') })
  const update = useCallback((key: string, value: string, replace = false) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace })
  }, [params, setParams])
  useEffect(() => setSearchTerm(queryParam), [queryParam])
  useEffect(() => {
    if (searchTerm === queryParam) return
    const timer = window.setTimeout(() => update('q', searchTerm.trim(), true), 250)
    return () => window.clearTimeout(timer)
  }, [queryParam, searchTerm, update])

  const genreOptions: SelectOption[] = [{ value: '', label: 'All genres' }, ...(genres.data?.items.map((item) => ({ value: item.slug, label: item.name })) ?? [])]
  const authorOptions: SelectOption[] = [{ value: '', label: 'All authors' }, ...(authors.data?.items.map((item) => ({ value: item.slug, label: item.name })) ?? [])]
  const sortOptions: SelectOption[] = [
    { value: 'title', label: 'Title A–Z' },
    { value: 'rating', label: 'Highest rated' },
    { value: 'newest', label: 'Newest first' },
    { value: 'price_low', label: 'Lowest price' },
  ]
  const page = Number(params.get('page') || 1)
  const pageCount = Math.max(1, Math.ceil((books.data?.total ?? 0) / (books.data?.page_size ?? 12)))
  const hasFilters = ['q', 'genre', 'author', 'available'].some((key) => Boolean(params.get(key))) || (params.get('sort') && params.get('sort') !== 'title')
  function clearFilters() {
    setSearchTerm('')
    setParams(new URLSearchParams(), { replace: true })
  }
  return <section className={s.page}>
    <div className={s.pageHeading}><span className={s.eyebrow}>THE COMPLETE CATALOGUE</span><h1>Find your next passage</h1><p>Search by a remembered phrase, a beloved author, or simply the mood of the shelf.</p></div>
    <div className={s.filters} aria-busy={books.isFetching || undefined}>
      <label className={s.search}><span><MagnifyingGlass size={19} aria-hidden="true" /></span><input aria-label="Search books" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search titles and descriptions" /></label>
      <SelectControl className={s.filterSelect} label="Genre" value={params.get('genre') || ''} options={genreOptions} busy={genres.isLoading} onChange={(value) => update('genre', value)} />
      <SelectControl className={s.filterSelect} label="Author" value={params.get('author') || ''} options={authorOptions} busy={authors.isLoading} onChange={(value) => update('author', value)} />
      <SelectControl className={s.filterSelect} label="Sort" value={params.get('sort') || 'title'} options={sortOptions} onChange={(value) => update('sort', value)} />
      <label className={s.check}><input type="checkbox" checked={params.get('available') === 'true'} onChange={(e) => update('available', e.target.checked ? 'true' : '')} /> In stock</label>
      {hasFilters && <button className={s.clearFilters} type="button" onClick={clearFilters}>Clear filters</button>}
    </div>
    {books.isLoading ? <State title="Searching the shelves…" loading /> : books.error ? <ErrorState error={books.error} retry={() => void books.refetch()} /> : books.data?.items.length ? <>
      <div className={s.resultBar}><div className={s.resultCount} role="status" aria-live="polite">{books.data.total} books found · page {page} of {pageCount}</div>{books.isFetching && <span className={s.refetching}>Updating results…</span>}</div>
      <div className={s.bookGrid}>{books.data.items.map((book) => <BookCard key={book.id} book={book} />)}</div>
      {pageCount > 1 && <nav className={s.pagination} aria-label="Catalog pages">
        <button type="button" disabled={page <= 1 || books.isFetching} onClick={() => update('page', String(page - 1))}><ArrowLeft size={16} aria-hidden="true" /> Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button type="button" disabled={page >= pageCount || books.isFetching} onClick={() => update('page', String(page + 1))}>Next <ArrowRight size={16} aria-hidden="true" /></button>
      </nav>}
    </> : <State title="No books found" text="Try clearing a filter or using fewer words." action={hasFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined} />}
  </section>
}

function embedUrl(url?: string) {
  if (!url) return ''
  if (url.includes('youtu.be/')) return `https://www.youtube-nocookie.com/embed/${url.split('youtu.be/')[1]?.split('?')[0]}`
  if (url.includes('youtube.com')) return `https://www.youtube-nocookie.com/embed/${new URL(url).searchParams.get('v')}`
  if (url.includes('vimeo.com')) return `https://player.vimeo.com/video/${url.split('/').pop()}`
  return ''
}

function BookPage() {
  const { slug = '' } = useParams(); const client = useQueryClient(); const { user } = useAuth(); const navigate = useNavigate()
  const query = useQuery({ queryKey: ['book', slug], queryFn: () => api<Book>(`/books/${slug}`) })
  const trend = useQuery({ queryKey: ['trend', query.data?.id], queryFn: () => api<{ points: Array<{ year: number; average: number; count: number }> }>(`/books/${query.data!.id}/rating-trend`), enabled: !!query.data })
  const [comment, setComment] = useState(''); const [notice, setNotice] = useState('')
  const cart = useMutation({ mutationFn: (bookId: string) => api('/cart/items', { method: 'POST', body: JSON.stringify({ book_id: bookId, quantity: 1 }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ['cart'] }); setNotice('Added to your bag') }, onError: (e) => setNotice(e.message) })
  const rate = useMutation({ mutationFn: ({ id, value }: { id: string; value: number }) => api(`/books/${id}/ratings`, { method: 'PUT', body: JSON.stringify({ value }) }), onSuccess: () => { client.invalidateQueries({ queryKey: ['book', slug] }); client.invalidateQueries({ queryKey: ['trend'] }) } })
  const post = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api(`/books/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }), onSuccess: () => { setComment(''); client.invalidateQueries({ queryKey: ['book', slug] }) } })
  if (query.isLoading) return <State title="Opening the book…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />; const book = query.data!
  function needsUser(action: () => void) {
    if (user) action()
    else navigate('/sign-in', { state: { from: `/books/${slug}` } })
  }
  return <div className={s.bookPage}>
    <PageMeta title={book.title} description={book.description.slice(0, 155)} />
    <div className={s.crumbs}><Link to="/books">All books</Link><CaretRight size={13} aria-hidden="true" />{book.genres[0] && <Link to={`/genres/${book.genres[0].slug}`}>{book.genres[0].name}</Link>}<CaretRight size={13} aria-hidden="true" /><span>{book.title}</span></div>
    <section className={s.bookHero}><div className={s.detailCover}><img src={book.cover_url} alt={`Cover of ${book.title}`} width="600" height="900" />{book.featured && <span>Keeper’s choice</span>}</div><div className={s.bookInfo}><div className={s.eyebrow}>{book.genres.map((g) => g.name).join(' · ')} · {book.publication_year}</div><h1>{book.title}</h1><p className={s.detailByline}>by {book.authors.map((a) => <Link key={a.id} to={`/authors/${a.slug}`}>{a.name}</Link>).reduce((prev, curr) => <>{prev}, {curr}</>)}</p><Stars value={book.rating_average} count={book.rating_count} /><p className={s.description}>{book.description}</p><dl className={s.bookFacts}><div><dt>ISBN</dt><dd>{book.isbn}</dd></div><div><dt>Edition</dt><dd>Paperback</dd></div><div><dt>Availability</dt><dd>{book.available ? `${book.stock_qty} in stock` : 'Returning soon'}</dd></div></dl><div className={s.buyRow}><b>{money(book.price_cents)}</b><span>VAT included</span><button className={s.primaryButton} disabled={!book.available || cart.isPending} onClick={() => needsUser(() => cart.mutate(book.id))}>{cart.isPending ? 'Adding…' : book.available ? 'Add to bag' : 'Out of stock'} <ArrowRight size={16} aria-hidden="true" /></button></div>{notice && <div className={s.notice} role="status" aria-live="polite">{notice}</div>}</div></section>
    {book.video_url && <section className={s.videoSection}><div><span className={s.eyebrow}>A TWO-MINUTE GLIMPSE</span><h2>Before you turn the first page</h2><p>A short, spoiler-free introduction to the world of the book.</p></div><div className={s.video}><iframe src={embedUrl(book.video_url)} title={`Introduction to ${book.title}`} loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div></section>}
    <section className={s.community}><div><span className={s.eyebrow}>READER’S LOG</span><h2>Ratings over the years</h2>{trend.isLoading ? <State title="Reading the chart…" loading compact /> : trend.error ? <ErrorState error={trend.error} retry={() => void trend.refetch()} compact /> : <div className={s.trend}>{trend.data?.points.length ? trend.data.points.map((p) => <div key={p.year}><span style={{ height: `${Math.max(12, p.average * 20)}%` }} /><b>{p.average}</b><small>{p.year}</small></div>) : <p>No route has been charted yet.</p>}</div>}<div className={s.rateBox}><b>Your reading, your measure</b><div>{[1,2,3,4,5].map((value) => <button type="button" key={value} disabled={rate.isPending} aria-label={`Rate ${value} stars`} onClick={() => needsUser(() => rate.mutate({ id: book.id, value }))}><Star size={24} weight="fill" aria-hidden="true" /></button>)}</div></div>{rate.error && <p className={s.formError} role="alert">{rate.error.message}</p>}</div><div><span className={s.eyebrow}>MARGINALIA</span><h2>From fellow readers</h2>{book.comments?.length ? <div className={s.comments}>{book.comments.map((c) => <article key={c.id}><p>{c.body}</p><small>{c.author} · {new Date(c.created_at).toLocaleDateString()}</small></article>)}</div> : <p className={s.muted}>No comments yet. Leave the first note in the margin.</p>}<form className={s.commentForm} aria-busy={post.isPending || undefined} onSubmit={(e) => { e.preventDefault(); needsUser(() => post.mutate({ id: book.id, body: comment })) }}><label htmlFor="comment">Add a thoughtful note</label><textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} minLength={2} maxLength={2000} placeholder="What stayed with you?" required /><button className={s.secondaryButton} disabled={post.isPending}>{post.isPending ? 'Publishing…' : 'Publish comment'}</button>{post.error && <p className={s.formError} role="alert">{post.error.message}</p>}</form></div></section>
    {!!book.related?.length && <section className={s.related}><div className={s.sectionHeading}><div><span className={s.eyebrow}>CONTINUE THE JOURNEY</span><h2>Books on a nearby shore</h2></div></div><div className={s.bookGrid}>{book.related.map((x) => <BookCard key={x.id} book={x} />)}</div></section>}
  </div>
}

function Directory({ kind }: { kind: 'genres' | 'authors' }) {
  const query = useQuery({ queryKey: [kind], queryFn: () => api<{ items: Array<Genre | Author> }>(`/${kind}`) })
  return <section className={s.page}><div className={s.pageHeading}><span className={s.eyebrow}>{kind === 'genres' ? 'SHELVES BY MOOD' : 'THE WRITERS’ ROOM'}</span><h1>{kind === 'genres' ? 'Choose a current' : 'Follow a voice'}</h1><p>{kind === 'genres' ? 'A shelf is a direction, never a boundary.' : 'Meet the people behind the passages.'}</p></div>{query.isLoading ? <State title="Consulting the catalogue…" loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : query.data?.items.length ? <div className={s.directory}>{query.data.items.map((item) => <Link key={item.id} to={`/${kind}/${item.slug}`}><span className={s.directoryMark}>{kind === 'genres' ? <Sparkle size={22} aria-hidden="true" /> : item.name.charAt(0)}</span><h2>{item.name}</h2><p>{'description' in item ? item.description : item.bio}</p><b>Open shelf <ArrowRight size={14} aria-hidden="true" /></b></Link>)}</div> : <State title={`No ${kind} available`} text="The shelves are being prepared." />}</section>
}

function Shelf({ kind }: { kind: 'genres' | 'authors' }) {
  const { slug = '' } = useParams(); const query = useQuery({ queryKey: [kind, slug], queryFn: () => api<(Genre | Author) & { books: Book[] }>(`/${kind}/${slug}`) })
  if (query.isLoading) return <State title="Opening the shelf…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  return <section className={s.page}><PageMeta title={query.data?.name ?? 'Shelf'} description={'description' in query.data! ? query.data.description : query.data?.bio ?? 'Browse this Orphaleia shelf.'} /><div className={s.pageHeading}><span className={s.eyebrow}>{kind === 'genres' ? 'GENRE SHELF' : 'AUTHOR SHELF'}</span><h1>{query.data?.name}</h1><p>{'description' in query.data! ? query.data.description : query.data?.bio}</p></div>{query.data?.books.length ? <div className={s.bookGrid}>{query.data.books.map((book) => <BookCard key={book.id} book={book} />)}</div> : <State title="This shelf is waiting" text="No books are currently assigned here." />}</section>
}

function Rankings() {
  const [year, setYear] = useState(2024); const [genre, setGenre] = useState('')
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres') })
  const query = useQuery({ queryKey: ['rankings', year, genre], queryFn: () => api<Page<Book> & { publication_year: number }>(`/rankings?publication_year=${year}${genre ? `&genre=${genre}` : ''}`), placeholderData: keepPreviousData })
  const yearOptions = [2026, 2025, 2024, 2023, 2022, 2021, 2020].map((item) => ({ value: String(item), label: String(item) }))
  const genreOptions: SelectOption[] = [{ value: '', label: 'Every shelf' }, ...(genres.data?.items.map((item) => ({ value: item.slug, label: item.name })) ?? [])]
  return <section className={s.page}><div className={s.pageHeading}><span className={s.eyebrow}>THE ANNUAL READER’S CHART</span><h1>Books that found their readers</h1><p>Explore current reader ratings among books first published in a chosen year.</p></div><div className={s.yearPicker} aria-busy={query.isFetching || undefined}>
    <SelectControl label="Publication year" labelMode="inline" value={String(year)} options={yearOptions} onChange={(value) => setYear(Number(value))} />
    <SelectControl label="Genre" labelMode="inline" value={genre} options={genreOptions} busy={genres.isLoading} onChange={setGenre} />
  </div>{query.isLoading ? <State title="Counting readers’ marks…" loading /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : query.data?.items.length ? <ol className={s.rankingList}>{query.data.items.map((book, i) => <li key={book.id}><span className={s.rank}>{String(i + 1).padStart(2, '0')}</span><img src={book.cover_url} alt={`Cover of ${book.title}`} loading="lazy" /><div><span className={s.eyebrow}>{book.genres[0]?.name}</span><h2><Link to={`/books/${book.slug}`}>{book.title}</Link></h2><p>{book.authors.map((x) => x.name).join(', ')}</p></div><Stars value={book.rating_average} count={book.rating_count} /><b>{money(book.price_cents)}</b></li>)}</ol> : <State title={`No chart for ${year}`} text="Choose another year or broaden the genre." />}</section>
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { user, refresh } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const [error, setError] = useState(''); const [sent, setSent] = useState(''); const [submitting, setSubmitting] = useState(false); const [showPassword, setShowPassword] = useState(false); const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  if (user) return <Navigate to="/account" />
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSent('')
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') || '')
    if (register && password !== String(form.get('confirmPassword') || '')) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      if (register) {
        const result = await api<{ message: string; verification_token?: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email: form.get('email'), full_name: form.get('name'), password }) })
        setSent(result.message + (result.verification_token ? ` Development token: ${result.verification_token}` : ''))
      } else {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password }) })
        await refresh()
        navigate((location.state as { from?: string })?.from || '/account')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }
  const title = register ? 'Register' : 'Login'
  const description = register ? 'Keep your orders, ratings, and notes together in one quiet harbor.' : 'Your saved journey continues where you left it.'
  const artwork = register ? {
    desktop: '/assets/auth/doctor-watson-desktop.webp',
    mobile: '/assets/auth/doctor-watson-mobile.webp',
    alt: 'A stylized three-dimensional Doctor Watson writing in a journal beside a medical bag and a stack of books.',
  } : {
    desktop: '/assets/auth/sherlock-holmes-desktop.webp',
    mobile: '/assets/auth/sherlock-holmes-mobile.webp',
    alt: 'A stylized three-dimensional Sherlock Holmes reading with a magnifying glass beside a stack of books.',
  }
  return <section className={`${s.authPage} ${register ? s.authRegister : s.authLogin}`} aria-labelledby="auth-title" data-testid="auth-shell">
    <div className={s.authFormPanel} data-testid="auth-form-panel">
      <form className={s.authForm} onSubmit={submit} aria-busy={submitting}>
        <div className={s.authHeading}>
          <span className={s.eyebrow}>YOUR READER’S PASSAGE</span>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        {register && <label>Your name<input name="name" placeholder="Your name" required minLength={2} autoComplete="name" /></label>}
        <label>Email address<input name="email" type="email" placeholder="reader@orphaleia.com" required autoComplete="email" /></label>
        <label>Password<span className={s.passwordField}><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required minLength={10} autoComplete={register ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="auth-password">{showPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></label>
        {!register && <Link className={s.authForgot} to="/forgot-password">Forgot your password?</Link>}
        {register && <label>Confirm password<span className={s.passwordField}><input id="auth-confirm-password" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat your password" required minLength={10} autoComplete="new-password" aria-invalid={error === 'Passwords do not match.' || undefined} aria-describedby={error === 'Passwords do not match.' ? 'auth-error' : undefined} /><button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-controls="auth-confirm-password">{showConfirmPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></label>}
        {error && <p id="auth-error" className={s.formError} role="alert">{error}</p>}
        {sent && <p className={s.notice} role="status" aria-live="polite">{sent}</p>}
        <button className={`${s.primaryButton} ${s.authSubmit}`} disabled={submitting}>{submitting ? register ? 'Creating account…' : 'Signing in…' : register ? 'Create account' : 'Sign in'} {!submitting && <ArrowRight size={16} aria-hidden="true" />}</button>
        <p className={s.authSwitch}>{register ? <>Already aboard? <Link to="/sign-in">Sign in</Link></> : <>New to Orphaleia? <Link to="/register">Create an account</Link></>}</p>
      </form>
    </div>
    <figure className={s.authArtwork} data-testid="auth-artwork">
      <picture>
        <source media="(max-width: 760px)" srcSet={artwork.mobile} />
        <img src={artwork.desktop} alt={artwork.alt} width="1024" height="1536" loading="eager" fetchPriority="high" decoding="async" />
      </picture>
    </figure>
  </section>
}

function TokenPage({ mode }: { mode: 'verify' | 'reset' | 'forgot' }) {
  const [params] = useSearchParams(); const token = params.get('token'); const requestStarted = useRef(false); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(mode === 'verify' && Boolean(token))
  useEffect(() => {
    if (mode !== 'verify') return
    if (!token) { setError('This verification link is missing its token. Request a new email and try again.'); setBusy(false); return }
    if (requestStarted.current) return
    requestStarted.current = true
    api<{ message: string }>('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }).then((x) => setMessage(x.message)).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }, [mode, token])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (mode === 'reset' && !token) { setError('This reset link is missing its token. Request a new link and try again.'); return }
    const data = new FormData(e.currentTarget); setBusy(true); setError(''); setMessage('')
    try {
      const result = mode === 'forgot' ? await api<{ message: string }>('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email: data.get('email') }) }) : await api<{ message: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: data.get('password') }) })
      setMessage(result.message)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return <section className={s.narrowPage}><span className={s.eyebrow}>ACCOUNT PASSAGE</span><h1>{mode === 'verify' ? 'Verify your email' : mode === 'forgot' ? 'Find your way back' : 'Choose a new password'}</h1>{mode === 'verify' ? <>{busy ? <State title="Checking your link…" loading compact /> : message ? <p className={s.notice} role="status">{message}</p> : error ? <p className={s.formError} role="alert">{error}</p> : null}<Link className={s.primaryButton} to="/sign-in">Continue to sign in</Link></> : <form className={s.stackForm} aria-busy={busy || undefined} onSubmit={submit}><label>{mode === 'forgot' ? 'Email address' : 'New password'}<input name={mode === 'forgot' ? 'email' : 'password'} type={mode === 'forgot' ? 'email' : 'password'} required minLength={mode === 'forgot' ? undefined : 10} autoComplete={mode === 'forgot' ? 'email' : 'new-password'} /></label><button className={s.primaryButton} disabled={busy}>{busy ? 'Sending…' : mode === 'forgot' ? 'Send reset link' : 'Save new password'}</button>{message && <p className={s.notice} role="status">{message}</p>}{error && <p className={s.formError} role="alert">{error}</p>}</form>}</section>
}

function CartPage() {
  const { user, loading } = useAuth(); const client = useQueryClient(); const query = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: !!user })
  const remove = useMutation({ mutationFn: (id: string) => api(`/cart/items/${id}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['cart'] }) })
  if (loading) return <State title="Finding your bag…" loading />; if (!user) return <Navigate to="/sign-in" state={{ from: '/cart' }} />; if (query.isLoading) return <State title="Opening your bag…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const cart = query.data!; return <section className={s.page}><div className={s.pageHeading}><span className={s.eyebrow}>YOUR BOOK BAG</span><h1>Books for the crossing</h1></div>{cart.items.length ? <div className={s.cartLayout}><div className={s.cartItems}>{cart.items.map((item) => <article key={item.id}><img src={item.book.cover_url} alt={`Cover of ${item.book.title}`} width="80" height="120" /><div><h2><Link to={`/books/${item.book.slug}`}>{item.book.title}</Link></h2><p>Quantity: {item.quantity}</p><button className={s.textButton} disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>{remove.isPending ? 'Removing…' : 'Remove'}</button></div><b>{money(item.book.price_cents * item.quantity)}</b></article>)}</div><aside className={s.orderCard}><h2>Order summary</h2><div><span>Books</span><b>{money(cart.subtotal_cents)}</b></div><div><span>Shipping</span><span>Calculated next</span></div><hr /><div className={s.total}><span>Subtotal</span><b>{money(cart.subtotal_cents)}</b></div><Link className={s.primaryButton} to="/checkout">Continue to delivery <ArrowRight size={16} aria-hidden="true" /></Link><small>VAT included · Secure checkout</small>{remove.error && <p className={s.formError} role="alert">{remove.error.message}</p>}</aside></div> : <State title="Your bag is waiting" text="Choose a book and begin a new route." />}</section>
}

const emptyAddress: Address = { name: '', line1: '', line2: '', city: '', postal_code: '', country: 'ES' }
function Checkout() {
  const { user } = useAuth(); const navigate = useNavigate(); const [address, setAddress] = useState(emptyAddress); const [quote, setQuote] = useState<{ subtotal_cents: number; shipping_cents: number; total_cents: number } | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  if (!user) return <Navigate to="/sign-in" state={{ from: '/checkout' }} />
  async function quoteOrder(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { setQuote(await api('/checkout/quote', { method: 'POST', body: JSON.stringify({ address }) })) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  async function pay(provider: string) { setBusy(true); try { const order = await api<Order>('/orders', { method: 'POST', body: JSON.stringify({ address }) }); const payment = await api<{ redirect_url: string }>(`/payments/${provider}/start?order_id=${order.id}`, { method: 'POST' }); window.location.assign(payment.redirect_url) } catch (err) { setError((err as Error).message); setBusy(false) } }
  const fields: Array<[keyof Address, string, boolean]> = [['name','Full name',true],['line1','Address',true],['line2','Apartment, suite, etc.',false],['city','City',true],['postal_code','Postal code',true]]
  const countryOptions: SelectOption[] = [['ES','Spain'],['FR','France'],['DE','Germany'],['IT','Italy'],['PT','Portugal'],['NL','Netherlands']].map(([value, label]) => ({ value, label }))
  return <section className={s.checkoutPage}>
    <div><span className={s.eyebrow}>DELIVERY</span><h1>Where should these stories find you?</h1>
      <form className={s.checkoutForm} onSubmit={quoteOrder} aria-busy={busy || undefined}>
        {fields.map(([key,label,required]) => <label key={key}>{label}<input value={address[key]} required={required} onChange={(e) => { setAddress({ ...address, [key]: e.target.value }); setQuote(null) }} /></label>)}
        <SelectControl label="Country" labelMode="stacked" value={address.country} options={countryOptions} onChange={(value) => { setAddress({ ...address, country: value }); setQuote(null) }} />
        <button className={s.secondaryButton} disabled={busy}>{busy ? 'Calculating…' : 'Calculate delivery'}</button>
      </form>
    </div>
    <aside className={s.orderCard}><h2>Final passage</h2>{quote ? <>
      <div><span>Books</span><b>{money(quote.subtotal_cents)}</b></div><div><span>Delivery</span><b>{money(quote.shipping_cents)}</b></div><hr /><div className={s.total}><span>Total</span><b>{money(quote.total_cents)}</b></div>
      <button className={s.stripeButton} disabled={busy} onClick={() => void pay('stripe')}>{busy ? 'Opening payment…' : 'Pay securely with Stripe'}</button>
      <button className={s.paypalButton} disabled={busy} onClick={() => void pay('paypal')}>{busy ? 'Opening payment…' : 'Pay with PayPal'}</button>
    </> : <p>Enter your address to see delivery and the final total.</p>}
      {error && <p className={s.formError} role="alert">{error}</p>}
      <button type="button" className={s.textButton} onClick={() => navigate('/cart')}><ArrowLeft size={15} aria-hidden="true" /> Return to bag</button>
    </aside>
  </section>
}

function PaymentReturn() {
  const [params] = useSearchParams(); const client = useQueryClient(); const requestStarted = useRef(false); const order = params.get('order'); const provider = params.get('provider'); const reference = params.get('reference') || params.get('token'); const valid = Boolean(order && provider && reference)
  const [status, setStatus] = useState(valid ? 'Confirming your payment…' : 'We could not identify this payment return.'); const [busy, setBusy] = useState(valid); const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (!order || !provider || !reference) return
    if (requestStarted.current) return
    requestStarted.current = true
    api<Order>(`/payments/${provider}/complete?order_id=${order}&reference=${encodeURIComponent(reference)}`, { method: 'POST' }).then(() => { setStatus('Payment confirmed. Your books are reserved.'); setConfirmed(true); client.invalidateQueries({ queryKey: ['cart'] }) }).catch((e) => setStatus(e.message)).finally(() => setBusy(false))
  }, [order, provider, reference, client])
  return <section className={s.narrowPage}>{busy ? <State title="Confirming your payment…" loading compact /> : <><div className={s.seal}>{confirmed ? <Check size={42} aria-hidden="true" /> : '?'}</div><span className={s.eyebrow}>{confirmed ? 'ORDER RECEIVED' : 'PAYMENT STATUS'}</span><h1 role="status">{status}</h1><p>{confirmed ? 'You can follow fulfillment from your account.' : 'Return to your bag or contact the shop if a payment was completed.'}</p><Link className={s.primaryButton} to={confirmed ? '/account' : '/cart'}>{confirmed ? 'View my orders' : 'Return to bag'} <ArrowRight size={16} aria-hidden="true" /></Link></>}</section>
}

function Account() {
  const { user, loading } = useAuth(); const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<{ items: Order[] }>('/orders'), enabled: !!user })
  if (loading) return <State title="Opening your account…" loading />; if (!user) return <Navigate to="/sign-in" />
  return <section className={s.page}><div className={s.pageHeading}><span className={s.eyebrow}>READER’S ACCOUNT</span><h1>Welcome, {user.full_name.split(' ')[0]}</h1><p>{user.email} · {user.is_verified ? 'Verified reader' : 'Email verification pending'}</p></div><h2 className={s.sectionTitle}>Your orders</h2>{orders.isLoading ? <State title="Loading your orders…" loading /> : orders.error ? <ErrorState error={orders.error} retry={() => void orders.refetch()} /> : orders.data?.items.length ? <div className={s.orders}>{orders.data.items.map((order) => <article key={order.id}><div><span className={s.eyebrow}>{new Date(order.created_at).toLocaleDateString()}</span><h3>{order.number}</h3><p>{order.items.map((x) => x.title).join(', ')}</p></div><span className={s.status}>{order.status.replace('_',' ')}</span><b>{money(order.total_cents)}</b></article>)}</div> : <State title="No orders yet" text="Your completed voyages will appear here." />}</section>
}

function Admin() {
  const { user, loading } = useAuth(); const client = useQueryClient(); const [tab, setTab] = useState('overview'); const [message, setMessage] = useState('')
  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Record<string, number>>('/admin/overview'), enabled: user?.role === 'admin' })
  const books = useQuery({ queryKey: ['admin-books'], queryFn: () => api<{ items: Book[] }>('/admin/books'), enabled: user?.role === 'admin' && tab === 'books' })
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => api<{ items: Order[] }>('/admin/orders'), enabled: user?.role === 'admin' && tab === 'orders' })
  const comments = useQuery({ queryKey: ['admin-comments'], queryFn: () => api<{ items: Array<{ id: string; body: string; visible: boolean; author: string; book: string }> }>('/admin/comments'), enabled: user?.role === 'admin' && tab === 'comments' })
  const authors = useQuery({ queryKey: ['authors'], queryFn: () => api<{ items: Author[] }>('/authors'), enabled: user?.role === 'admin' && tab === 'taxonomy' })
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres'), enabled: user?.role === 'admin' && tab === 'taxonomy' })
  type Zone = { id: string; name: string; country_codes: string[]; rate_cents: number; free_over_cents?: number; active: boolean }
  const zones = useQuery({ queryKey: ['admin-zones'], queryFn: () => api<{ items: Zone[] }>('/admin/shipping-zones'), enabled: user?.role === 'admin' && tab === 'shipping' })
  const updateOrder = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['admin-orders'] }) })
  const moderate = useMutation({ mutationFn: ({ id, visible }: { id: string; visible: boolean }) => api(`/admin/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ visible }) }), onSuccess: () => client.invalidateQueries({ queryKey: ['admin-comments'] }) })
  async function createTaxonomy(e: FormEvent<HTMLFormElement>, kind: 'authors' | 'genres') { e.preventDefault(); const f = new FormData(e.currentTarget); try { await api(`/admin/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'authors' ? { name: f.get('name'), slug: f.get('slug'), bio: f.get('description') } : { name: f.get('name'), slug: f.get('slug'), description: f.get('description') }) }); e.currentTarget.reset(); client.invalidateQueries({ queryKey: [kind] }); setMessage(`${kind === 'authors' ? 'Author' : 'Genre'} added`) } catch (err) { setMessage((err as Error).message) } }
  async function createZone(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); try { await api('/admin/shipping-zones', { method: 'POST', body: JSON.stringify({ name: f.get('name'), country_codes: String(f.get('countries')).split(',').map((x) => x.trim()), rate_cents: Math.round(Number(f.get('rate')) * 100), free_over_cents: f.get('free') ? Math.round(Number(f.get('free')) * 100) : null, active: true }) }); e.currentTarget.reset(); client.invalidateQueries({ queryKey: ['admin-zones'] }); setMessage('Shipping zone added') } catch (err) { setMessage((err as Error).message) } }
  if (loading) return <State title="Checking the keeper’s seal…" loading />; if (user?.role !== 'admin') return <Navigate to="/" />
  return <section className={s.adminPage}><aside className={s.adminNav}><span className={s.eyebrow}>KEEPER’S DESK</span><h1>Shop admin</h1>{['overview','books','taxonomy','shipping','orders','comments'].map((x) => <button type="button" className={tab === x ? s.activeTab : ''} aria-current={tab === x ? 'page' : undefined} key={x} onClick={() => setTab(x)}>{x}</button>)}</aside><div className={s.adminContent}>{message && <p className={s.notice} role="status" aria-live="polite">{message}</p>}
    {tab === 'overview' && <><h2>Today at Orphaleia</h2>{overview.isLoading ? <State title="Loading the overview…" loading compact /> : overview.error ? <ErrorState error={overview.error} retry={() => void overview.refetch()} compact /> : <><div className={s.stats}>{overview.data && Object.entries(overview.data).map(([key,value]) => <article key={key}><span>{key.replace('_',' ')}</span><b>{value}</b></article>)}</div><div className={s.adminNote}><h3>Operations note</h3><p>Payment events are replay-safe, stock reservations expire after 30 minutes, and outbound messages are handled by the worker.</p></div></>}</>}
    {tab === 'books' && <><div className={s.adminTitle}><h2>Catalog</h2><Link className={s.secondaryButton} to="/admin/books/new">Add book</Link></div>{books.isLoading ? <State title="Loading the catalog…" loading compact /> : books.error ? <ErrorState error={books.error} retry={() => void books.refetch()} compact /> : books.data?.items.length ? <div className={s.table}>{books.data.items.map((book) => <div className={s.tableRow} key={book.id}><img src={book.cover_url} alt={`Cover of ${book.title}`} width="42" height="64" loading="lazy" /><div><b>{book.title}</b><small>{book.authors.map((x) => x.name).join(', ')}</small></div><span>{money(book.price_cents)}</span><span>{book.stock_qty} in stock</span><span className={book.active ? s.live : s.draft}>{book.active ? 'Live' : 'Hidden'}</span></div>)}</div> : <State title="No catalog books" compact />}</>}
    {tab === 'taxonomy' && <><h2>Authors and shelves</h2>{authors.isLoading || genres.isLoading ? <State title="Loading taxonomy…" loading compact /> : authors.error || genres.error ? <ErrorState error={authors.error || genres.error} retry={() => { void authors.refetch(); void genres.refetch() }} compact /> : <div className={s.adminForms}><form className={s.stackForm} onSubmit={(e) => void createTaxonomy(e, 'authors')}><h3>Add author</h3><label>Name<input name="name" required /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Biography<textarea name="description" /></label><button className={s.secondaryButton}>Add author</button><small>{authors.data?.items.length ?? 0} authors currently available</small></form><form className={s.stackForm} onSubmit={(e) => void createTaxonomy(e, 'genres')}><h3>Add genre</h3><label>Name<input name="name" required /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Description<textarea name="description" /></label><button className={s.secondaryButton}>Add genre</button><small>{genres.data?.items.length ?? 0} shelves currently available</small></form></div>}</>}
    {tab === 'shipping' && <><h2>Shipping zones</h2>{zones.isLoading ? <State title="Loading shipping zones…" loading compact /> : zones.error ? <ErrorState error={zones.error} retry={() => void zones.refetch()} compact /> : <><div className={s.shippingList}>{zones.data?.items.length ? zones.data.items.map((zone) => <article key={zone.id}><div><b>{zone.name}</b><small>{zone.country_codes.join(', ')}</small></div><span>{money(zone.rate_cents)} delivery</span><span>{zone.free_over_cents ? `Free over ${money(zone.free_over_cents)}` : 'No free threshold'}</span></article>) : <State title="No shipping zones" compact />}</div><form className={s.inlineForm} onSubmit={(e) => void createZone(e)}><label>Zone name<input name="name" required /></label><label>Country codes<input name="countries" placeholder="ES, PT" required /></label><label>Rate in EUR<input name="rate" type="number" min="0" step="0.01" required /></label><label>Free over EUR<input name="free" type="number" min="0" step="0.01" /></label><button className={s.primaryButton}>Add zone</button></form></>}</>}
    {tab === 'orders' && <><h2>Orders</h2>{orders.isLoading ? <State title="Loading orders…" loading compact /> : orders.error ? <ErrorState error={orders.error} retry={() => void orders.refetch()} compact /> : orders.data?.items.length ? <div className={s.table}>{orders.data.items.map((order) => <div className={s.tableRow} key={order.id}><div><b>{order.number}</b><small>{new Date(order.created_at).toLocaleDateString()}</small></div><span>{money(order.total_cents)}</span><SelectControl label={`Status for ${order.number}`} value={order.status} options={['pending_payment','paid','processing','shipped','cancelled','refunded'].map((value) => ({ value, label: value.replace('_', ' ') }))} disabled={updateOrder.isPending} onChange={(status) => updateOrder.mutate({ id: order.id, status })} /></div>)}</div> : <State title="No orders yet" compact />}{updateOrder.error && <p className={s.formError} role="alert">{updateOrder.error.message}</p>}</>}
    {tab === 'comments' && <><h2>Reader comments</h2>{comments.isLoading ? <State title="Loading comments…" loading compact /> : comments.error ? <ErrorState error={comments.error} retry={() => void comments.refetch()} compact /> : comments.data?.items.length ? <div className={s.moderation}>{comments.data.items.map((item) => <article key={item.id}><div><b>{item.author} on {item.book}</b><p>{item.body}</p></div><button className={s.secondaryButton} disabled={moderate.isPending} onClick={() => moderate.mutate({ id: item.id, visible: !item.visible })}>{moderate.isPending ? 'Saving…' : item.visible ? 'Hide' : 'Publish'}</button></article>)}</div> : <State title="No comments to moderate" compact />}{moderate.error && <p className={s.formError} role="alert">{moderate.error.message}</p>}</>}
  </div></section>
}

function NewBook() {
  const { user } = useAuth(); const navigate = useNavigate(); const authors = useQuery({ queryKey: ['authors'], queryFn: () => api<{ items: Author[] }>('/authors') }); const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres') }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [authorId, setAuthorId] = useState(''); const [genreId, setGenreId] = useState('')
  useEffect(() => { if (!authorId && authors.data?.items[0]) setAuthorId(authors.data.items[0].id) }, [authorId, authors.data])
  useEffect(() => { if (!genreId && genres.data?.items[0]) setGenreId(genres.data.items[0].id) }, [genreId, genres.data])
  if (user?.role !== 'admin') return <Navigate to="/" />
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(''); try { let cover = String(f.get('cover') || ''); const file = f.get('cover_file'); if (file instanceof File && file.size) { const upload = new FormData(); upload.set('file', file); const asset = await api<{ url: string }>('/admin/media', { method: 'POST', body: upload }); cover = asset.url } if (!cover) throw new Error('Upload a cover or provide a cover URL'); await api('/admin/books', { method: 'POST', body: JSON.stringify({ title: f.get('title'), slug: f.get('slug'), isbn: f.get('isbn'), description: f.get('description'), publication_year: Number(f.get('year')), price_cents: Math.round(Number(f.get('price')) * 100), stock_qty: Number(f.get('stock')), cover_url: cover, video_url: f.get('video') || null, featured: f.get('featured') === 'on', active: true, author_ids: [f.get('author')], genre_ids: [f.get('genre')] }) }); navigate('/admin') } catch (err) { setError((err as Error).message); setBusy(false) } }
  const authorOptions = authors.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []
  const genreOptions = genres.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []
  return <section className={s.narrowPage}><span className={s.eyebrow}>KEEPER’S DESK</span><h1>Add a book</h1><form className={s.stackForm} aria-busy={busy || undefined} onSubmit={submit}><label>Title<input name="title" required /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>ISBN<input name="isbn" required /></label><label>Description<textarea name="description" minLength={20} required /></label><div className={s.formColumns}><label>Publication year<input name="year" type="number" min="1450" max="2100" required /></label><label>Price in EUR<input name="price" type="number" min="0" step="0.01" required /></label><label>Stock<input name="stock" type="number" min="0" required /></label></div><label>Upload cover<input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" /></label><label>Or use a cover URL<input name="cover" /></label><label>Video URL<input name="video" type="url" /></label><SelectControl label="Author" labelMode="stacked" name="author" value={authorId} options={authorOptions} busy={authors.isLoading} onChange={setAuthorId} /><SelectControl label="Genre" labelMode="stacked" name="genre" value={genreId} options={genreOptions} busy={genres.isLoading} onChange={setGenreId} /><label className={s.check}><input name="featured" type="checkbox" /> Feature on home</label><button className={s.primaryButton} disabled={busy || !authorId || !genreId}>{busy ? 'Publishing…' : 'Publish book'}</button>{error && <p className={s.formError} role="alert">{error}</p>}</form></section>
}

function NotFound() { return <section className={s.narrowPage}><div className={s.seal}>404</div><h1>This island is not on the chart.</h1><p>The page may have moved, or the route was copied incorrectly.</p><Link className={s.primaryButton} to="/">Return home</Link></section> }

export default function App() {
  return <AuthProvider><Layout><Routes>
    <Route path="/" element={<Home />} /><Route path="/books" element={<Catalog />} /><Route path="/books/:slug" element={<BookPage />} />
    <Route path="/genres" element={<Directory kind="genres" />} /><Route path="/genres/:slug" element={<Shelf kind="genres" />} /><Route path="/authors" element={<Directory kind="authors" />} /><Route path="/authors/:slug" element={<Shelf kind="authors" />} /><Route path="/rankings" element={<Rankings />} />
    <Route path="/sign-in" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/verify" element={<TokenPage mode="verify" />} /><Route path="/forgot-password" element={<TokenPage mode="forgot" />} /><Route path="/reset-password" element={<TokenPage mode="reset" />} />
    <Route path="/cart" element={<RequireUser><CartPage /></RequireUser>} /><Route path="/checkout" element={<RequireUser><Checkout /></RequireUser>} /><Route path="/payment/return" element={<PaymentReturn />} /><Route path="/account" element={<RequireUser><Account /></RequireUser>} />
    <Route path="/admin" element={<RequireUser admin><Admin /></RequireUser>} /><Route path="/admin/books/new" element={<RequireUser admin><NewBook /></RequireUser>} /><Route path="*" element={<NotFound />} />
  </Routes></Layout></AuthProvider>
}
