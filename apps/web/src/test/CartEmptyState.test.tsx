import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CartEmptyState } from '../components/CartEmptyState'

describe('cart empty state', () => {
  it('shows the Paddington scene and links to the catalog', () => {
    render(<MemoryRouter><CartEmptyState /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Your bag is waiting' })).toBeInTheDocument()
    expect(screen.getByText('Choose a book and begin a new route.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse the catalog/i })).toHaveAttribute('href', '/all-books')
  })
})
