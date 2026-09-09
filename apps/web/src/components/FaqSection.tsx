import { Minus, Plus, Question } from '@phosphor-icons/react'
import { type ReactNode, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './FaqSection.module.css'

type Faq = {
  question: string
  answer: ReactNode
}

const faqColumns: Faq[][] = [
  [
    {
      question: 'How does Orphaleia choose its books?',
      answer: <>Every title is selected by booksellers for its writing, the conversations it can open, and the quality of the edition. We keep the catalogue intentionally edited so each book has a reason to be here.</>,
    },
    {
      question: 'Can I browse without an account?',
      answer: <>Yes. You can explore the catalogue, collections, authors, and bestseller charts without signing in. An account is needed to place an order, save delivery details, follow orders, and share ratings or comments.</>,
    },
    {
      question: 'Where does Orphaleia deliver?',
      answer: <>We currently deliver to Spain and the European Union destinations available at checkout. The available delivery options, charge, and any free-delivery threshold appear before you pay.</>,
    },
    {
      question: 'Are prices shown with VAT?',
      answer: <>Yes. Book prices are shown in euros and include applicable VAT. Any delivery charge is calculated separately from your destination and shown in the order total before payment.</>,
    },
  ],
  [
    {
      question: 'How can I pay?',
      answer: <>You can pay securely with Stripe or PayPal. Payment details are entered with your chosen provider; Orphaleia receives the payment status and reference, not your complete card or PayPal credentials.</>,
    },
    {
      question: 'How do I track my order?',
      answer: <>Open Orders in your account to see the latest fulfilment stage and timeline. We also send order updates by email and add the carrier and tracking link when they become available.</>,
    },
    {
      question: 'Can I change or cancel an order?',
      answer: <>Email <a href="mailto:customer@orphaleia.com">customer@orphaleia.com</a> as soon as possible. We will try to make the change before dispatch, but cannot guarantee interception once fulfilment has started. <Link to="/terms#cancellation">Read the cancellation terms</Link>.</>,
    },
    {
      question: 'What is the returns policy?',
      answer: <>Consumers may withdraw from an online purchase within 14 calendar days after receiving the books. Contact us before returning them; ordinary change-of-mind postage is your responsibility, while we cover reasonable return costs for faulty, damaged, or incorrect books. <Link to="/terms#withdrawal">Read the full returns terms</Link>.</>,
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
        <p className={styles.intro}>The useful details about choosing, ordering, and receiving books from Orphaleia.</p>
      </header>

      <div className={styles.columns} data-testid="faq-columns">
        {faqColumns.map((column, index) => <div className={styles.column} data-testid="faq-column" key={index}>
          {column.map((faq) => <FaqCard {...faq} key={faq.question} />)}
        </div>)}
      </div>
    </div>
  </section>
}
