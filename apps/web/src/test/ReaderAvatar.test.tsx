import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReaderAvatar } from '../components/ReaderAvatar'
import { readerInitials } from '../components/readerInitials'

describe('ReaderAvatar', () => {
  it('builds initials from one or several names', () => {
    expect(readerInitials('Ada Lovelace')).toBe('AL')
    expect(readerInitials('Plato')).toBe('PL')
  })

  it('falls back to initials when an image cannot load', () => {
    const { container } = render(<ReaderAvatar name="Ada Lovelace" src="/missing.webp" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })
})
