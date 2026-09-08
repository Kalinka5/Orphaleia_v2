import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormNotification } from '../components/ui/FormNotification'

describe('FormNotification', () => {
  it('renders feedback in a portal outside its form', () => {
    render(<form data-testid="form"><FormNotification title="Saved" message="Your changes are ready." variant="success" onClose={() => {}} /></form>)

    const notification = screen.getByRole('status')
    expect(notification).toHaveTextContent('Saved')
    expect(notification).toHaveTextContent('Your changes are ready.')
    expect(screen.getByTestId('form')).not.toContainElement(notification)
  })

  it('announces errors assertively and can be dismissed', () => {
    const onClose = vi.fn()
    render(<FormNotification title="Save failed" message="Try again." variant="error" onClose={onClose} />)

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
