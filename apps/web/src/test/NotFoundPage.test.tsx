import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundPage } from '../components/NotFoundPage'

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

function renderPage() {
  render(<MemoryRouter><NotFoundPage /></MemoryRouter>)
}

describe('NotFoundPage', () => {
  beforeEach(() => mockReducedMotion(false))

  it('renders the exact recovery copy, accessible scene description, and home link', () => {
    renderPage()

    expect(screen.getByText('Error 404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'We cannot tell a lie...' })).toBeInTheDocument()
    expect(screen.getByText("If we told you this page was here, our nose would grow. Let's return to safety.")).toBeInTheDocument()
    expect(screen.queryByText('This page exists')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: /A carved wooden storybook puppet holds a sign reading “This page exists” beside oversized 404 numerals/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/')
  })

  it('keeps the static poster and does not render video when reduced motion is enabled', () => {
    mockReducedMotion(true)
    renderPage()

    expect(screen.queryByTestId('not-found-video')).not.toBeInTheDocument()
    expect(screen.getByTestId('not-found-poster')).toHaveAttribute('src', '/assets/not-found/pinocchio-404-poster.webp')
  })

  it('provides WebM and H.264 video sources when motion is allowed', () => {
    renderPage()

    const video = screen.getByTestId('not-found-video')
    expect(video.querySelector('source[type="video/webm"]')).toHaveAttribute('src', '/assets/not-found/pinocchio-404.webm')
    expect(video.querySelector('source[type="video/mp4"]')).toHaveAttribute('src', '/assets/not-found/pinocchio-404.mp4')
  })
})
