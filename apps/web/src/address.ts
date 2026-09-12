import type { Address } from './types'
import type { SelectOption } from './components/ui/SelectControl'

export const addressFields: Array<{
  key: Exclude<keyof Address, 'country'>
  label: string
  required: boolean
  autoComplete: string
  minLength?: number
  maxLength: number
}> = [
  { key: 'name', label: 'Full name', required: true, autoComplete: 'name', minLength: 2, maxLength: 160 },
  { key: 'line1', label: 'Address', required: true, autoComplete: 'address-line1', minLength: 3, maxLength: 240 },
  { key: 'line2', label: 'Apartment, suite, etc.', required: false, autoComplete: 'address-line2', maxLength: 240 },
  { key: 'city', label: 'City', required: true, autoComplete: 'address-level2', minLength: 2, maxLength: 120 },
  { key: 'postal_code', label: 'Postal code', required: true, autoComplete: 'postal-code', minLength: 3, maxLength: 24 },
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
