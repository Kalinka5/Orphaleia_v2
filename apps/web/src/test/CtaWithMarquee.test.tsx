import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CtaWithMarquee } from '../components/ui/cta-with-marquee'

const bookSlugs = [
  'the-little-prince',
  'the-adventures-of-sherlock-holmes',
  'alices-adventures-in-wonderland',
  'the-great-gatsby',
  'the-hobbit',
  'twenty-thousand-leagues-under-the-sea',
  'romeo-and-juliet',
  'the-picture-of-dorian-gray',
]

const retiredBookSlugs = [
  'the-cartographer-of-ithaca',
  'letters-from-the-wine-dark-sea',
  'olivewood-astronomy',
  'a-house-for-the-north-wind',
]

describe('CtaWithMarquee', () => {
  it('links every artwork to its matching book page', () => {
    render(<MemoryRouter><CtaWithMarquee /></MemoryRouter>)

    for (const slug of bookSlugs) {
      const matches = document.querySelectorAll(`a[href="/books/${slug}"]`)
      expect(matches).toHaveLength(2)
    }

    for (const slug of retiredBookSlugs) {
      expect(document.querySelector(`a[href="/books/${slug}"]`)).not.toBeInTheDocument()
    }

    expect(screen.getByRole('link', { name: 'Browse every book' })).toHaveAttribute('href', '/books')
  })
})
