import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CaretRight, Check, EnvelopeSimple, Eye, EyeSlash, MagnifyingGlass, Pause, Play, Star } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, money } from './api'
import { addressFields, countryOptions, emptyAddress } from './address'
import { trackAnalytics } from './analytics'
import { BookDetailExperience } from './components/BookDetailExperience'
import { BookHeroScene, type HeroBook } from './components/BookHeroScene'
import { AuthorShowcase } from './components/AuthorShowcase'
import { GenreDirectory } from './components/GenreDirectory'
import { PageMeta } from './components/PageMeta'
import { ErrorState, RouteState as State } from './components/ui/RouteState'
import { SelectControl, type SelectOption } from './components/ui/SelectControl'
import { CtaWithMarquee } from './components/ui/cta-with-marquee'
import { FaqSection } from './components/FaqSection'
import { CatalogCharacterScene } from './components/CatalogCharacterScene'
import { TestimonialsColumn, type Testimonial } from './components/ui/testimonials-columns-1'
import { getGenreIllustration, homepageGenreSlugs } from './genreIllustrations'
import { getLandingIllustration, orderHomepageBooks, orderHomepageHeroBooks } from './landingIllustrations'
import { formatSalesUnits, salesBarRatio } from './rankingUtils'
import { getRankingPreview } from './rankingPreview'
import { getCanonicalPath } from './seo'
import { MarketGlobe } from './components/MarketGlobe'
import { CartEmptyState } from './components/CartEmptyState'
import { VerificationPassage } from './components/VerificationPassage'
import { AccountHub } from './components/AccountHub'
import { ReaderAvatar } from './components/ReaderAvatar'
import { AdminOrderOperations } from './components/AdminOrderOperations'
import { NotFoundPage } from './components/NotFoundPage'
import { FormNotification, type NotificationVariant } from './components/ui/FormNotification'
import { ExternalVideo } from './components/ExternalVideo'
import { PrivacyPolicyPage, TermsPage } from './components/LegalPages'
import type { Address, Author, Book, Cart, Genre, Order, Page, SalesRankingResponse, User } from './types'
import s from './styles.module.css'

type AuthValue = { user: User | null; loading: boolean; signOut: () => Promise<void>; refresh: () => Promise<void> }
const AuthContext = createContext<AuthValue>({ user: null, loading: true, signOut: async () => {}, refresh: async () => {} })
const useAuth = () => useContext(AuthContext)

async function uploadImage(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || !file.size) return ''
  const payload = new FormData()
  payload.set('file', file)
  return (await api<{ url: string }>('/admin/media', { method: 'POST', body: payload })).url
}

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
    <PageMeta title={routeMeta.title} description={routeMeta.description} canonicalPath={getCanonicalPath(location.pathname, location.search)} />
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
          <NavLink to="/books">All books</NavLink><NavLink to="/genres">Genres</NavLink><NavLink to="/authors">Authors</NavLink><NavLink to="/rankings">Bestseller charts</NavLink>
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
      <div><b>Browse</b><Link to="/books">All books</Link><Link to="/rankings">Bestseller charts</Link><Link to="/genres">Collections</Link></div>
      <div><b>Elsewhere</b><Link to="/authors">Our authors</Link><Link to="/account">Your account</Link><span>Spain and EU delivery</span></div>
      <div><b>Legal</b><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms and Conditions</Link><a href="mailto:customer@orphaleia.com">Contact us</a></div>
      <p className={s.copyright}>© 2026 Orphaleia. Built for the long read.</p>
    </footer>}
  </>
}

function getRouteMeta(pathname: string) {
  if (pathname === '/') return { title: 'Independent bookshop', description: 'Books for curious voyages, chosen with care by Orphaleia.' }
  if (pathname === '/books' || pathname === '/all-books') return { title: 'All books', description: 'Search Orphaleia’s complete catalogue by title, author, genre, rating, and availability.' }
  if (pathname.startsWith('/books/')) return { title: 'Book details', description: 'Read about this Orphaleia edition, reader ratings, and related books.' }
  if (pathname === '/genres') return { title: 'Genres', description: 'Explore literary collections and follow a new reading current.' }
  if (pathname.startsWith('/genres/')) return { title: 'Genre collection', description: 'Browse books from this Orphaleia collection.' }
  if (pathname === '/authors') return { title: 'Authors', description: 'Follow the voices represented on Orphaleia’s shelves.' }
  if (pathname.startsWith('/authors/')) return { title: 'Author', description: 'Discover books by this Orphaleia author.' }
  if (pathname === '/rankings') return { title: 'Annual bestsellers', description: 'Explore sourced annual print-sales rankings across explicitly covered BookScan markets.' }
  if (pathname === '/sign-in') return { title: 'Sign in', description: 'Continue your Orphaleia reading journey.' }
  if (pathname === '/register') return { title: 'Create an account', description: 'Create an Orphaleia reader account.' }
  if (pathname.includes('password')) return { title: 'Account recovery', description: 'Recover access to your Orphaleia account.' }
  if (pathname === '/confirm-email-change') return { title: 'Confirm email change', description: 'Confirm the new sign-in email for your Orphaleia account.' }
  if (pathname === '/verify') return { title: 'Verify email', description: 'Verify your Orphaleia reader account.' }
  if (pathname === '/cart') return { title: 'Your bag', description: 'Review the books in your Orphaleia bag.' }
  if (pathname === '/checkout') return { title: 'Checkout', description: 'Choose delivery and complete your Orphaleia order.' }
  if (pathname === '/payment/return') return { title: 'Payment status', description: 'Review your Orphaleia payment status.' }
  if (pathname === '/account') return { title: 'Your account', description: 'View your Orphaleia reader account and orders.' }
  if (pathname === '/privacy') return { title: 'Privacy Policy', description: 'Learn how Orphaleia collects, uses, shares, and protects personal information.' }
  if (pathname === '/terms') return { title: 'Terms and Conditions', description: 'Read the terms that apply when you use Orphaleia or order books from us.' }
  if (pathname.startsWith('/admin')) return { title: 'Shop admin', description: 'Manage the Orphaleia catalogue and orders.' }
  return { title: 'Page not found', description: 'The page you were looking for is missing. Return safely to the Orphaleia bookshop.' }
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

const featuredDwarfs = [
  { id: 'left-1', side: 'left', className: s.dwarfLeft1, src: '/assets/landing/snow-white-dwarf-left-1.webp', width: 420, height: 984, mobile: true },
  { id: 'left-2', side: 'left', className: s.dwarfLeft2, src: '/assets/landing/snow-white-dwarf-left-2.webp', width: 420, height: 869, mobile: false },
  { id: 'top-1', side: 'top', className: s.dwarfTop1, src: '/assets/landing/snow-white-dwarf-top-1.webp', width: 560, height: 546, mobile: false },
  { id: 'top-2', side: 'top', className: s.dwarfTop2, src: '/assets/landing/snow-white-dwarf-top-2.webp', width: 560, height: 622, mobile: true },
  { id: 'top-3', side: 'top', className: s.dwarfTop3, src: '/assets/landing/snow-white-dwarf-top-3.webp', width: 560, height: 693, mobile: false },
  { id: 'right-1', side: 'right', className: s.dwarfRight1, src: '/assets/landing/snow-white-dwarf-right-1.webp', width: 420, height: 896, mobile: false },
  { id: 'right-2', side: 'right', className: s.dwarfRight2, src: '/assets/landing/snow-white-dwarf-right-2.webp', width: 420, height: 957, mobile: true },
] as const

const fallbackHeroBooks: HeroBook[] = [
  { slug: 'twenty-thousand-leagues-under-the-sea', title: 'Twenty Thousand Leagues Under the Sea', cover_url: '/covers/twenty-thousand-leagues-under-the-sea.webp' },
  { slug: 'romeo-and-juliet', title: 'Romeo and Juliet', cover_url: '/covers/romeo-and-juliet.webp' },
  { slug: 'the-adventures-of-sherlock-holmes', title: 'The Adventures of Sherlock Holmes', cover_url: '/covers/the-adventures-of-sherlock-holmes.webp' },
  { slug: 'the-little-prince', title: 'The Little Prince', cover_url: '/covers/the-little-prince.webp' },
  { slug: 'the-hobbit', title: 'The Hobbit', cover_url: '/covers/the-hobbit.webp' },
]

function Testimonials() {
  const [paused, setPaused] = useState(false)
  const firstColumn = readerTestimonials.slice(0, 3)
  const secondColumn = readerTestimonials.slice(3, 6)
  const thirdColumn = readerTestimonials.slice(6, 9)

  return <section className={s.testimonialsSection} aria-labelledby="reader-notes-title" data-home-motion="section">
    <div className={s.testimonialsHeadingStage} data-testid="reader-notes-characters" data-home-motion="heading">
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
    <div className={s.testimonialsColumns} data-home-motion="columns">
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
          .from(`.${s.heroWord}`, { yPercent: 112, opacity: 0, duration: 1, ease: 'power4.out' }, '-=.8')
          .from(`.${s.heroReveal}`, { y: 18, opacity: 0, duration: .72, stagger: .08, ease: 'power3.out' }, '-=.62')
          .from(`.${s.heroButtons}`, { y: 18, duration: .72, ease: 'power3.out' }, '-=.56')
          .from(`.${s.heroBookStage}`, { y: 72, scale: .96, opacity: 0, duration: 1.05, ease: 'power3.out' }, '-=.72')

        gsap.utils.toArray<HTMLElement>('[data-home-motion="section"]').forEach((section) => {
          gsap.from(section, {
            y: 54,
            opacity: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: { trigger: section, start: 'top 88%', once: true },
          })
        })

        gsap.from('[data-home-motion="heading"] > *', {
          y: 36,
          opacity: 0,
          duration: .8,
          stagger: .1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-home-motion="heading"]', start: 'top 82%', once: true },
        })

        gsap.from('[data-home-motion="columns"]', {
          y: 48,
          opacity: 0,
          duration: .9,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-home-motion="columns"]', start: 'top 88%', once: true },
        })
      }, root)
    }
    void animate()
    return () => { cancelled = true; context?.revert() }
  }, [])

  const featured = useMemo(() => orderHomepageBooks(query.data?.items ?? []), [query.data?.items])
  const heroFeatured = useMemo(() => orderHomepageHeroBooks(query.data?.items ?? []), [query.data?.items])
  const heroBooks = useMemo<HeroBook[]>(() => heroFeatured.length >= 5
    ? heroFeatured.map(({ slug, title, cover_url }) => ({ slug, title, cover_url }))
    : fallbackHeroBooks, [heroFeatured])
  const collectionGenres = homepageGenreSlugs.flatMap((slug) => {
    const genre = genres.data?.items.find((item) => item.slug === slug)
    return genre ? [genre] : []
  })

  useEffect(() => {
    if (!featured.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    let context: { revert: () => void } | undefined
    async function animateFeatured() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      if (cancelled || !root.current) return
      gsap.registerPlugin(ScrollTrigger)
      context = gsap.context(() => {
        gsap.from(`.${s.featuredSection} .${s.editorialHeading} > *`, {
          y: 52,
          opacity: 0,
          duration: .9,
          stagger: .12,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.featuredSection}`, start: 'top 78%', once: true },
        })

        gsap.from(`.${s.bentoBook}`, {
          y: 72,
          scale: .96,
          opacity: 0,
          duration: 1,
          stagger: .1,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.featuredBento}`, start: 'top 82%', once: true },
        })

        gsap.from(`.${s.featuredDwarf}`, {
          opacity: 0,
          duration: .7,
          stagger: .06,
          ease: 'power2.out',
          scrollTrigger: { trigger: `.${s.featuredBentoStage}`, start: 'top 80%', once: true },
        })

        gsap.from(`.${s.collectionIntro} > :not(.${s.quixoteTableau})`, {
          y: 34,
          opacity: 0,
          duration: .8,
          stagger: .09,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.collectionStory}`, start: 'top 78%', once: true },
        })

        gsap.from(`.${s.quixoteTableau}`, {
          y: 44,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.collectionStory}`, start: 'top 76%', once: true },
        })

        gsap.utils.toArray<HTMLElement>(`.${s.stackCard}`).forEach((card, index) => {
          gsap.fromTo(card,
            { y: 110, scale: .93, rotate: index % 2 ? 1.2 : -1.2 },
            { y: 0, scale: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: card, start: 'top 94%', end: 'top 42%', scrub: .8 } },
          )
          const imageFrame = card.querySelector<HTMLElement>(`.${s.stackImageFrame}`)
          if (imageFrame) gsap.fromTo(imageFrame, { scale: 1.08, yPercent: -3 }, { scale: 1.08, yPercent: 3, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: 1.2 } })
        })
      }, root)
    }
    void animateFeatured()
    return () => { cancelled = true; context?.revert() }
  }, [featured.length])

  useEffect(() => {
    if (!collectionGenres.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cancelled = false
    let context: { revert: () => void } | undefined
    async function animateGenres() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
      if (cancelled || !root.current) return
      gsap.registerPlugin(ScrollTrigger)
      context = gsap.context(() => {
        gsap.from(`.${s.genreHeading} > *`, {
          y: 48,
          opacity: 0,
          duration: .9,
          stagger: .12,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.genreSection}`, start: 'top 80%', once: true },
        })
        gsap.from(`.${s.genreSlice}`, {
          y: 58,
          opacity: 0,
          duration: .85,
          stagger: .08,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.genreAccordion}`, start: 'top 86%', once: true },
        })
        gsap.from(`.${s.wonderlandTeaParty}`, {
          y: 54,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: `.${s.wonderlandTeaParty}`, start: 'top 90%', once: true },
        })
      }, root)
    }
    void animateGenres()
    return () => { cancelled = true; context?.revert() }
  }, [collectionGenres.length])

  return <div ref={root} className={s.home}>
    <section className={s.hero} aria-labelledby="home-hero-title">
      <div className={s.heroScrim} aria-hidden="true" />
      <div className={s.heroCopy} data-testid="hero-copy">
        <p className={`${s.kicker} ${s.heroReveal}`}>A hand-picked shelf</p>
        <h1 id="home-hero-title" className={`max-w-6xl ${s.heroTitle}`}>
          <span className={s.heroLine}><span className={s.heroWord}>Books worth</span></span>
          <span className={s.heroLine}><span className={s.heroWord}>keeping close.</span></span>
        </h1>
        <p className={`${s.heroDescription} ${s.heroReveal}`}>Enduring stories, chosen by booksellers to be read, revisited, and passed on.</p>
        <div className={s.heroButtons}><Link className={s.primaryButton} to="/books">Browse books <ArrowUpRight size={16} aria-hidden="true" /></Link><Link className={s.heroSecondary} to="/rankings">Bestseller charts</Link></div>
      </div>
      <BookHeroScene books={heroBooks} />
    </section>

    <section className={s.featuredSection}>
      <div className={s.editorialHeading}><h2>Books that leave<br />the light on.</h2><p>Four classics chosen not by algorithm, but by attention. Read slowly, underline freely, lend reluctantly.</p></div>
      {query.isLoading ? <State title="Opening the shelves" /> : query.error ? <ErrorState error={query.error} /> :
        <div className={s.featuredBentoStage} data-testid="featured-bento-stage">
          <div className={s.featuredDwarfs} data-testid="featured-dwarfs" aria-hidden="true">
            {featuredDwarfs.map((dwarf) => <figure
              className={`${s.featuredDwarf} ${dwarf.className}`}
              data-dwarf-id={dwarf.id}
              data-dwarf-side={dwarf.side}
              data-mobile-visible={dwarf.mobile}
              key={dwarf.id}
            >
              <img src={dwarf.src} alt="" width={dwarf.width} height={dwarf.height} loading="lazy" decoding="async" />
            </figure>)}
          </div>
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
          </div>
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
            <Link className={s.stackImage} to={`/books/${book.slug}`}><span className={s.stackImageFrame}><img src={illustration.src} alt={illustration.alt} loading="lazy" decoding="async" style={{ objectPosition: illustration.objectPosition }} /></span></Link>
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

    <MarketGlobe />
    <Testimonials />

    <FaqSection />
    <CtaWithMarquee />
  </div>
}

function Catalog() {
  const [params, setParams] = useSearchParams()
  const queryParam = params.get('q') || ''
  const [searchTerm, setSearchTerm] = useState(queryParam)
  const trackedSearches = useRef(new Set<string>())
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
  useEffect(() => {
    if (!queryParam.trim() || books.isFetching || !books.data || trackedSearches.current.has(queryString)) return
    trackedSearches.current.add(queryString)
    trackAnalytics('catalog_search', { has_results: books.data.total > 0, result_count: books.data.total })
  }, [books.data, books.isFetching, queryParam, queryString])

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
    <div className={s.catalogHero}>
      <div className={`${s.pageHeading} ${s.catalogHeading}`}><span className={s.eyebrow}>THE COMPLETE CATALOGUE</span><h1>Find your next passage</h1><p>Search by a remembered phrase, a beloved author, or simply the mood of the shelf.</p></div>
      <CatalogCharacterScene />
    </div>
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

function BookPage() {
  const { slug = '' } = useParams(); const client = useQueryClient(); const { user } = useAuth(); const navigate = useNavigate()
  const query = useQuery({ queryKey: ['book', slug], queryFn: () => api<Book>(`/books/${slug}`) })
  const trend = useQuery({ queryKey: ['trend', query.data?.id], queryFn: () => api<{ points: Array<{ year: number; average: number; count: number }> }>(`/books/${query.data!.id}/rating-trend`), enabled: !!query.data })
  const [comment, setComment] = useState(''); const [notice, setNotice] = useState(''); const [formNotice, setFormNotice] = useState('')
  const cart = useMutation({ mutationFn: (bookId: string) => api('/cart/items', { method: 'POST', body: JSON.stringify({ book_id: bookId, quantity: 1 }) }), onSuccess: (_, bookId) => { const addedBook = query.data; if (addedBook?.id === bookId) trackAnalytics('add_to_bag', { book_slug: addedBook.slug, quantity: 1, value: addedBook.price_cents / 100, currency: addedBook.currency }); client.invalidateQueries({ queryKey: ['cart'] }); setNotice('Added to your bag') }, onError: (e) => setNotice(e.message) })
  const rate = useMutation({ mutationFn: ({ id, value }: { id: string; value: number }) => api(`/books/${id}/ratings`, { method: 'PUT', body: JSON.stringify({ value }) }), onSuccess: () => { setFormNotice('Your rating has been saved.'); client.invalidateQueries({ queryKey: ['book', slug] }); client.invalidateQueries({ queryKey: ['trend'] }) } })
  const post = useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => api(`/books/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }), onSuccess: () => { setComment(''); setFormNotice('Your note has been published.'); client.invalidateQueries({ queryKey: ['book', slug] }) } })
  if (query.isLoading) return <State title="Opening the book…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />; const book = query.data!
  function needsUser(action: () => void) {
    if (user) action()
    else navigate('/sign-in', { state: { from: `/books/${slug}` } })
  }
  return <div className={s.bookPage}>
    <FormNotification
      title={post.error ? 'Comment not published' : rate.error ? 'Rating not saved' : 'Reading log updated'}
      message={post.error?.message || rate.error?.message || formNotice}
      variant={post.error || rate.error ? 'error' : 'success'}
      onClose={() => { post.reset(); rate.reset(); setFormNotice('') }}
    />
    <PageMeta title={book.title} description={book.description.slice(0, 155)} />
    <div className={s.crumbs}><Link to="/books">All books</Link><CaretRight size={13} aria-hidden="true" />{book.genres[0] && <Link to={`/genres/${book.genres[0].slug}`}>{book.genres[0].name}</Link>}<CaretRight size={13} aria-hidden="true" /><span>{book.title}</span></div>
    <BookDetailExperience book={book} adding={cart.isPending} notice={notice} onAdd={() => needsUser(() => cart.mutate(book.id))} />
    {book.video_url && <section className={s.videoSection}><div><span className={s.eyebrow}>A TWO-MINUTE GLIMPSE</span><h2>Before you turn the first page</h2><p>A short, spoiler-free introduction to the world of the book.</p></div><div className={s.video}><ExternalVideo url={book.video_url} title={`Introduction to ${book.title}`} /></div></section>}
    <section className={s.community}><div><span className={s.eyebrow}>READER’S LOG</span><h2>Ratings over the years</h2>{trend.isLoading ? <State title="Reading the chart…" loading compact /> : trend.error ? <ErrorState error={trend.error} retry={() => void trend.refetch()} compact /> : <div className={s.trend}>{trend.data?.points.length ? trend.data.points.map((p) => <div key={p.year}><span style={{ height: `${Math.max(12, p.average * 20)}%` }} /><b>{p.average}</b><small>{p.year}</small></div>) : <p>No route has been charted yet.</p>}</div>}<div className={s.rateBox}><b>Your reading, your measure</b><div>{[1,2,3,4,5].map((value) => <button type="button" key={value} disabled={rate.isPending} aria-label={`Rate ${value} stars`} onClick={() => needsUser(() => rate.mutate({ id: book.id, value }))}><Star size={24} weight="fill" aria-hidden="true" /></button>)}</div></div></div><div><span className={s.eyebrow}>MARGINALIA</span><h2>From fellow readers</h2>{book.comments?.length ? <div className={s.comments}>{book.comments.map((c) => <article key={c.id}><ReaderAvatar name={c.author} src={c.author_avatar_url} /><div><p>{c.body}</p><small>{c.author} · {new Date(c.created_at).toLocaleDateString()}</small></div></article>)}</div> : <p className={s.muted}>No comments yet. Leave the first note in the margin.</p>}<form className={s.commentForm} aria-busy={post.isPending || undefined} onSubmit={(e) => { e.preventDefault(); setFormNotice(''); needsUser(() => post.mutate({ id: book.id, body: comment })) }}><label htmlFor="comment">Add a thoughtful note</label><textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} minLength={2} maxLength={2000} placeholder="What stayed with you?" required /><button className={s.secondaryButton} disabled={post.isPending}>{post.isPending ? 'Publishing…' : 'Publish comment'}</button></form></div></section>
    {!!book.related?.length && <section className={s.related}><div className={s.sectionHeading}><div><span className={s.eyebrow}>CONTINUE THE JOURNEY</span><h2>Books on a nearby shore</h2></div></div><div className={s.bookGrid}>{book.related.map((x) => <BookCard key={x.id} book={x} />)}</div></section>}
  </div>
}

function Directory({ kind }: { kind: 'genres' | 'authors' }) {
  const query = useQuery({ queryKey: [kind], queryFn: () => api<{ items: Array<Genre | Author> }>(`/${kind}`) })
  const content = query.isLoading
    ? <State title="Consulting the catalogue…" loading />
    : query.error
      ? <ErrorState error={query.error} retry={() => void query.refetch()} />
      : query.data?.items.length
        ? kind === 'authors'
          ? <AuthorShowcase authors={query.data.items as Author[]} />
          : <GenreDirectory genres={query.data.items as Genre[]} />
        : <State title={`No ${kind} available`} text="The shelves are being prepared." />
  return <section className={`${s.page} ${kind === 'authors' ? s.authorsPage : ''}`}>
    {kind === 'authors' ? <div className={s.authorsHero}>
      <div className={s.pageHeading}><span className={s.eyebrow}>THE WRITERS’ ROOM</span><h1>Follow a voice</h1><p>Meet the people behind the passages.</p></div>
      <figure className={s.authorsCharacter}>
        <span className={s.sleepMarks} aria-hidden="true"><i>Z</i><i>Z</i><i>Z</i></span>
        <img src="/assets/authors/puss-in-boots-sleeping.png" alt="A three-dimensional storybook cat in boots sleeping with his feathered hat tipped over his eyes." width="1774" height="887" loading="eager" fetchPriority="high" decoding="async" />
      </figure>
    </div> : <div className={s.genresHero}>
      <div className={s.pageHeading}><span className={s.eyebrow}>SHELVES BY MOOD</span><h1>Choose a current</h1><p>A shelf is a direction, never a boundary.</p></div>
      <figure className={s.genresIllustration}>
        <img src="/assets/genres/harry-potter-voldemort-duel-v2.webp" alt="Harry Potter and Voldemort duelling, with golden and green magic colliding between their wands and green smoke swirling behind Voldemort." width="1920" height="897" loading="eager" decoding="async" />
      </figure>
    </div>}
    {content}
  </section>
}

function Shelf({ kind }: { kind: 'genres' | 'authors' }) {
  const { slug = '' } = useParams(); const query = useQuery({ queryKey: [kind, slug], queryFn: () => api<(Genre | Author) & { books: Book[] }>(`/${kind}/${slug}`) })
  if (query.isLoading) return <State title="Opening the shelf…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  return <section className={s.page}><PageMeta title={query.data?.name ?? 'Shelf'} description={'description' in query.data! ? query.data.description : query.data?.bio ?? 'Browse this Orphaleia shelf.'} /><div className={s.pageHeading}><span className={s.eyebrow}>{kind === 'genres' ? 'GENRE SHELF' : 'AUTHOR SHELF'}</span><h1>{query.data?.name}</h1><p>{'description' in query.data! ? query.data.description : query.data?.bio}</p></div>{query.data?.books.length ? <div className={s.bookGrid}>{query.data.books.map((book) => <BookCard key={book.id} book={book} />)}</div> : <State title="This shelf is waiting" text="No books are currently assigned here." />}</section>
}

function RankingRowsSkeleton() {
  return <div className={s.rankingSkeleton} role="status" aria-label="Loading annual sales rankings" aria-live="polite">
    {[0, 1, 2, 3, 4].map((row) => <span key={row}><i /><i /><i /></span>)}
  </div>
}

function Rankings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === 'concept'
  const selectedYear = searchParams.get('year') ?? ''
  const selectedMarket = searchParams.get('market') ?? ''
  const selectedGenre = searchParams.get('genre') ?? ''
  const requestParams = new URLSearchParams()
  if (selectedYear) requestParams.set('year', selectedYear)
  if (selectedMarket) requestParams.set('market', selectedMarket)
  if (selectedGenre) requestParams.set('genre', selectedGenre)
  const requestSuffix = requestParams.size ? `?${requestParams.toString()}` : ''
  const query = useQuery({
    queryKey: ['sales-rankings', isPreview, selectedYear, selectedMarket, selectedGenre],
    queryFn: () => api<SalesRankingResponse>(`/rankings/sales${requestSuffix}`),
    enabled: !isPreview,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === isPreview ? keepPreviousData(previous) : undefined,
  })
  const previewData = useMemo(() => getRankingPreview(selectedYear, selectedMarket, selectedGenre), [selectedYear, selectedMarket, selectedGenre])
  const data = isPreview ? previewData : query.data

  useEffect(() => {
    if (!data?.available_years.length) return
    const next = new URLSearchParams(searchParams)
    const availableYears = data.available_years.map(String)
    let changed = false
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      next.set('year', String(data.available_years[0]))
      next.delete('market')
      next.delete('genre')
      changed = true
    } else if (data.available_markets.length && (!selectedMarket || !data.available_markets.some((option) => option.value === selectedMarket))) {
      next.set('market', data.available_markets[0].value)
      next.delete('genre')
      changed = true
    } else if (selectedGenre && !data.available_genres.some((option) => option.value === selectedGenre)) {
      next.delete('genre')
      changed = true
    }
    if (changed) setSearchParams(next, { replace: true })
  }, [data, searchParams, selectedGenre, selectedMarket, selectedYear, setSearchParams])

  function updateFilter(key: 'year' | 'market' | 'genre', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'year') {
      next.delete('market')
      next.delete('genre')
    } else if (key === 'market') next.delete('genre')
    setSearchParams(next)
  }

  const yearOptions: SelectOption[] = data?.available_years.map((year) => ({ value: String(year), label: String(year) })) ?? []
  const marketOptions = data?.available_markets ?? []
  const genreOptions: SelectOption[] = [{ value: '', label: 'Every category' }, ...(data?.available_genres ?? [])]
  const maximumUnits = Math.max(0, ...(data?.items.map((item) => item.units_sold) ?? []))
  const showFilters = Boolean(data?.available_years.length)

  return <section className={`${s.page} ${s.rankingsPage}`}>
    {isPreview && <aside className={s.rankingPreviewNotice} aria-label="Concept preview notice">
      <div><strong>Concept preview · Fictional data</strong><p>Invented titles, authors and sales figures for discussion only. Not NielsenIQ BookScan data or an endorsed chart.</p></div>
      <Link to="/rankings">Exit preview <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </aside>}
    <header className={s.rankingsHero}>
      <div className={`${s.pageHeading} ${s.rankingsIntro}`}>
        <span className={s.eyebrow}>ANNUAL BESTSELLER CHART</span>
        <h1>Top-selling books</h1>
        <p>{isPreview ? 'Explore the proposed annual print-sales chart. All values shown are illustrative.' : 'Verified calendar-year print sales across explicitly covered BookScan markets.'}</p>
      </div>
      {showFilters && <div className={s.rankingFilters} aria-label="Ranking filters" aria-busy={query.isFetching || undefined}>
        <SelectControl label="Sales year" labelMode="stacked" value={selectedYear || String(data?.year ?? '')} options={yearOptions} disabled={query.isFetching} onChange={(value) => updateFilter('year', value)} />
        <SelectControl label="Market" labelMode="stacked" value={selectedMarket || data?.market || ''} options={marketOptions} disabled={query.isFetching} onChange={(value) => updateFilter('market', value)} />
        <SelectControl label="Category" labelMode="stacked" value={selectedGenre} options={genreOptions} disabled={query.isFetching} onChange={(value) => updateFilter('genre', value)} />
      </div>}
    </header>

    {!isPreview && query.isLoading ? <RankingRowsSkeleton /> : !isPreview && query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : data?.status === 'unavailable' ? <State title="Verified annual data is not published yet" text="Orphaleia will show licensed print-sales rankings here once the source and public-display rights have been confirmed." action={{ label: 'View concept preview', onClick: () => setSearchParams({ preview: 'concept' }) }} /> : <>
      {isPreview && <aside className={s.rankingSource} aria-label="Demo chart details"><p><strong>Illustrative dataset</strong><span>Calendar year {data?.year}</span><span>{data?.scope_label}</span><span>Print editions</span></p><details><summary>About this concept</summary><div><p>Every book, author and count is fictional. Filters demonstrate the intended interaction, not actual market performance.</p><p>In a licensed chart, this area will identify the provider, covered markets and methodology. Public display remains subject to agreement.</p></div></details></aside>}
      {data?.source && <aside className={s.rankingSource} aria-label="Chart source and methodology">
        <p><span>Source</span><a href={data.source.url} target="_blank" rel="noreferrer">{data.source.name}</a><i aria-hidden="true" /> <span>{data.year}</span><i aria-hidden="true" /> <span>{data.scope_label}</span><i aria-hidden="true" /> <span>Print editions</span></p>
        <details><summary>Coverage and methodology</summary><div><p>{data.source.coverage_note}</p><p>{data.source.methodology_note}</p></div></details>
      </aside>}
      {data?.items.length ? <div className={`${s.salesRanking} ${query.isFetching ? s.rankingUpdating : ''}`} aria-busy={query.isFetching || undefined}>
        <div className={s.rankingColumns} aria-hidden="true"><span>Rank</span><span>Title &amp; author</span><span>Category</span><span>{isPreview ? 'Illustrative copies sold' : 'Copies sold'}</span></div>
        <ol aria-label={`${isPreview ? 'Fictional concept: ' : ''}${data.year} top-selling print books in ${data.scope_label}`}>
          {data.items.map((item) => <li key={`${item.rank}-${item.title}`}>
            <span className={s.salesRank} aria-label={`Rank ${item.rank}`}>{String(item.rank).padStart(2, '0')}</span>
            <div className={s.rankingBook}><h2>{item.catalog_slug ? <Link to={`/books/${item.catalog_slug}`}>{item.title}</Link> : item.title}</h2><p>{item.authors.join(', ')}</p></div>
            <span className={s.rankingGenre}>{item.genre}</span>
            <div className={s.salesMeasure} aria-label={`${formatSalesUnits(item.units_sold)} ${isPreview ? 'illustrative ' : ''}copies sold`}>
              <span className={s.salesBar} aria-hidden="true"><span style={{ transform: `scaleX(${salesBarRatio(item.units_sold, maximumUnits)})` }} /></span>
              <strong>{formatSalesUnits(item.units_sold)}</strong>
            </div>
          </li>)}
        </ol>
      </div> : <State title="No books match these filters" text="Choose every category or select another annual market chart." action={selectedGenre ? { label: 'Reset category', onClick: () => updateFilter('genre', '') } : undefined} />}
    </>}
  </section>
}

function AuthPage({ register = false }: { register?: boolean }) {
  const { user, refresh } = useAuth(); const navigate = useNavigate(); const location = useLocation(); const [error, setError] = useState(''); const [fieldError, setFieldError] = useState(''); const [sent, setSent] = useState<{ message: string; email: string; previewUrl?: string } | null>(null); const [notificationOpen, setNotificationOpen] = useState(false); const [submitting, setSubmitting] = useState(false); const [showPassword, setShowPassword] = useState(false); const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  if (user) return <Navigate to="/account" />
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setFieldError('')
    setSent(null)
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password') || '')
    if (register && password !== String(form.get('confirmPassword') || '')) {
      setFieldError('Passwords do not match.')
      setNotificationOpen(true)
      return
    }
    setSubmitting(true)
    try {
      if (register) {
        const email = String(form.get('email') || '')
        const result = await api<{ message: string; email_preview_url?: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, full_name: form.get('name'), password }) })
        setSent({ message: result.message, email, previewUrl: result.email_preview_url })
        setNotificationOpen(true)
      } else {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password }) })
        await refresh()
        navigate((location.state as { from?: string })?.from || '/account')
      }
    } catch (err) {
      setError((err as Error).message)
      setNotificationOpen(true)
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
    <FormNotification
      title={sent ? 'Email sent' : fieldError ? 'Check your passwords' : register ? 'Account not created' : 'Sign-in failed'}
      message={notificationOpen ? sent ? `${sent.message}. We sent the link to ${sent.email}.` : fieldError || error : ''}
      variant={sent ? 'success' : 'error'}
      onClose={() => { setNotificationOpen(false); setError(''); setFieldError('') }}
    />
    <div className={s.authFormPanel} data-testid="auth-form-panel">
      <form className={s.authForm} onSubmit={submit} aria-busy={submitting}>
        <div className={s.authHeading}>
          <span className={s.eyebrow}>YOUR READER’S PASSAGE</span>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        {sent ? <div className={s.authSuccess} role="status" aria-live="polite">
          <span className={s.authSuccessIcon}><EnvelopeSimple size={26} weight="duotone" aria-hidden="true" /></span>
          <div><h2>Email sent</h2><p>{sent.message}. We sent the link to <strong>{sent.email}</strong>.</p></div>
          {sent.previewUrl && <a className={`${s.primaryButton} ${s.authSubmit}`} href={sent.previewUrl} target="_blank" rel="noreferrer">Open development inbox <ArrowUpRight size={16} aria-hidden="true" /></a>}
          <p className={s.authSwitch}>Already verified? <Link to="/sign-in">Sign in</Link></p>
        </div> : <>
          {register && <label>Your name<input name="name" placeholder="Your name" required minLength={2} autoComplete="name" /></label>}
          <label>Email address<input name="email" type="email" placeholder="reader@orphaleia.com" required autoComplete="email" aria-invalid={Boolean(error) || undefined} /></label>
          <label>Password<span className={s.passwordField}><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required minLength={10} autoComplete={register ? 'new-password' : 'current-password'} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="auth-password">{showPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></label>
          {!register && <Link className={s.authForgot} to="/forgot-password">Forgot your password?</Link>}
          {register && <label>Confirm password<span className={s.passwordField}><input id="auth-confirm-password" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat your password" required minLength={10} autoComplete="new-password" aria-invalid={Boolean(fieldError) || undefined} /><button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-controls="auth-confirm-password">{showConfirmPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></label>}
          {register && <p className={s.legalAcknowledgement}>By creating an account, you agree to our <Link to="/terms">Terms and Conditions</Link> and acknowledge our <Link to="/privacy">Privacy Policy</Link>.</p>}
          <button className={`${s.primaryButton} ${s.authSubmit}`} disabled={submitting}>{submitting ? register ? 'Creating account…' : 'Signing in…' : register ? 'Create account' : 'Sign in'} {!submitting && <ArrowRight size={16} aria-hidden="true" />}</button>
          <p className={s.authSwitch}>{register ? <>Already aboard? <Link to="/sign-in">Sign in</Link></> : <>New to Orphaleia? <Link to="/register">Create an account</Link></>}</p>
        </>}
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

function TokenPage({ mode }: { mode: 'verify' | 'reset' | 'forgot' | 'email-change' }) {
  const { refresh } = useAuth(); const [params] = useSearchParams(); const token = params.get('token'); const requestStarted = useRef(false); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState((mode === 'verify' || mode === 'email-change') && Boolean(token))
  useEffect(() => {
    if (mode !== 'verify' && mode !== 'email-change') return
    if (!token) { setError(`This ${mode === 'verify' ? 'verification' : 'email change'} link is missing its token. Request a new email and try again.`); setBusy(false); return }
    if (requestStarted.current) return
    requestStarted.current = true
    api<{ message: string }>(mode === 'verify' ? '/auth/verify' : '/auth/confirm-email-change', { method: 'POST', body: JSON.stringify({ token }) }).then(async (x) => { setMessage(x.message); if (mode === 'email-change') await refresh() }).catch((e) => setError(e.message)).finally(() => setBusy(false))
  }, [mode, token, refresh])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (mode === 'reset' && !token) { setError('This reset link is missing its token. Request a new link and try again.'); return }
    const data = new FormData(e.currentTarget); setBusy(true); setError(''); setMessage('')
    try {
      const result = mode === 'forgot' ? await api<{ message: string }>('/auth/request-reset', { method: 'POST', body: JSON.stringify({ email: data.get('email') }) }) : await api<{ message: string }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password: data.get('password') }) })
      setMessage(result.message)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  if (mode === 'verify') return <VerificationPassage busy={busy} message={message} error={error} />
  if (mode === 'email-change') return <section className={s.narrowPage}><span className={s.eyebrow}>ACCOUNT SECURITY</span><h1>Confirm your new email</h1>{busy ? <State title="Checking your link…" loading compact /> : message ? <p className={s.notice} role="status">{message}</p> : error ? <p className={s.formError} role="alert">{error}</p> : null}<Link className={s.primaryButton} to="/sign-in">Continue to sign in</Link></section>
  return <section className={s.narrowPage}>
    <FormNotification title={error ? 'Request failed' : mode === 'forgot' ? 'Reset email sent' : 'Password updated'} message={error || message} variant={error ? 'error' : 'success'} onClose={() => { setError(''); setMessage('') }} />
    <span className={s.eyebrow}>ACCOUNT PASSAGE</span><h1>{mode === 'forgot' ? 'Find your way back' : 'Choose a new password'}</h1><form className={s.stackForm} aria-busy={busy || undefined} onSubmit={submit}><label>{mode === 'forgot' ? 'Email address' : 'New password'}<input name={mode === 'forgot' ? 'email' : 'password'} type={mode === 'forgot' ? 'email' : 'password'} required minLength={mode === 'forgot' ? undefined : 10} autoComplete={mode === 'forgot' ? 'email' : 'new-password'} /></label><button className={s.primaryButton} disabled={busy}>{busy ? 'Sending…' : mode === 'forgot' ? 'Send reset link' : 'Save new password'}</button></form>
  </section>
}

function CartPage() {
  const { user, loading } = useAuth(); const client = useQueryClient(); const query = useQuery({ queryKey: ['cart'], queryFn: () => api<Cart>('/cart'), enabled: !!user })
  const remove = useMutation({ mutationFn: (item: Cart['items'][number]) => api(`/cart/items/${item.id}`, { method: 'DELETE' }), onSuccess: (_, item) => { trackAnalytics('remove_from_bag', { book_slug: item.book.slug, quantity: item.quantity, value: item.book.price_cents * item.quantity / 100, currency: query.data?.currency ?? 'EUR' }); client.invalidateQueries({ queryKey: ['cart'] }) } })
  if (loading) return <State title="Finding your bag…" loading />; if (!user) return <Navigate to="/sign-in" state={{ from: '/cart' }} />; if (query.isLoading) return <State title="Opening your bag…" loading />; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const cart = query.data!; const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0); return <section className={s.page}><div className={s.pageHeading}><span className={s.eyebrow}>YOUR BOOK BAG</span><h1>Books for the crossing</h1></div>{cart.items.length ? <div className={s.cartLayout}><div className={s.cartItems}>{cart.items.map((item) => <article key={item.id}><img src={item.book.cover_url} alt={`Cover of ${item.book.title}`} width="80" height="120" /><div><h2><Link to={`/books/${item.book.slug}`}>{item.book.title}</Link></h2><p>Quantity: {item.quantity}</p><button className={s.textButton} disabled={remove.isPending} onClick={() => remove.mutate(item)}>{remove.isPending ? 'Removing…' : 'Remove'}</button></div><b>{money(item.book.price_cents * item.quantity)}</b></article>)}</div><aside className={s.orderCard}><h2>Order summary</h2><div><span>Books</span><b>{money(cart.subtotal_cents)}</b></div><div><span>Shipping</span><span>Calculated next</span></div><hr /><div className={s.total}><span>Subtotal</span><b>{money(cart.subtotal_cents)}</b></div><Link className={s.primaryButton} to="/checkout" onClick={() => trackAnalytics('checkout_started', { item_count: itemCount, value: cart.subtotal_cents / 100, currency: cart.currency })}>Continue to delivery <ArrowRight size={16} aria-hidden="true" /></Link><small>VAT included · Secure checkout</small>{remove.error && <p className={s.formError} role="alert">{remove.error.message}</p>}</aside></div> : <CartEmptyState />}</section>
}

function Checkout() {
  const { user } = useAuth(); const navigate = useNavigate(); const client = useQueryClient(); const [address, setAddress] = useState<Address>(() => user?.default_shipping_address ?? emptyAddress(user?.full_name)); const [saveAsDefault, setSaveAsDefault] = useState(false); const [quote, setQuote] = useState<{ subtotal_cents: number; shipping_cents: number; total_cents: number; currency?: string } | null>(null); const [quoteNotice, setQuoteNotice] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const checkoutAttempt = useRef<{ payload: string; key: string } | null>(null)
  if (!user) return <Navigate to="/sign-in" state={{ from: '/checkout' }} />
  async function quoteOrder(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); setQuoteNotice(false); try { const nextQuote = await api<{ subtotal_cents: number; shipping_cents: number; total_cents: number; currency?: string }>('/checkout/quote', { method: 'POST', body: JSON.stringify({ address }) }); setQuote(nextQuote); setQuoteNotice(true); trackAnalytics('delivery_quoted', { subtotal: nextQuote.subtotal_cents / 100, shipping: nextQuote.shipping_cents / 100, value: nextQuote.total_cents / 100, currency: nextQuote.currency || 'EUR' }) } catch (err) { setError((err as Error).message) } finally { setBusy(false) } }
  async function pay(provider: 'stripe' | 'paypal') { setBusy(true); setError(''); try { if (saveAsDefault) { const nextUser = await api<User>('/users/me/delivery-address', { method: 'PUT', body: JSON.stringify(address) }); client.setQueryData(['me'], nextUser) } const payload = JSON.stringify({ address }); if (!checkoutAttempt.current || checkoutAttempt.current.payload !== payload) checkoutAttempt.current = { payload, key: crypto.randomUUID() }; const order = await api<Order>('/orders', { method: 'POST', headers: { 'Idempotency-Key': checkoutAttempt.current.key }, body: payload }); trackAnalytics('payment_selected', { provider, value: order.total_cents / 100, currency: order.currency || quote?.currency || 'EUR' }); const payment = await api<{ redirect_url: string }>(`/payments/${provider}/start?order_id=${order.id}`, { method: 'POST' }); window.location.assign(payment.redirect_url) } catch (err) { setError((err as Error).message); setBusy(false) } }
  return <section className={s.checkoutPage}>
    <FormNotification title={error ? 'Checkout could not continue' : 'Delivery calculated'} message={error || (quoteNotice ? 'Your delivery rate and order total are ready.' : '')} variant={error ? 'error' : 'success'} onClose={() => { setError(''); setQuoteNotice(false) }} />
    <div><span className={s.eyebrow}>DELIVERY</span><h1>Where should these stories find you?</h1>
      <form className={s.checkoutForm} onSubmit={quoteOrder} aria-busy={busy || undefined}>
        {addressFields.map(({ key, label, required, autoComplete }) => <label key={key}>{label}<input value={address[key]} required={required} autoComplete={autoComplete} onChange={(e) => { setAddress({ ...address, [key]: e.target.value }); setQuote(null); setQuoteNotice(false) }} /></label>)}
        <SelectControl label="Country" labelMode="stacked" value={address.country} options={countryOptions} onChange={(value) => { setAddress({ ...address, country: value }); setQuote(null); setQuoteNotice(false) }} />
        <label className={s.checkoutSaveAddress}><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /> <span><b>Save as my default delivery address</b><small>Use these details to prefill future checkouts.</small></span></label>
        <button className={s.secondaryButton} disabled={busy}>{busy ? 'Calculating…' : 'Calculate delivery'}</button>
      </form>
    </div>
    <aside className={s.orderCard}><h2>Final passage</h2>{quote ? <>
      <div><span>Books</span><b>{money(quote.subtotal_cents)}</b></div><div><span>Delivery</span><b>{money(quote.shipping_cents)}</b></div><hr /><div className={s.total}><span>Total</span><b>{money(quote.total_cents)}</b></div>
      <p className={s.legalAcknowledgement}>By selecting a payment option, you agree to our <Link to="/terms">Terms and Conditions</Link>, acknowledge our <Link to="/privacy">Privacy Policy</Link>, and confirm an obligation to pay.</p>
      <button className={s.stripeButton} disabled={busy} onClick={() => void pay('stripe')}>{busy ? 'Opening payment…' : 'Pay securely with Stripe'}</button>
      <button className={s.paypalButton} disabled={busy} onClick={() => void pay('paypal')}>{busy ? 'Opening payment…' : 'Pay with PayPal'}</button>
    </> : <p>Enter your address to see delivery and the final total.</p>}
      <button type="button" className={s.textButton} onClick={() => navigate('/cart')}><ArrowLeft size={15} aria-hidden="true" /> Return to bag</button>
    </aside>
  </section>
}

function PaymentReturn() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const client = useQueryClient(); const requestStarted = useRef(false); const order = params.get('order'); const provider = params.get('provider'); const reference = params.get('reference') || params.get('token'); const validProvider = provider === 'stripe' || provider === 'paypal'; const valid = Boolean(order && validProvider && reference)
  const [status, setStatus] = useState(valid ? 'Confirming your payment…' : 'We could not identify this payment return.'); const [busy, setBusy] = useState(valid); const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (!order || !reference || (provider !== 'stripe' && provider !== 'paypal')) return
    if (requestStarted.current) return
    requestStarted.current = true
    api<Order>(`/payments/${provider}/complete?order_id=${order}&reference=${encodeURIComponent(reference)}`, { method: 'POST' }).then((completed) => { const review = completed.status === 'payment_review'; setStatus(review ? 'Your payment was received and needs manual review.' : 'Payment confirmed. Your books are reserved.'); setConfirmed(true); navigate('/payment/return', { replace: true }); const itemCount = completed.items.reduce((sum, item) => sum + item.quantity, 0); if (review) trackAnalytics('payment_review', { provider, value: completed.total_cents / 100, currency: completed.currency, item_count: itemCount }); else if (completed.status === 'paid') trackAnalytics('purchase', { provider, revenue: completed.total_cents / 100, currency: completed.currency, item_count: itemCount }); client.invalidateQueries({ queryKey: ['cart'] }) }).catch((e) => setStatus(e.message)).finally(() => setBusy(false))
  }, [order, provider, reference, client, navigate])
  return <section className={s.narrowPage}>{busy ? <State title="Confirming your payment…" loading compact /> : <><div className={s.seal}>{confirmed ? <Check size={42} aria-hidden="true" /> : '?'}</div><span className={s.eyebrow}>{confirmed ? 'ORDER RECEIVED' : 'PAYMENT STATUS'}</span><h1 role="status">{status}</h1><p>{confirmed ? 'You can follow fulfillment from your account.' : 'Return to your bag or contact the shop if a payment was completed.'}</p><Link className={s.primaryButton} to={confirmed ? '/account' : '/cart'}>{confirmed ? 'View my orders' : 'Return to bag'} <ArrowRight size={16} aria-hidden="true" /></Link></>}</section>
}

function Account() {
  const { user, loading, refresh } = useAuth()
  if (loading) return <State title="Opening your account…" loading />; if (!user) return <Navigate to="/sign-in" />
  return <AccountHub user={user} refresh={refresh} />
}

function Admin() {
  const { user, loading } = useAuth(); const client = useQueryClient(); const [tab, setTab] = useState('overview'); const [message, setMessage] = useState(''); const [messageVariant, setMessageVariant] = useState<NotificationVariant>('success'); const [taxonomyBusy, setTaxonomyBusy] = useState(false)
  const overview = useQuery({ queryKey: ['admin-overview'], queryFn: () => api<Record<string, number>>('/admin/overview'), enabled: user?.role === 'admin' })
  const books = useQuery({ queryKey: ['admin-books'], queryFn: () => api<{ items: Book[] }>('/admin/books'), enabled: user?.role === 'admin' && tab === 'books' })
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => api<{ items: Order[] }>('/admin/orders'), enabled: user?.role === 'admin' && tab === 'orders' })
  const comments = useQuery({ queryKey: ['admin-comments'], queryFn: () => api<{ items: Array<{ id: string; body: string; visible: boolean; author: string; book: string }> }>('/admin/comments'), enabled: user?.role === 'admin' && tab === 'comments' })
  const readers = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ items: User[] }>('/admin/users'), enabled: user?.role === 'admin' && tab === 'readers' })
  const authors = useQuery({ queryKey: ['authors'], queryFn: () => api<{ items: Author[] }>('/authors'), enabled: user?.role === 'admin' && tab === 'taxonomy' })
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres'), enabled: user?.role === 'admin' && tab === 'taxonomy' })
  type Zone = { id: string; name: string; country_codes: string[]; rate_cents: number; free_over_cents?: number; active: boolean }
  const zones = useQuery({ queryKey: ['admin-zones'], queryFn: () => api<{ items: Zone[] }>('/admin/shipping-zones'), enabled: user?.role === 'admin' && tab === 'shipping' })
  const moderate = useMutation({ mutationFn: ({ id, visible }: { id: string; visible: boolean }) => api(`/admin/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ visible }) }), onSuccess: () => { setMessageVariant('success'); setMessage('Comment visibility updated.'); client.invalidateQueries({ queryKey: ['admin-comments'] }) } })
  const resetAvatar = useMutation({ mutationFn: (id: string) => api<User>(`/admin/users/${id}/avatar`, { method: 'DELETE' }), onSuccess: () => { setMessageVariant('success'); setMessage('Reader portrait removed.'); client.invalidateQueries({ queryKey: ['admin-users'] }) } })
  async function createAuthor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    setTaxonomyBusy(true)
    setMessage('')
    try {
      const uploadedPortrait = await uploadImage(data.get('portrait_file'))
      const imageUrl = uploadedPortrait || String(data.get('image_url') || '').trim()
      if (!imageUrl) throw new Error('Upload a portrait or provide a portrait URL')
      await api('/admin/authors', { method: 'POST', body: JSON.stringify({ name: data.get('name'), slug: data.get('slug'), bio: data.get('description'), image_url: imageUrl }) })
      form.reset()
      await client.invalidateQueries({ queryKey: ['authors'] })
      setMessageVariant('success')
      setMessage('Author added.')
    } catch (err) {
      setMessageVariant('error')
      setMessage((err as Error).message)
    } finally {
      setTaxonomyBusy(false)
    }
  }
  async function createGenre(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); setTaxonomyBusy(true); setMessage(''); try { await api('/admin/genres', { method: 'POST', body: JSON.stringify({ name: f.get('name'), slug: f.get('slug'), description: f.get('description') }) }); form.reset(); await client.invalidateQueries({ queryKey: ['genres'] }); setMessageVariant('success'); setMessage('Genre added.') } catch (err) { setMessageVariant('error'); setMessage((err as Error).message) } finally { setTaxonomyBusy(false) } }
  async function createZone(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); setMessage(''); try { await api('/admin/shipping-zones', { method: 'POST', body: JSON.stringify({ name: f.get('name'), country_codes: String(f.get('countries')).split(',').map((x) => x.trim()), rate_cents: Math.round(Number(f.get('rate')) * 100), free_over_cents: f.get('free') ? Math.round(Number(f.get('free')) * 100) : null, active: true }) }); e.currentTarget.reset(); client.invalidateQueries({ queryKey: ['admin-zones'] }); setMessageVariant('success'); setMessage('Shipping zone added.') } catch (err) { setMessageVariant('error'); setMessage((err as Error).message) } }
  if (loading) return <State title="Checking the keeper’s seal…" loading />; if (user?.role !== 'admin') return <Navigate to="/" />
  const mutationError = moderate.error || resetAvatar.error
  return <section className={s.adminPage}>
    <FormNotification title={mutationError || messageVariant === 'error' ? 'Admin action failed' : 'Admin updated'} message={mutationError?.message || message} variant={mutationError ? 'error' : messageVariant} onClose={() => { setMessage(''); moderate.reset(); resetAvatar.reset() }} />
    <aside className={s.adminNav}><span className={s.eyebrow}>KEEPER’S DESK</span><h1>Shop admin</h1>{['overview','books','taxonomy','shipping','orders','comments','readers'].map((x) => <button type="button" className={tab === x ? s.activeTab : ''} aria-current={tab === x ? 'page' : undefined} key={x} onClick={() => setTab(x)}>{x}</button>)}</aside><div className={s.adminContent}>
    {tab === 'overview' && <><h2>Today at Orphaleia</h2>{overview.isLoading ? <State title="Loading the overview…" loading compact /> : overview.error ? <ErrorState error={overview.error} retry={() => void overview.refetch()} compact /> : <><div className={s.stats}>{overview.data && Object.entries(overview.data).map(([key,value]) => <article key={key}><span>{key.replace('_',' ')}</span><b>{value}</b></article>)}</div><div className={s.adminNote}><h3>Operations note</h3><p>Payment events are replay-safe, stock reservations expire after 30 minutes, and outbound messages are handled by the worker.</p></div></>}</>}
    {tab === 'books' && <><div className={s.adminTitle}><h2>Catalog</h2><Link className={s.secondaryButton} to="/admin/books/new">Add book</Link></div>{books.isLoading ? <State title="Loading the catalog…" loading compact /> : books.error ? <ErrorState error={books.error} retry={() => void books.refetch()} compact /> : books.data?.items.length ? <div className={s.table}>{books.data.items.map((book) => <div className={s.tableRow} key={book.id}><img src={book.cover_url} alt={`Cover of ${book.title}`} width="42" height="64" loading="lazy" /><div><b>{book.title}</b><small>{book.authors.map((x) => x.name).join(', ')} · <Link to={`/admin/books/${book.slug}/edit`}>Edit</Link></small></div><span>{money(book.price_cents)}</span><span>{book.stock_qty} in stock</span><span className={book.active ? s.live : s.draft}>{book.active ? 'Live' : 'Hidden'}</span></div>)}</div> : <State title="No catalog books" compact />}</>}
    {tab === 'taxonomy' && <><h2>Authors and shelves</h2>{authors.isLoading || genres.isLoading ? <State title="Loading taxonomy…" loading compact /> : authors.error || genres.error ? <ErrorState error={authors.error || genres.error} retry={() => { void authors.refetch(); void genres.refetch() }} compact /> : <div className={s.adminForms}><form className={s.stackForm} aria-busy={taxonomyBusy || undefined} onSubmit={(e) => void createAuthor(e)}><h3>Add author</h3><label>Name<input name="name" required /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Biography<textarea name="description" /></label><label>Upload portrait<input name="portrait_file" type="file" accept="image/png,image/jpeg,image/webp" /></label><label>Or use a portrait URL<input name="image_url" placeholder="https://… or /media/…" /></label><button className={s.secondaryButton} disabled={taxonomyBusy}>{taxonomyBusy ? 'Adding…' : 'Add author'}</button><small>{authors.data?.items.length ?? 0} authors currently available</small></form><form className={s.stackForm} aria-busy={taxonomyBusy || undefined} onSubmit={(e) => void createGenre(e)}><h3>Add genre</h3><label>Name<input name="name" required /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Description<textarea name="description" /></label><button className={s.secondaryButton} disabled={taxonomyBusy}>{taxonomyBusy ? 'Adding…' : 'Add genre'}</button><small>{genres.data?.items.length ?? 0} shelves currently available</small></form></div>}</>}
    {tab === 'shipping' && <><h2>Shipping zones</h2>{zones.isLoading ? <State title="Loading shipping zones…" loading compact /> : zones.error ? <ErrorState error={zones.error} retry={() => void zones.refetch()} compact /> : <><div className={s.shippingList}>{zones.data?.items.length ? zones.data.items.map((zone) => <article key={zone.id}><div><b>{zone.name}</b><small>{zone.country_codes.join(', ')}</small></div><span>{money(zone.rate_cents)} delivery</span><span>{zone.free_over_cents ? `Free over ${money(zone.free_over_cents)}` : 'No free threshold'}</span></article>) : <State title="No shipping zones" compact />}</div><form className={s.inlineForm} onSubmit={(e) => void createZone(e)}><label>Zone name<input name="name" required /></label><label>Country codes<input name="countries" placeholder="ES, PT" required /></label><label>Rate in EUR<input name="rate" type="number" min="0" step="0.01" required /></label><label>Free over EUR<input name="free" type="number" min="0" step="0.01" /></label><button className={s.primaryButton}>Add zone</button></form></>}</>}
    {tab === 'orders' && <><h2>Orders</h2><p className={s.muted}>Advance fulfilment one step at a time. Shipment and delivery milestones notify the reader.</p>{orders.isLoading ? <State title="Loading orders…" loading compact /> : orders.error ? <ErrorState error={orders.error} retry={() => void orders.refetch()} compact /> : orders.data?.items.length ? <div className={s.adminOrders}>{orders.data.items.map((order) => <AdminOrderOperations order={order} key={order.id} />)}</div> : <State title="No orders yet" compact />}</>}
    {tab === 'comments' && <><h2>Reader comments</h2>{comments.isLoading ? <State title="Loading comments…" loading compact /> : comments.error ? <ErrorState error={comments.error} retry={() => void comments.refetch()} compact /> : comments.data?.items.length ? <div className={s.moderation}>{comments.data.items.map((item) => <article key={item.id}><div><b>{item.author} on {item.book}</b><p>{item.body}</p></div><button className={s.secondaryButton} disabled={moderate.isPending} onClick={() => { setMessage(''); moderate.mutate({ id: item.id, visible: !item.visible }) }}>{moderate.isPending ? 'Saving…' : item.visible ? 'Hide' : 'Publish'}</button></article>)}</div> : <State title="No comments to moderate" compact />}</>}
    {tab === 'readers' && <><h2>Readers</h2><p className={s.muted}>Remove public portraits that do not belong in the reading room.</p>{readers.isLoading ? <State title="Loading readers…" loading compact /> : readers.error ? <ErrorState error={readers.error} retry={() => void readers.refetch()} compact /> : readers.data?.items.length ? <div className={s.readerRows}>{readers.data.items.map((reader) => <article key={reader.id}><ReaderAvatar name={reader.full_name} src={reader.avatar_url} size="admin" /><div><b>{reader.full_name}</b><small>{reader.email} · {reader.role}</small></div>{reader.avatar_url ? <button className={s.secondaryButton} disabled={resetAvatar.isPending} onClick={() => { setMessage(''); resetAvatar.mutate(reader.id) }}>{resetAvatar.isPending ? 'Removing…' : 'Remove portrait'}</button> : <span className={s.muted}>Initials in use</span>}</article>)}</div> : <State title="No readers yet" compact />}</>}
  </div></section>
}

function BookEditor({ edit = false }: { edit?: boolean }) {
  const { user } = useAuth()
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const authors = useQuery({ queryKey: ['authors'], queryFn: () => api<{ items: Author[] }>('/authors') })
  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api<{ items: Genre[] }>('/genres') })
  const bookQuery = useQuery({ queryKey: ['book', slug], queryFn: () => api<Book>(`/books/${slug}`), enabled: edit && !!slug })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [authorId, setAuthorId] = useState('')
  const [genreId, setGenreId] = useState('')
  const book = bookQuery.data

  useEffect(() => {
    if (edit && book) {
      setAuthorId((current) => current || book.authors[0]?.id || '')
      setGenreId((current) => current || book.genres[0]?.id || '')
      return
    }
    if (!authorId && authors.data?.items[0]) setAuthorId(authors.data.items[0].id)
    if (!genreId && genres.data?.items[0]) setGenreId(genres.data.items[0].id)
  }, [authorId, authors.data, book, edit, genreId, genres.data])

  if (user?.role !== 'admin') return <Navigate to="/" />
  if (edit && bookQuery.isLoading) return <State title="Opening the catalog record…" loading />
  if (edit && bookQuery.error) return <ErrorState error={bookQuery.error} retry={() => void bookQuery.refetch()} />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const uploadedCover = await uploadImage(form.get('cover_file'))
      const cover = uploadedCover || String(form.get('cover') || '') || book?.cover_url || ''
      if (!cover) throw new Error('Upload a cover or provide a cover URL')

      const uploadedInterior = await uploadImage(form.get('interior_file'))
      const interiorImage = uploadedInterior || String(form.get('interior_image_url') || '')
      const interiorAlt = String(form.get('interior_image_alt') || '').trim()
      if (interiorImage && !interiorAlt) throw new Error('Describe the interior artwork for screen-reader users')

      const payload = {
        title: form.get('title'),
        slug: form.get('slug'),
        isbn: form.get('isbn'),
        description: form.get('description'),
        publication_year: Number(form.get('year')),
        price_cents: Math.round(Number(form.get('price')) * 100),
        stock_qty: Number(form.get('stock')),
        cover_url: cover,
        interior_image_url: interiorImage || null,
        interior_image_alt: interiorImage ? interiorAlt : null,
        pull_quote: String(form.get('pull_quote') || '').trim() || null,
        video_url: form.get('video') || null,
        featured: form.get('featured') === 'on',
        active: form.get('active') === 'on',
        author_ids: [form.get('author')],
        genre_ids: [form.get('genre')],
      }
      await api(edit && book ? `/admin/books/${book.id}` : '/admin/books', { method: edit ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      navigate('/admin')
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  const authorOptions = authors.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []
  const genreOptions = genres.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []
  const title = edit ? `Edit ${book?.title}` : 'Add a book'
  return <section className={s.narrowPage}>
    <FormNotification title={edit ? 'Book not updated' : 'Book not published'} message={error} variant="error" onClose={() => setError('')} />
    <span className={s.eyebrow}>KEEPER’S DESK</span>
    <h1>{title}</h1>
    <form key={book?.id || 'new-book'} className={s.stackForm} aria-busy={busy || undefined} onSubmit={submit}>
      <label>Title<input name="title" defaultValue={book?.title} required /></label>
      <label>Slug<input name="slug" defaultValue={book?.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
      <label>ISBN<input name="isbn" defaultValue={book?.isbn} required /></label>
      <label>Description<textarea name="description" defaultValue={book?.description} minLength={20} required /></label>
      <div className={s.formColumns}>
        <label>Publication year<input name="year" type="number" defaultValue={book?.publication_year} min="1450" max="2100" required /></label>
        <label>Price in EUR<input name="price" type="number" defaultValue={book ? book.price_cents / 100 : undefined} min="0" step="0.01" required /></label>
        <label>Stock<input name="stock" type="number" defaultValue={book?.stock_qty} min="0" required /></label>
      </div>
      <label>Upload cover<input name="cover_file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
      <label>Or use a cover URL<input name="cover" defaultValue={book?.cover_url} /></label>
      <fieldset className={s.editorialFields}>
        <legend>Interactive book spread</legend>
        <p>Add optional artwork and a short phrase for the inside page. The cover and first description sentence are used when these are blank.</p>
        <label>Upload interior artwork<input name="interior_file" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <label>Or use an interior artwork URL<input name="interior_image_url" defaultValue={book?.interior_image_url} /></label>
        <label>Interior artwork description<input name="interior_image_alt" defaultValue={book?.interior_image_alt} maxLength={300} placeholder="A watercolor night sky over a small asteroid" /></label>
        <label>Pull quote<textarea name="pull_quote" defaultValue={book?.pull_quote} maxLength={280} placeholder="A brief, spoiler-free line for the illustrated page" /></label>
      </fieldset>
      <label>Video URL<input name="video" type="url" defaultValue={book?.video_url} /></label>
      <SelectControl label="Author" labelMode="stacked" name="author" value={authorId} options={authorOptions} busy={authors.isLoading} onChange={setAuthorId} />
      <SelectControl label="Genre" labelMode="stacked" name="genre" value={genreId} options={genreOptions} busy={genres.isLoading} onChange={setGenreId} />
      <label className={s.check}><input name="featured" type="checkbox" defaultChecked={book?.featured} /> Feature on home</label>
      <label className={s.check}><input name="active" type="checkbox" defaultChecked={book?.active ?? true} /> Visible in catalog</label>
      <button className={s.primaryButton} disabled={busy || !authorId || !genreId}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Publish book'}</button>
    </form>
  </section>
}

export default function App() {
  return <AuthProvider><Layout><Routes>
    <Route path="/" element={<Home />} /><Route path="/books" element={<Catalog />} /><Route path="/all-books" element={<Catalog />} /><Route path="/books/:slug" element={<BookPage />} />
    <Route path="/genres" element={<Directory kind="genres" />} /><Route path="/genres/:slug" element={<Shelf kind="genres" />} /><Route path="/authors" element={<Directory kind="authors" />} /><Route path="/authors/:slug" element={<Shelf kind="authors" />} /><Route path="/rankings" element={<Rankings />} />
    <Route path="/sign-in" element={<AuthPage key="sign-in" />} /><Route path="/register" element={<AuthPage key="register" register />} /><Route path="/verify" element={<TokenPage mode="verify" />} /><Route path="/forgot-password" element={<TokenPage mode="forgot" />} /><Route path="/reset-password" element={<TokenPage mode="reset" />} /><Route path="/confirm-email-change" element={<TokenPage mode="email-change" />} />
    <Route path="/cart" element={<RequireUser><CartPage /></RequireUser>} /><Route path="/checkout" element={<RequireUser><Checkout /></RequireUser>} /><Route path="/payment/return" element={<PaymentReturn />} /><Route path="/account" element={<RequireUser><Account /></RequireUser>} />
    <Route path="/privacy" element={<PrivacyPolicyPage />} /><Route path="/terms" element={<TermsPage />} />
    <Route path="/admin" element={<RequireUser admin><Admin /></RequireUser>} /><Route path="/admin/books/new" element={<RequireUser admin><BookEditor /></RequireUser>} /><Route path="/admin/books/:slug/edit" element={<RequireUser admin><BookEditor edit /></RequireUser>} /><Route path="*" element={<NotFoundPage />} />
  </Routes></Layout></AuthProvider>
}
