import type { ApiError } from './types'

const API = import.meta.env.VITE_API_URL || '/api/v1'

export class ApiRequestError extends Error {
  status: number
  code?: string
  fieldErrors?: Record<string, string>
  requestId?: string

  constructor(message: string, status: number, error: Partial<ApiError> = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = error.code
    this.fieldErrors = error.field_errors
    this.requestId = error.request_id
  }
}

function cookie(name: string) {
  return document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))?.split('=')[1] || ''
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('X-CSRF-Token', decodeURIComponent(cookie('csrf_token')))
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: 'The voyage was interrupted. Try again.' }))) as Partial<ApiError>
    throw new ApiRequestError(error.message || 'The voyage was interrupted. Try again.', response.status, error)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export const money = (cents: number, currency = 'EUR') => new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
