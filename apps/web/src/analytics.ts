type PaymentProvider = 'stripe' | 'paypal'

export type AnalyticsEventProperties = {
  catalog_search: { has_results: boolean; result_count: number }
  add_to_bag: { book_slug: string; quantity: number; value: number; currency: string }
  remove_from_bag: { book_slug: string; quantity: number; value: number; currency: string }
  checkout_started: { item_count: number; value: number; currency: string }
  delivery_quoted: { subtotal: number; shipping: number; value: number; currency: string }
  payment_selected: { provider: PaymentProvider; value: number; currency: string }
  purchase: { provider: PaymentProvider; revenue: number; currency: string; item_count: number }
  payment_review: { provider: PaymentProvider; value: number; currency: string; item_count: number }
}

export type AnalyticsEventName = keyof AnalyticsEventProperties

type AnalyticsValue = string | number | boolean

export type AnalyticsPayload = {
  name?: string
  url?: string
  referrer?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

type UmamiTracker = {
  track: (name: string, data?: Record<string, AnalyticsValue>) => void
}

declare global {
  interface Window {
    umami?: UmamiTracker
    orphaleiaAnalyticsBeforeSend?: (type: string, payload: AnalyticsPayload) => AnalyticsPayload | false
  }
}

export type AnalyticsConfig = {
  enabled: boolean
  websiteId: string
  scriptUrl: string
  domains: string
}

const EVENT_PROPERTY_KEYS: { [K in AnalyticsEventName]: ReadonlyArray<keyof AnalyticsEventProperties[K]> } = {
  catalog_search: ['has_results', 'result_count'],
  add_to_bag: ['book_slug', 'quantity', 'value', 'currency'],
  remove_from_bag: ['book_slug', 'quantity', 'value', 'currency'],
  checkout_started: ['item_count', 'value', 'currency'],
  delivery_quoted: ['subtotal', 'shipping', 'value', 'currency'],
  payment_selected: ['provider', 'value', 'currency'],
  purchase: ['provider', 'revenue', 'currency', 'item_count'],
  payment_review: ['provider', 'value', 'currency', 'item_count'],
}

const UTM_PARAMETERS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'])
const CATALOG_PARAMETERS = new Set(['genre', 'author', 'available', 'sort', 'page'])
const RANKING_PARAMETERS = new Set(['year', 'market', 'genre'])
const SCRIPT_ID = 'orphaleia-umami-analytics'
const pendingEvents: Array<{ name: AnalyticsEventName; data: Record<string, AnalyticsValue> }> = []
const MAX_PENDING_EVENTS = 20

const defaultConfig: AnalyticsConfig = {
  enabled: import.meta.env.PROD,
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim() || '',
  scriptUrl: import.meta.env.VITE_UMAMI_SCRIPT_URL?.trim() || '',
  domains: import.meta.env.VITE_UMAMI_DOMAINS?.trim() || '',
}

function allowedUrlParameter(pathname: string, key: string) {
  if (UTM_PARAMETERS.has(key)) return true
  if ((pathname === '/books' || pathname === '/all-books') && CATALOG_PARAMETERS.has(key)) return true
  if (pathname === '/rankings' && RANKING_PARAMETERS.has(key)) return true
  return false
}

export function sanitizeAnalyticsUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, 'https://orphaleia.invalid')
    const safeParameters = new URLSearchParams()
    parsed.searchParams.forEach((value, key) => {
      if (allowedUrlParameter(parsed.pathname, key)) safeParameters.append(key, value)
    })
    const query = safeParameters.toString()
    return `${parsed.pathname}${query ? `?${query}` : ''}`
  } catch {
    return rawUrl.split(/[?#]/, 1)[0] || '/'
  }
}

function sanitizeReferrer(rawReferrer: string) {
  try {
    const parsed = new URL(rawReferrer, window.location.origin)
    if (parsed.origin === window.location.origin) return sanitizeAnalyticsUrl(`${parsed.pathname}${parsed.search}`)
    return parsed.origin
  } catch {
    return ''
  }
}

function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PROPERTY_KEYS, name)
}

function isAnalyticsValue(value: unknown): value is AnalyticsValue {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean'
}

export function sanitizeAnalyticsPayload(_type: string, payload: AnalyticsPayload): AnalyticsPayload | false {
  const sanitized: AnalyticsPayload = { ...payload }
  if (typeof sanitized.url === 'string') sanitized.url = sanitizeAnalyticsUrl(sanitized.url)
  if (typeof sanitized.referrer === 'string') sanitized.referrer = sanitizeReferrer(sanitized.referrer)

  if (typeof sanitized.name !== 'string') {
    delete sanitized.data
    return sanitized
  }
  if (!isAnalyticsEventName(sanitized.name)) return false

  const allowedKeys = new Set<string>(EVENT_PROPERTY_KEYS[sanitized.name] as readonly string[])
  sanitized.data = Object.fromEntries(
    Object.entries(sanitized.data || {}).filter(([key, value]) => allowedKeys.has(key) && isAnalyticsValue(value)),
  )
  return sanitized
}

function flushPendingEvents() {
  if (!window.umami) return
  for (const event of pendingEvents.splice(0)) window.umami.track(event.name, event.data)
}

export function initAnalytics(config: AnalyticsConfig = defaultConfig) {
  if (!config.enabled || !config.websiteId || !config.scriptUrl || !config.domains || typeof document === 'undefined') return false
  if (document.getElementById(SCRIPT_ID)) return true

  window.orphaleiaAnalyticsBeforeSend = sanitizeAnalyticsPayload
  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.defer = true
  script.src = config.scriptUrl
  script.dataset.websiteId = config.websiteId
  script.dataset.doNotTrack = 'true'
  script.dataset.excludeHash = 'true'
  script.dataset.beforeSend = 'orphaleiaAnalyticsBeforeSend'
  if (config.domains) script.dataset.domains = config.domains
  script.addEventListener('load', flushPendingEvents, { once: true })
  script.addEventListener('error', () => {
    pendingEvents.splice(0)
    script.remove()
  }, { once: true })
  document.head.appendChild(script)
  return true
}

export function trackAnalytics<K extends AnalyticsEventName>(name: K, properties: AnalyticsEventProperties[K]) {
  const allowedKeys = new Set<string>(EVENT_PROPERTY_KEYS[name] as readonly string[])
  const data = Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => allowedKeys.has(key) && isAnalyticsValue(value)),
  ) as Record<string, AnalyticsValue>

  if (window.umami) {
    window.umami.track(name, data)
    return
  }
  if (document.getElementById(SCRIPT_ID) && pendingEvents.length < MAX_PENDING_EVENTS) pendingEvents.push({ name, data })
}
