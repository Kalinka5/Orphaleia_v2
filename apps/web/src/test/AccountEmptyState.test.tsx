import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AccountEmptyState } from '../components/AccountEmptyState'

describe('account empty state', () => {
  it('shows the Little Prince scene and links to the requested catalog route', () => {
    render(<MemoryRouter><AccountEmptyState /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'No orders yet' })).toBeInTheDocument()
    expect(screen.getByText('Your completed voyages will appear here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse the catalog/i })).toHaveAttribute('href', '/all-books')
  })
})
