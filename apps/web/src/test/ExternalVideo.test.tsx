import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ExternalVideo } from '../components/ExternalVideo'
import { getExternalVideoDetails } from '../externalVideo'

describe('ExternalVideo', () => {
  it('does not create a YouTube iframe until the reader chooses to load it', () => {
    const { container } = render(<MemoryRouter><ExternalVideo url="https://www.youtube.com/watch?v=quiet123" title="Book introduction" /></MemoryRouter>)

    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.getByText(/Loading it will share your IP address/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy#cookies')

    fireEvent.click(screen.getByRole('button', { name: 'Load external video' }))
    expect(screen.getByTitle('Book introduction')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/quiet123')
  })

  it('builds a Vimeo player URL without contacting Vimeo', () => {
    expect(getExternalVideoDetails('https://vimeo.com/123456789')).toEqual({
      provider: 'Vimeo',
      embedUrl: 'https://player.vimeo.com/video/123456789',
    })
  })

  it('shows a safe unavailable state for unsupported URLs', () => {
    const { container } = render(<MemoryRouter><ExternalVideo url="https://example.com/video" title="Unavailable introduction" /></MemoryRouter>)
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
    expect(screen.getByText('This video is currently unavailable.')).toBeInTheDocument()
  })
})
