import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthorShowcase } from '../components/AuthorShowcase'
import type { Author } from '../types'

const authors: Author[] = [
  { id: 'author-1', name: 'Mara Vale', slug: 'mara-vale', bio: 'Writes across imagined seas.', image_url: '/assets/authors/mara-vale.webp' },
  { id: 'author-2', name: 'Ivo North', slug: 'ivo-north', bio: 'Follows quiet roads and difficult choices.', image_url: '/assets/authors/ivo-north.webp' },
]

function renderShowcase(items = authors) {
  render(<MemoryRouter><AuthorShowcase authors={items} /></MemoryRouter>)
}

function linksFor(slug: string) {
  return screen.getAllByRole('link').filter((link) => link.getAttribute('href') === `/authors/${slug}`)
}

describe('AuthorShowcase', () => {
  it('renders portraits, biographies, and both shelf entry points', () => {
    renderShowcase()
    expect(screen.getByRole('heading', { name: 'Mara Vale' })).toBeVisible()
    expect(screen.getByText('Writes across imagined seas.')).toBeVisible()
    expect(screen.getAllByAltText('Portrait of Mara Vale')).toHaveLength(2)
    expect(linksFor('mara-vale')).toHaveLength(2)
  })

  it('synchronizes portrait and text activation for pointer and keyboard users', () => {
    renderShowcase()
    const [portraitLink, authorLink] = linksFor('mara-vale')
    const [otherPortrait] = linksFor('ivo-north')

    fireEvent.mouseEnter(authorLink)
    expect(portraitLink).toHaveAttribute('data-active', 'true')
    expect(otherPortrait).toHaveAttribute('data-dimmed', 'true')

    fireEvent.mouseLeave(authorLink)
    expect(portraitLink).not.toHaveAttribute('data-active')

    fireEvent.focus(portraitLink)
    expect(authorLink).toHaveAttribute('data-active', 'true')
    fireEvent.blur(portraitLink)
    expect(authorLink).not.toHaveAttribute('data-active')

    fireEvent.pointerDown(authorLink)
    expect(portraitLink).toHaveAttribute('data-active', 'true')
  })

  it('shows accessible initials when a portrait is missing or fails', () => {
    renderShowcase([{ ...authors[0], image_url: null }])
    expect(screen.getAllByRole('img', { name: 'Portrait unavailable for Mara Vale' })).toHaveLength(2)
    expect(screen.getAllByText('MV')).toHaveLength(2)
  })
})
