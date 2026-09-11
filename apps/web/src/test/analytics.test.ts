import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initAnalytics,
  sanitizeAnalyticsPayload,
  sanitizeAnalyticsUrl,
  trackAnalytics,
  type AnalyticsConfig,
} from '../analytics'

const enabledConfig: AnalyticsConfig = {
  enabled: true,
  websiteId: 'website-123',
  scriptUrl: 'https://cloud.umami.is/script.js',
  domains: 'books.example.com,www.books.example.com',
}

afterEach(() => {
  document.getElementById('orphaleia-umami-analytics')?.remove()
  delete window.umami
  delete window.orphaleiaAnalyticsBeforeSend
  vi.restoreAllMocks()
})

describe('Umami analytics bootstrap', () => {
  it('stays disabled unless production configuration is complete', () => {
    expect(initAnalytics({ ...enabledConfig, enabled: false })).toBe(false)
    expect(initAnalytics({ ...enabledConfig, websiteId: '' })).toBe(false)
    expect(initAnalytics({ ...enabledConfig, scriptUrl: '' })).toBe(false)
    expect(initAnalytics({ ...enabledConfig, domains: '' })).toBe(false)
    expect(document.querySelector('script[data-website-id]')).toBeNull()
  })

  it('loads one domain-restricted tracker that respects Do Not Track', () => {
    expect(initAnalytics(enabledConfig)).toBe(true)
    expect(initAnalytics(enabledConfig)).toBe(true)

    const script = document.getElementById('orphaleia-umami-analytics') as HTMLScriptElement
    expect(document.querySelectorAll('#orphaleia-umami-analytics')).toHaveLength(1)
    expect(script.src).toBe('https://cloud.umami.is/script.js')
    expect(script.defer).toBe(true)
    expect(script.dataset.websiteId).toBe('website-123')
    expect(script.dataset.domains).toBe('books.example.com,www.books.example.com')
    expect(script.dataset.doNotTrack).toBe('true')
    expect(script.dataset.excludeHash).toBe('true')
    expect(script.dataset.beforeSend).toBe('orphaleiaAnalyticsBeforeSend')
  })

  it('does not disrupt the app when the tracker is blocked', () => {
    initAnalytics(enabledConfig)
    const script = document.getElementById('orphaleia-umami-analytics') as HTMLScriptElement
    expect(() => script.dispatchEvent(new Event('error'))).not.toThrow()
    expect(window.umami).toBeUndefined()
  })

  it('queues early commerce events and flushes them after the tracker loads', () => {
    const track = vi.fn()
    initAnalytics(enabledConfig)
    trackAnalytics('checkout_started', { item_count: 2, value: 31.5, currency: 'EUR' })
    window.umami = { track }

    document.getElementById('orphaleia-umami-analytics')?.dispatchEvent(new Event('load'))

    expect(track).toHaveBeenCalledWith('checkout_started', { item_count: 2, value: 31.5, currency: 'EUR' })
  })
})

describe('analytics privacy filtering', () => {
  it('keeps approved catalogue and UTM parameters but removes free text and hashes', () => {
    expect(sanitizeAnalyticsUrl('/books?q=private+phrase&genre=classics&utm_source=newsletter&token=secret#results'))
      .toBe('/books?genre=classics&utm_source=newsletter')
    expect(sanitizeAnalyticsUrl('/rankings?year=2025&market=all-covered&preview=concept'))
      .toBe('/rankings?year=2025&market=all-covered')
  })

  it('removes payment references, order IDs, and account tokens', () => {
    expect(sanitizeAnalyticsUrl('/payment/return?order=order-1&provider=stripe&reference=secret'))
      .toBe('/payment/return')
    expect(sanitizeAnalyticsUrl('/reset-password?token=private-token')).toBe('/reset-password')
    expect(sanitizeAnalyticsUrl('/confirm-email-change?token=private-token')).toBe('/confirm-email-change')
  })

  it('allows only the declared properties for known events', () => {
    expect(sanitizeAnalyticsPayload('event', {
      name: 'add_to_bag',
      url: '/books/the-little-prince?token=private',
      data: {
        book_slug: 'the-little-prince',
        quantity: 1,
        value: 12.5,
        currency: 'EUR',
        email: 'reader@example.com',
        address: 'Private street',
        access_token: 'private-auth-token',
        comment: 'A private reader note',
      },
    })).toEqual({
      name: 'add_to_bag',
      url: '/books/the-little-prince',
      data: { book_slug: 'the-little-prince', quantity: 1, value: 12.5, currency: 'EUR' },
    })
  })

  it('rejects unknown custom events and strips data from page views', () => {
    expect(sanitizeAnalyticsPayload('event', { name: 'identify_reader', data: { email: 'reader@example.com' } }))
      .toBe(false)
    expect(sanitizeAnalyticsPayload('event', { url: '/account?order=private', data: { user_id: 'reader-1' } }))
      .toEqual({ url: '/account' })
  })
})
