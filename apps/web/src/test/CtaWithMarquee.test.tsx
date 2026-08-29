import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CtaWithMarquee } from '../components/ui/cta-with-marquee'

const bookSlugs = [
  'the-little-prince',
  'the-adventures-of-sherlock-holmes',
  'the-cartographer-of-ithaca',
  'letters-from-the-wine-dark-sea',
  'olivewood-astronomy',
  'twenty-thousand-leagues-under-the-sea',
  'romeo-and-juliet',
  'a-house-for-the-north-wind',
]

describe('CtaWithMarquee', () => {
  it('links every artwork to its matching book page', () => {
    render(<MemoryRouter><CtaWithMarquee /></MemoryRouter>)

    for (const slug of bookSlugs) {
      const matches = document.querySelectorAll(`a[href="/books/${slug}"]`)
      expect(matches).toHaveLength(2)
    }

    expect(screen.getByRole('link', { name: 'Browse every book' })).toHaveAttribute('href', '/books')
  })
})
