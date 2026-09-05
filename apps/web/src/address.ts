import type { Address } from './types'
import type { SelectOption } from './components/ui/SelectControl'

export const addressFields: Array<{
  key: Exclude<keyof Address, 'country'>
  label: string
  required: boolean
  autoComplete: string
}> = [
  { key: 'name', label: 'Full name', required: true, autoComplete: 'name' },
  { key: 'line1', label: 'Address', required: true, autoComplete: 'address-line1' },
  { key: 'line2', label: 'Apartment, suite, etc.', required: false, autoComplete: 'address-line2' },
  { key: 'city', label: 'City', required: true, autoComplete: 'address-level2' },
  { key: 'postal_code', label: 'Postal code', required: true, autoComplete: 'postal-code' },
]

export const countryOptions: SelectOption[] = [
  ['ES', 'Spain'],
  ['FR', 'France'],
  ['DE', 'Germany'],
  ['IT', 'Italy'],
  ['PT', 'Portugal'],
  ['NL', 'Netherlands'],
].map(([value, label]) => ({ value, label }))

export function emptyAddress(name = ''): Address {
  return { name, line1: '', line2: '', city: '', postal_code: '', country: 'ES' }
}
