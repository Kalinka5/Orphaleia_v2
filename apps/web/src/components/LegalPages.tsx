import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import s from './LegalPages.module.css'

const LAST_UPDATED = '15 September 2026'

type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

function DemoDocument({ title, summary, sections }: { title: string; summary: string; sections: LegalSection[] }) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const frame = requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [hash])

  return <div className={s.page}>
    <header className={s.hero}>
      <div className={s.heroInner}>
        <p className={s.kicker}>Orphaleia portfolio information</p>
        <h1>{title}</h1>
        <p className={s.summary}>{summary}</p>
        <p className={s.updated}>Last updated: {LAST_UPDATED}</p>
      </div>
    </header>
    <div className={s.layout}>
      <aside className={s.sidebar}>
        <nav className={s.contents} aria-label={`${title} contents`}>
          <h2>On this page</h2>
          <ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol>
        </nav>
      </aside>
      <article className={s.document} aria-label={title}>
        {sections.map((section) => <section id={section.id} key={section.id} className={s.section}><h2>{section.title}</h2>{section.content}</section>)}
      </article>
    </div>
  </div>
}

const demoSections: LegalSection[] = [
  {
    id: 'portfolio-purpose',
    title: 'Portfolio purpose',
    content: <>
      <p>Orphaleia is a fictional product-design and software-engineering project created for portfolio review. It is not an operating bookseller, registered trading business, marketplace, or payment service.</p>
      <p>Book listings, prices, stock, bestseller previews, reader accounts, order records, and fulfilment states demonstrate interface behavior. They are not commercial offers or evidence of real transactions.</p>
    </>,
  },
  {
    id: 'no-commerce',
    title: 'No sales, payments, or delivery',
    content: <>
      <p>No books are sold. No payment is requested, authorized, captured, or transferred. Stripe and PayPal controls are labelled simulations and do not connect visitors to a live payment flow.</p>
      <p>No contract, order, invoice, shipment, cancellation, refund, return, warranty, or delivery promise is created by using the demonstration. Any order number or timeline shown exists only to illustrate the interface.</p>
    </>,
  },
  {
    id: 'fictional-content',
    title: 'Fictional demonstration content',
    content: <>
      <p>The demo account name, checkout address, testimonials, customer quotations, and fulfilment details are fictional. Testimonials are presented as interface examples, not endorsements from real customers.</p>
      <p>References to familiar books and authors are used to demonstrate a catalogue experience. Rights in third-party names and works remain with their respective owners.</p>
    </>,
  },
  {
    id: 'safe-use',
    title: 'How to explore safely',
    content: <>
      <p>Use the one-click demo account. Do not enter a real name, email address, postal address, password, payment credential, or other personal information. Registration, email recovery, saved addresses, and public account editing are disabled for portfolio visitors.</p>
      <p>The checkout uses the fixed fictional address “12 Library Lane, Madrid.” It cannot be replaced with a visitor’s address.</p>
    </>,
  },
  {
    id: 'limitations',
    title: 'Demonstration limitations',
    content: <>
      <p>The project is provided for evaluation of its design and implementation. Features, sample content, availability, and demo data may change or be reset without notice.</p>
      <p>If Orphaleia is ever turned into a real shop, that service would require separate business details, terms, privacy disclosures, payment configuration, delivery commitments, and consumer policies before launch.</p>
    </>,
  },
]

const privacySections: LegalSection[] = [
  {
    id: 'no-personal-details',
    title: 'No personal details needed',
    content: <>
      <p>This portfolio demonstration is designed to be explored without providing a real identity, email, postal address, or payment information. Use the one-click fictional demo account and the fixed fictional checkout address.</p>
      <p>Do not submit real personal information in comments, ratings, search fields, or any other interactive surface.</p>
    </>,
  },
  {
    id: 'technical-data',
    title: 'Limited technical data',
    content: <>
      <p>The hosting platform may process ordinary technical request data, such as an IP address, browser information, request time, and security logs, to deliver and protect the website. The demonstration also uses first-party session and anti-forgery cookies so its interactive features work.</p>
      <p>No live payment provider receives visitor payment details through the simulated checkout.</p>
    </>,
  },
  {
    id: 'demo-data',
    title: 'Temporary demo data',
    content: <>
      <p>A one-click visit creates a random local demo identity. Bag contents, ratings, comments, and simulated order records may be stored temporarily so reviewers can inspect the product flow. Demo data may be cleared at any time.</p>
      <p>Because visitors are instructed not to enter personal information, these records should contain fictional interface data only.</p>
    </>,
  },
  {
    id: 'more-information',
    title: 'More information',
    content: <p>For the complete scope of this fictional project, read the <Link to="/terms">Portfolio Demo Notice</Link>. Any future live store would publish its own privacy policy before collecting customer information.</p>,
  },
]

export function PrivacyPolicyPage() {
  return <DemoDocument title="Demo Privacy Note" summary="Explore Orphaleia without sharing real personal or payment information." sections={privacySections} />
}

export function TermsPage() {
  return <DemoDocument title="Portfolio Demo Notice" summary="Orphaleia demonstrates a bookshop interface. It does not sell, charge for, or deliver books." sections={demoSections} />
}
