import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MarketGlobe } from '../components/MarketGlobe'

describe('market globe concept', () => {
  it('labels fictional totals and supports country selection without WebGL', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const view = render(<MemoryRouter><MarketGlobe /></MemoryRouter>)
    expect(screen.getByText('Concept preview · Fictional data')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Spain/ }))
    expect(screen.getByText('94,700,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Spain/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: /Explore the chart/ })).toHaveAttribute('href', '/rankings?preview=concept')
    view.unmount()
    vi.unstubAllGlobals()
  })
})
