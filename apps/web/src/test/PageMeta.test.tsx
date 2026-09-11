import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PageMeta } from '../components/PageMeta'
import { getCanonicalPath } from '../seo'

afterEach(() => {
  document.querySelector('link[rel="canonical"]')?.remove()
})

describe('PageMeta', () => {
  it('sets an absolute canonical URL and removes it for non-indexable routes', async () => {
    const view = render(<PageMeta title="All books" description="Browse the catalogue." canonicalPath="/books" />)

    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://orphaleia.com/books')
    })

    view.rerender(<PageMeta title="Your account" description="View your account." canonicalPath={null} />)

    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')).not.toBeInTheDocument()
    })
  })
})

describe('getCanonicalPath', () => {
  it('normalizes the duplicate catalogue route and discards filter parameters', () => {
    expect(getCanonicalPath('/all-books', '?sort=title&q=sea')).toBe('/books')
    expect(getCanonicalPath('/books', '?genre=fiction&available=true')).toBe('/books')
  })

  it('keeps valid catalogue pagination as a distinct canonical page', () => {
    expect(getCanonicalPath('/books', '?page=2&sort=title')).toBe('/books?page=2')
    expect(getCanonicalPath('/all-books', '?page=12')).toBe('/books?page=12')
    expect(getCanonicalPath('/books', '?page=2&utm_source=newsletter')).toBe('/books?page=2')
    expect(getCanonicalPath('/books', '?page=1')).toBe('/books')
  })

  it('does not map filtered pagination to an unrelated unfiltered page', () => {
    expect(getCanonicalPath('/books', '?genre=fiction&page=2')).toBe('/books')
    expect(getCanonicalPath('/books', '?q=sea&page=2')).toBe('/books')
  })

  it('canonicalizes public detail pages and excludes private routes', () => {
    expect(getCanonicalPath('/books/the-bronze-swallow')).toBe('/books/the-bronze-swallow')
    expect(getCanonicalPath('/genres/fiction')).toBe('/genres/fiction')
    expect(getCanonicalPath('/authors/elena-thalassa')).toBe('/authors/elena-thalassa')
    expect(getCanonicalPath('/checkout')).toBeNull()
    expect(getCanonicalPath('/admin')).toBeNull()
    expect(getCanonicalPath('/not-found')).toBeNull()
  })
})
