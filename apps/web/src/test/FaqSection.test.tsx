import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FaqSection } from '../components/FaqSection'

const questions = [
  'How does Orphaleia choose its books?',
  'Can I browse without an account?',
  'Where does Orphaleia deliver?',
  'Are prices shown with VAT?',
  'How can I pay?',
  'How do I track my order?',
  'Can I change or cancel an order?',
  'What is the returns policy?',
]

describe('FaqSection', () => {
  it('renders eight independently expandable, initially closed questions', () => {
    render(<MemoryRouter><FaqSection /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Frequently asked questions.' })).toBeVisible()
    expect(screen.getAllByTestId('faq-column')).toHaveLength(2)

    const cards = screen.getAllByTestId('faq-card')
    const buttons = questions.map((question) => screen.getByRole('button', { name: question }))
    expect(cards).toHaveLength(8)
    for (const card of cards) expect(card).toHaveAttribute('data-open', 'false')
    for (const button of buttons) expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(buttons[0])
    fireEvent.click(buttons[4])

    expect(cards[0]).toHaveAttribute('data-open', 'true')
    expect(cards[4]).toHaveAttribute('data-open', 'true')
    expect(cards[1]).toHaveAttribute('data-open', 'false')
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
    expect(buttons[4]).toHaveAttribute('aria-expanded', 'true')
  })

  it('provides the documented cancellation, returns, and contact destinations', () => {
    render(<MemoryRouter><FaqSection /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Can I change or cancel an order?' }))
    fireEvent.click(screen.getByRole('button', { name: 'What is the returns policy?' }))

    expect(screen.getByRole('link', { name: 'Read the cancellation terms' })).toHaveAttribute('href', '/terms#cancellation')
    expect(screen.getByRole('link', { name: 'Read the full returns terms' })).toHaveAttribute('href', '/terms#withdrawal')
    expect(screen.getByRole('link', { name: 'customer@orphaleia.com' })).toHaveAttribute('href', 'mailto:customer@orphaleia.com')
  })
})
