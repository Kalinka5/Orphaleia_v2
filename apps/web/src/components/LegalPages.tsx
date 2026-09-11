import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import s from './LegalPages.module.css'

const LAST_UPDATED = '11 September 2026'

type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

type LegalDocumentProps = {
  title: string
  summary: string
  sections: LegalSection[]
}

function ContactDetails({ privacy = false }: { privacy?: boolean }) {
  return <address className={s.contactDetails}>
    <strong>Kalina Ent., trading as Orphaleia</strong>
    <span>Calle Sinai 12, 41007 Sevilla, Spain</span>
    <span>NIF B12345678</span>
    <span>Registro Mercantil de Sevilla, Tomo 54321, Folio 89, Hoja SE-12345, Inscripción 1ª</span>
    <a href={`mailto:${privacy ? 'privacy@orphaleia.com' : 'customer@orphaleia.com'}`}>{privacy ? 'privacy@orphaleia.com' : 'customer@orphaleia.com'}</a>
    <a href="tel:+34671256622">+34 671 256 622</a>
  </address>
}

function LegalDocument({ title, summary, sections }: LegalDocumentProps) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      target?.scrollIntoView?.({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash])

  return <div className={s.page}>
    <header className={s.hero}>
      <div className={s.heroInner}>
        <p className={s.kicker}>Orphaleia legal information</p>
        <h1>{title}</h1>
        <p className={s.summary}>{summary}</p>
        <p className={s.updated}>Last updated: {LAST_UPDATED}</p>
      </div>
    </header>
    <div className={s.layout}>
      <aside className={s.sidebar}>
        <nav className={s.contents} aria-label={`${title} contents`}>
          <h2>On this page</h2>
          <ol>
            {sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}
          </ol>
        </nav>
        <p className={s.printNote}>This page is designed to print cleanly for your records.</p>
      </aside>
      <article className={s.document} aria-label={title}>
        {sections.map((section) => <section id={section.id} key={section.id} className={s.section}>
          <h2>{section.title}</h2>
          {section.content}
        </section>)}
      </article>
    </div>
  </div>
}

const privacySections: LegalSection[] = [
  {
    id: 'controller',
    title: 'Who is responsible for your data',
    content: <>
      <p>Kalina Ent., trading as Orphaleia, is the data controller for personal data collected through this bookshop.</p>
      <ContactDetails privacy />
    </>,
  },
  {
    id: 'data-we-collect',
    title: 'Information we collect',
    content: <>
      <p>We collect information that you give us, information created as you use the shop, and limited technical information needed to operate it securely.</p>
      <div className={s.groupedList}>
        <div><h3>Account and profile</h3><p>Your name, email address, encrypted password credentials, account status, optional avatar, and any pending email change.</p></div>
        <div><h3>Orders and delivery</h3><p>Your cart, purchased books, prices, order history, delivery name and address, carrier and tracking details, and optional saved delivery address.</p></div>
        <div><h3>Reading activity</h3><p>Ratings, rating history, comments, and the public display name or avatar shown with a comment.</p></div>
        <div><h3>Payments and support</h3><p>Payment provider references and status, correspondence with us, refund or complaint details, and records needed to resolve an order.</p></div>
        <div><h3>Security information</h3><p>Session identifiers, anti-forgery tokens, request identifiers, and technical information needed to prevent abuse, diagnose errors, and protect accounts.</p></div>
      </div>
      <p>We do not receive or store your complete card or PayPal login details. Those are entered directly with the payment provider.</p>
    </>,
  },
  {
    id: 'how-we-use-data',
    title: 'Why we use your information',
    content: <>
      <p>We use personal data only where we have a lawful basis under the General Data Protection Regulation.</p>
      <dl className={s.legalBases}>
        <div><dt>Contract and pre-contract steps</dt><dd>To create and secure your account, calculate delivery, take payment, fulfil orders, provide tracking, manage returns, and answer order-related requests.</dd></div>
        <div><dt>Legal obligation</dt><dd>To keep accounting and commercial records, meet tax and consumer-law duties, respond to authorities, and handle statutory guarantees.</dd></div>
        <div><dt>Legitimate interests</dt><dd>To secure the shop, prevent fraud and misuse, maintain service reliability, moderate public contributions, and establish or defend legal claims. We balance these interests against your rights.</dd></div>
        <div><dt>Consent</dt><dd>When you make an optional choice that requires it, such as loading an external video player. You can decline without losing access to the book information or shop.</dd></div>
      </dl>
      <p>We do not use your data for automated decisions that produce legal or similarly significant effects. We do not send marketing email unless we introduce a separate, optional sign-up and ask for valid consent.</p>
    </>,
  },
  {
    id: 'public-content',
    title: 'Public ratings, comments, and avatars',
    content: <>
      <p>Your ratings contribute to aggregate scores. Comments display the text you submit together with your public display name and, if you choose one, your avatar. Do not include private information in a public comment.</p>
      <p>We may hide or remove content that breaches the Terms, exposes personal information, or creates a legal or safety risk. You may ask us to remove your comment or avatar by contacting <a href="mailto:privacy@orphaleia.com">privacy@orphaleia.com</a>.</p>
    </>,
  },
  {
    id: 'sharing',
    title: 'Who receives your information',
    content: <>
      <p>We share only the information needed for each recipient to perform its role:</p>
      <ul>
        <li>Stripe or PayPal to process and verify your chosen payment.</li>
        <li>Delivery carriers to deliver and track your order.</li>
        <li>Hosting, database, object-storage, security, and transactional-email suppliers that process data for us under contract.</li>
        <li>Professional advisers, insurers, courts, regulators, tax authorities, or law enforcement where reasonably necessary or legally required.</li>
      </ul>
      <p>Stripe and PayPal may also process information as independent controllers under their own privacy notices. We do not sell personal data.</p>
    </>,
  },
  {
    id: 'international-transfers',
    title: 'International transfers',
    content: <>
      <p>Some service providers may process data outside the European Economic Area. Where this happens, we rely on a European Commission adequacy decision or approved safeguards such as Standard Contractual Clauses, together with supplementary protections where required.</p>
      <p>You may contact us for information about the safeguard used for a particular transfer.</p>
    </>,
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    content: <>
      <ul>
        <li>Account and saved profile information is kept while your account remains open and until you ask us to close it.</li>
        <li>Order, invoice, payment-status, delivery, refund, and related commercial records are generally kept for six years from the relevant final record, or longer if a specific legal claim or duty requires it.</li>
        <li>Public comments, ratings, and avatars are kept until removed by you or us, or until the related account is closed. We may retain a limited record where needed for moderation, disputes, or legal obligations.</li>
        <li>Authentication cookies expire after the periods shown below. Server-side sessions may be revoked sooner when you sign out or change security details.</li>
        <li>Support and complaint records are kept only as long as needed to resolve the matter and meet legal record-keeping duties.</li>
      </ul>
      <p>When information is no longer needed, we delete or irreversibly anonymize it. Backups are removed through their normal secure rotation.</p>
    </>,
  },
  {
    id: 'cookies',
    title: 'Cookies, audience measurement, and external media',
    content: <>
      <p>Orphaleia uses only first-party cookies that are necessary to authenticate readers and protect the shop. Because they are essential, they cannot be switched off through a consent banner.</p>
      <div className={s.tableWrap} tabIndex={0} role="region" aria-label="Essential cookie details">
        <table>
          <thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th><th>Access</th></tr></thead>
          <tbody>
            <tr><td><code>access_token</code></td><td>Keeps you authenticated during requests.</td><td>15 minutes</td><td>HTTP-only</td></tr>
            <tr><td><code>refresh_token</code></td><td>Continues your signed-in session securely.</td><td>14 days</td><td>HTTP-only</td></tr>
            <tr><td><code>csrf_token</code></td><td>Protects account and checkout actions from forged requests.</td><td>14 days</td><td>Readable by the Orphaleia web application</td></tr>
          </tbody>
        </table>
      </div>
      <h3>Privacy-first audience measurement</h3>
      <p>We use Umami Cloud, configured for its European Union region, to understand aggregate shop traffic and the steps readers take from browsing to checkout. Umami does not place analytics cookies, track you across websites, or receive your Orphaleia account identity.</p>
      <p>The service receives the page path, a restricted set of catalogue and campaign parameters, referrer, browser language, screen size, device and browser information, and approximate country. Its cookieless session calculation uses technical request information such as the IP address and user agent; Umami states that the IP address itself is not stored. We also record limited commerce events such as catalogue searches, adding or removing a book, starting checkout, selecting a payment provider, and a confirmed purchase value.</p>
      <p>We do not send Umami names, email or delivery addresses, account or order identifiers, payment references, search phrases, comments, ratings, or verification and password-reset tokens. We do not use analytics session replay or identify signed-in readers. Analytics is disabled when your browser sends a Do Not Track preference.</p>
      <p>We use these aggregate measurements in our legitimate interests to assess the shop’s usefulness, diagnose navigation problems, and improve catalogue and checkout performance. Umami Cloud retains Hobby-plan analytics for six months. You may object to this processing by enabling Do Not Track or by contacting <a href="mailto:privacy@orphaleia.com">privacy@orphaleia.com</a>.</p>
      <h3>External media</h3>
      <p>Book videos are hosted by YouTube or Vimeo but are not loaded until you select “Load external video.” The provider will then receive technical information such as your IP address and device details and may use storage under its own privacy notice.</p>
    </>,
  },
  {
    id: 'your-rights',
    title: 'Your data protection rights',
    content: <>
      <p>Subject to the conditions in applicable law, you may ask us to:</p>
      <ul>
        <li>Give you access to your personal data and a copy of it.</li>
        <li>Correct inaccurate or incomplete information.</li>
        <li>Delete information that is no longer required.</li>
        <li>Restrict or object to particular processing.</li>
        <li>Provide data you supplied in a portable format.</li>
        <li>Withdraw consent at any time, without affecting earlier lawful processing.</li>
      </ul>
      <p>Email <a href="mailto:privacy@orphaleia.com">privacy@orphaleia.com</a> to exercise a right. We may ask for proportionate information to confirm your identity. We normally respond within one month.</p>
      <p>You may complain to the <a href="https://www.aepd.es/" target="_blank" rel="noreferrer">Spanish Data Protection Agency (AEPD)</a>, particularly if you believe we have not resolved your concern.</p>
    </>,
  },
  {
    id: 'children',
    title: 'Children and guardians',
    content: <>
      <p>Children may browse the public catalogue. A person under 18 may use an account or place an order only with the involvement and authorization of a parent or legal guardian. The adult is responsible for the account and purchase.</p>
      <p>If you believe a child has supplied personal data without appropriate authorization, contact us so we can investigate and take suitable action.</p>
    </>,
  },
  {
    id: 'security',
    title: 'How we protect information',
    content: <>
      <p>We use organizational and technical safeguards appropriate to the nature of the data, including encrypted transport, password hashing, secure authentication cookies, request-forgery protection, access controls, and restricted administrative tools.</p>
      <p>No online system is completely risk-free. Please use a unique password, protect your devices, and tell us promptly if you suspect unauthorized account access.</p>
    </>,
  },
  {
    id: 'changes-and-contact',
    title: 'Changes and contact',
    content: <>
      <p>We may update this policy when our services, suppliers, or legal duties change. We will publish the revised date here and provide additional notice where a change materially affects your rights.</p>
      <div className={s.contactPanel}>
        <h3>Privacy questions or requests</h3>
        <ContactDetails privacy />
      </div>
    </>,
  },
]

const termsSections: LegalSection[] = [
  {
    id: 'trader-information',
    title: 'Trader information',
    content: <>
      <p>These Terms govern use of the Orphaleia online bookshop and purchases made from Kalina Ent., trading as Orphaleia.</p>
      <ContactDetails />
    </>,
  },
  {
    id: 'using-the-shop',
    title: 'Using the shop',
    content: <>
      <p>You may browse without an account. To hold an account or place an order, you must be at least 18 or act with the involvement and authorization of a parent or legal guardian who accepts responsibility for the account and purchase.</p>
      <p>You agree to provide accurate information, keep your sign-in details confidential, and notify us promptly of suspected unauthorized use. You must not disrupt the shop, attempt unauthorized access, scrape it abusively, submit unlawful content, or use it for fraud.</p>
    </>,
  },
  {
    id: 'books-and-prices',
    title: 'Books, availability, and prices',
    content: <>
      <p>We aim to describe each book, edition, price, and stock position accurately. Screen colors and cover artwork may vary slightly from the physical book. Product images are illustrative but the title, edition information, and ISBN identify the offered item.</p>
      <p>Prices are shown in euros and include applicable VAT. Delivery charges are calculated from the destination and shown before payment. Placing a book in your bag does not reserve it. A short stock reservation begins when an order is created for payment.</p>
      <p>If an obvious pricing, stock, or description error affects an order, we will contact you before fulfilment. We will not substitute a different edition without your agreement.</p>
    </>,
  },
  {
    id: 'orders-and-payment',
    title: 'Orders and payment',
    content: <>
      <p>The checkout total shows the books, delivery charge, VAT-inclusive total, and accepted payment methods. Selecting a Stripe or PayPal payment button confirms that the order carries an obligation to pay and sends you to the chosen provider.</p>
      <p>Your order is an offer to purchase. An on-screen receipt or technical acknowledgement does not by itself mean we have accepted it. The sales contract is formed when payment is confirmed and we issue the order confirmation. If stock cannot be allocated after payment, we will offer an appropriate replacement only with your agreement or issue a refund.</p>
      <p>Stripe and PayPal process payment details under their own terms. We receive payment references and status information, not your complete card or PayPal credentials.</p>
    </>,
  },
  {
    id: 'delivery',
    title: 'Delivery',
    content: <>
      <p>We currently deliver to the Spanish and European Union destinations offered at checkout. Available destinations, delivery charges, and any free-delivery threshold are shown before payment.</p>
      <p>We will deliver within the estimate communicated for the order and, unless another period is agreed, no later than 30 days after the contract is formed. Tell us promptly if a delivery is delayed, missing, damaged, or incomplete.</p>
      <p>We remain responsible for the books until you, or a person you nominate other than the carrier, receives them. If you arrange a carrier that we did not offer, risk transfers when we hand the order to that carrier.</p>
    </>,
  },
  {
    id: 'cancellation',
    title: 'Cancellation before dispatch',
    content: <>
      <p>Contact <a href="mailto:customer@orphaleia.com">customer@orphaleia.com</a> as soon as possible if you need to cancel or correct an order. We will try to act before dispatch but cannot guarantee interception once fulfilment has started.</p>
      <p>If the parcel has already been dispatched, you may use the statutory withdrawal process below.</p>
    </>,
  },
  {
    id: 'withdrawal',
    title: 'Your 14-day right of withdrawal',
    content: <>
      <p>If you are a consumer, you may withdraw from an online purchase without giving a reason within 14 calendar days after you, or a third party you nominate other than the carrier, receives the books. For an order delivered in parts, the period begins when the final part is received.</p>
      <p>Before the period ends, send an unambiguous withdrawal statement to <a href="mailto:customer@orphaleia.com">customer@orphaleia.com</a> or the postal address below. You may use the model notice in these Terms, but it is not mandatory.</p>
      <p>Return the books within 14 days after telling us that you are withdrawing. Please obtain return instructions first and send them to Kalina Ent., Calle Sinai 12, 41007 Sevilla, Spain. You bear the direct cost of ordinary change-of-mind return postage. We bear reasonable return costs for faulty, damaged, or incorrect books.</p>
      <p>We will refund payments received for the withdrawn goods and, where the whole order is withdrawn, the cost of our least expensive standard delivery option. We will do this within 14 days after receiving your withdrawal notice. We may withhold the refund until the books arrive or you provide evidence of return, whichever occurs first. We use the original payment method unless you expressly agree otherwise.</p>
      <p>You may inspect a book as you would in a physical shop. You are responsible for any reduction in value caused by handling beyond what is necessary to establish its nature, characteristics, and condition.</p>
    </>,
  },
  {
    id: 'withdrawal-form',
    title: 'Model withdrawal notice',
    content: <div className={s.modelNotice}>
      <p>To: Kalina Ent., trading as Orphaleia, Calle Sinai 12, 41007 Sevilla, Spain, customer@orphaleia.com</p>
      <p>I hereby give notice that I withdraw from my contract for the purchase of the following books:</p>
      <dl>
        <div><dt>Order number</dt><dd>________________________________</dd></div>
        <div><dt>Ordered on / received on</dt><dd>________________________________</dd></div>
        <div><dt>Consumer name and address</dt><dd>________________________________</dd></div>
        <div><dt>Signature, only if sent on paper</dt><dd>________________________________</dd></div>
        <div><dt>Date</dt><dd>________________________________</dd></div>
      </dl>
    </div>,
  },
  {
    id: 'faulty-goods',
    title: 'Faulty, damaged, or incorrect books',
    content: <>
      <p>Books must conform to the contract. Under Spanish consumer law, new goods are covered by a three-year legal conformity period from delivery. Your mandatory rights are not limited by these Terms.</p>
      <p>If a book is faulty, damaged in transit, or not what you ordered, contact us with the order number and a description of the problem. Depending on the circumstances and your statutory rights, we will arrange a replacement, price reduction, or refund without charge and without significant inconvenience.</p>
    </>,
  },
  {
    id: 'reader-content',
    title: 'Ratings, comments, and reader content',
    content: <>
      <p>You remain responsible for and retain ownership of comments and profile images you submit. Do not post unlawful, abusive, infringing, misleading, promotional, or privacy-invasive material.</p>
      <p>You grant us a non-exclusive, worldwide, royalty-free licence to host, reproduce, format, and display that content only as needed to operate, secure, and promote the Orphaleia service. The licence ends when the content is deleted, except for limited secure backups, material already lawfully shared, or records we must retain.</p>
      <p>We may moderate, hide, or remove content and may suspend an account where reasonably necessary to enforce these Terms, protect readers, or comply with law. We will consider context and proportionality.</p>
    </>,
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual property and external services',
    content: <>
      <p>The shop design, branding, original text, software, and original illustrations belong to Kalina Ent. or its licensors. Book covers, author portraits, quotations, and other third-party materials remain the property of their respective owners and are used under the applicable licence or permission.</p>
      <p>You may use the shop for personal, lawful shopping and reading activity. You may not reproduce or commercially exploit protected materials without permission.</p>
      <p>External payment, carrier, YouTube, Vimeo, and other linked services have their own terms and privacy notices. A link or optional embed does not make us responsible for an external service, but this does not affect our responsibility for the services we choose to fulfil your order.</p>
    </>,
  },
  {
    id: 'liability',
    title: 'Service availability and liability',
    content: <>
      <p>We work to keep the shop accurate, secure, and available, but temporary maintenance, technical faults, or events outside our reasonable control may interrupt access. We will take reasonable steps to reduce disruption and fulfil existing orders.</p>
      <p>Nothing in these Terms excludes or limits liability that cannot lawfully be excluded, including liability for fraud, deliberate misconduct, death or personal injury caused by negligence, or your mandatory consumer rights. Any other limitation applies only to the extent permitted by law.</p>
    </>,
  },
  {
    id: 'law-and-disputes',
    title: 'Applicable law and disputes',
    content: <>
      <p>Spanish law governs these Terms and purchases from Orphaleia. If you live elsewhere as a consumer, this choice does not remove mandatory protections granted by the law of your habitual residence.</p>
      <p>Please contact <a href="mailto:customer@orphaleia.com">customer@orphaleia.com</a> first so we can try to resolve a complaint directly. You may also contact the competent consumer authority or an approved alternative dispute resolution body. Cross-border EU consumers can seek help from the <a href="https://portal-cec.consumo.gob.es/" target="_blank" rel="noreferrer">European Consumer Centre in Spain</a>.</p>
      <p>Disputes may be brought before the courts determined by mandatory consumer and procedural law. We do not require consumers to bring proceedings exclusively in Sevilla.</p>
    </>,
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    content: <>
      <p>We may update these Terms for future use of the shop. The version accepted when an order is placed continues to govern that order. Material changes will be communicated where required.</p>
      <div className={s.contactPanel}>
        <h3>Questions about an order or these Terms</h3>
        <ContactDetails />
      </div>
      <p>For information about personal data, read our <Link to="/privacy">Privacy Policy</Link>.</p>
    </>,
  },
]

export function PrivacyPolicyPage() {
  return <LegalDocument title="Privacy Policy" summary="How Orphaleia collects, uses, shares, and protects personal information when you browse, create an account, or order books." sections={privacySections} />
}

export function TermsPage() {
  return <LegalDocument title="Terms and Conditions" summary="The terms that apply when you use Orphaleia, create a reader account, contribute content, or buy books from us." sections={termsSections} />
}
