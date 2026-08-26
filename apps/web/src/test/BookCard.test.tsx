import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

function Price({ cents }: { cents: number }) { return <span>{new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)}</span> }

describe('storefront currency', () => {
  it('formats prices in euros', () => {
    render(<MemoryRouter><Price cents={2190} /></MemoryRouter>)
    expect(screen.getByText(/21.90/)).toBeInTheDocument()
  })
})

