import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { VerificationPassage } from '../components/VerificationPassage'

describe('verification passage', () => {
  it('welcomes verified readers with the success tableau', () => {
    render(<MemoryRouter><VerificationPassage busy={false} message="Email verified." error="" /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Welcome, fellow reader' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Email verified.')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/verification/four-musketeers-welcome.png')
    expect(screen.getByRole('link', { name: /continue to sign in/i })).toHaveAttribute('href', '/sign-in')
  })

  it('guards the gateway when verification fails', () => {
    render(<MemoryRouter><VerificationPassage busy={false} message="" error="This link has expired." /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'We could not verify this link' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This link has expired.')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/verification/four-musketeers-guard.png')
    expect(screen.getByRole('link', { name: /return to sign in/i })).toHaveAttribute('href', '/sign-in')
  })

  it('does not announce a result before the request completes', () => {
    render(<MemoryRouter><VerificationPassage busy message="" error="" /></MemoryRouter>)

    expect(screen.getByRole('status')).toHaveTextContent('Checking your invitation…')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
