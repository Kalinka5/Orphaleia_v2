import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SelectControl } from '../components/ui/SelectControl'

const options = [
  { value: '', label: 'All genres' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'fantasy', label: 'Fantasy' },
]

function ControlledSelect({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return <form data-testid="form">
    <SelectControl
      label="Genre"
      name="genre"
      value={value}
      options={options}
      onChange={(next) => { setValue(next); onChange(next) }}
    />
  </form>
}

describe('SelectControl', () => {
  it('supports arrow-key selection and preserves form submission', async () => {
    const onChange = vi.fn()
    render(<ControlledSelect onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: /genre all genres/i })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox', { name: 'Genre' })).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('adventure')
    expect(trigger).toHaveTextContent('Adventure')
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).get('genre')).toBe('adventure')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('supports typeahead and Escape focus restoration', async () => {
    render(<ControlledSelect />)
    const trigger = screen.getByRole('button', { name: /genre all genres/i })
    fireEvent.keyDown(trigger, { key: 'f' })
    expect(trigger).toHaveAttribute('aria-activedescendant', expect.stringMatching(/option-2$/))
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
