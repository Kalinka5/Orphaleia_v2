import { Minus, Plus, Question } from '@phosphor-icons/react'
import { type ReactNode, useId, useState } from 'react'
import styles from './FaqSection.module.css'

type Faq = {
  question: string
  answer: ReactNode
}

const faqColumns: Faq[][] = [
  [
    {
      question: 'How does Orphaleia choose its books?',
      answer: <>The catalogue is fictional demonstration content, curated to show how an editorial bookshop could organize discovery, detail pages, and recommendations.</>,
    },
    {
      question: 'Can I browse without an account?',
      answer: <>Yes. The catalogue, collections, authors, and charts are public. A one-click fictional demo account unlocks the bag, simulated checkout, and account interface without asking for your email or address.</>,
    },
    {
      question: 'Does Orphaleia deliver books?',
      answer: <>No. This is a portfolio demonstration, not an operating bookshop. The delivery address, rate, tracking steps, and order states are fictional interface examples.</>,
    },
    {
      question: 'Are prices shown with VAT?',
      answer: <>The euro prices and totals are illustrative interface content. They are not offers for sale, invoices, or amounts that a visitor can pay.</>,
    },
  ],
  [
    {
      question: 'How can I pay?',
      answer: <>You cannot make a payment. The Stripe and PayPal buttons run a local simulation only and never ask for card, bank, or PayPal credentials.</>,
    },
    {
      question: 'Why is there an order timeline?',
      answer: <>It demonstrates the product design for an order history and fulfilment journey. Any order number, status, address, carrier, or tracking information shown is fictional.</>,
    },
    {
      question: 'Can I change or cancel an order?',
      answer: <>No real order is created, so there is nothing to change or cancel. Demo records exist only to make the portfolio interface explorable.</>,
    },
    {
      question: 'What is the returns policy?',
      answer: <>There are no sales, deliveries, or returns in this demonstration. If the concept becomes a real store later, commercial policies would need to be written for that separate service.</>,
    },
  ],
]

function FaqCard({ question, answer }: Faq) {
  const [open, setOpen] = useState(false)
  const answerId = useId()
  const questionId = useId()

  return <article className={styles.card} data-open={open} data-testid="faq-card">
    <button
      type="button"
      id={questionId}
      aria-controls={answerId}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <span>{question}</span>
      <span className={styles.icon} aria-hidden="true">
        <Plus className={styles.plus} size={24} weight="regular" />
        <Minus className={styles.minus} size={24} weight="regular" />
      </span>
    </button>
    <div
      className={styles.answer}
      id={answerId}
      role="region"
      aria-labelledby={questionId}
      aria-hidden={!open}
      inert={!open}
      data-testid="faq-answer"
    >
      <div className={styles.answerInner}><p>{answer}</p></div>
    </div>
  </article>
}

export function FaqSection() {
  return <section className={styles.section} aria-labelledby="home-faq-title" data-home-motion="section">
    <div className={styles.inner}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}><Question size={16} weight="fill" aria-hidden="true" /><span>FAQ</span></p>
        <h2 id="home-faq-title">Frequently asked questions.</h2>
        <p className={styles.intro}>What is real, what is fictional, and how to explore this portfolio demonstration safely.</p>
      </header>

      <div className={styles.columns} data-testid="faq-columns">
        {faqColumns.map((column, index) => <div className={styles.column} data-testid="faq-column" key={index}>
          {column.map((faq) => <FaqCard {...faq} key={faq.question} />)}
        </div>)}
      </div>
    </div>
  </section>
}
