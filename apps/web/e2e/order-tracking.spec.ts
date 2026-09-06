import { expect, test, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const customer = {
  id: 'reader-1', email: 'reader@example.com', pending_email: null, full_name: 'Mina Reader', avatar_url: null,
  role: 'customer', is_verified: true, default_shipping_address: null,
}

const order = {
  id: 'order-1', number: 'ORP-260905-7536', status: 'paid', subtotal_cents: 4200, shipping_cents: 770,
  total_cents: 4970, currency: 'EUR', tracking_reference: null, tracking_carrier: null, tracking_url: null,
  created_at: '2026-09-05T10:00:00Z',
  status_history: [{ status: 'paid', occurred_at: '2026-09-05T10:01:00Z' }],
  shipping: { name: 'Mina Reader', line1: '1 Odyssey Way', line2: '', city: 'Madrid', postal_code: '28001', country: 'ES' },
  items: [{ book_id: 'book-1', title: 'The Test Passage', isbn: '9780000099999', cover_url: '/covers/test.svg', unit_price_cents: 4200, quantity: 1 }],
}

async function mockSession(page: Page, admin = false) {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...customer, role: admin ? 'admin' : 'customer' }) }))
  await page.route('**/api/v1/cart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }) }))
}

test('reader opens the full delivery timeline and tracking link', async ({ page }) => {
  await mockSession(page)
  const delivered = {
    ...order,
    status: 'delivered',
    tracking_carrier: 'Correos',
    tracking_reference: 'PQ48392761ES',
    tracking_url: 'https://www.correos.es/track/PQ48392761ES',
    status_history: [
      ...order.status_history,
      { status: 'processing', occurred_at: '2026-09-05T12:00:00Z' },
      { status: 'shipped', occurred_at: '2026-09-06T08:00:00Z' },
      { status: 'out_for_delivery', occurred_at: '2026-09-08T07:00:00Z' },
      { status: 'delivered', occurred_at: '2026-09-08T14:00:00Z' },
    ],
  }
  await page.route('**/api/v1/orders', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [delivered] }) }))

  await page.goto('/account?section=orders&order=order-1')
  await expect(page.getByRole('button', { name: /ORP-260905-7536/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('list', { name: /Delivery progress/ })).toBeVisible()
  await expect(page.getByText('PQ48392761ES')).toBeVisible()
  await expect(page.getByRole('link', { name: /Track with carrier/ })).toHaveAttribute('href', delivered.tracking_url)
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
})

test('staff advances a paid order through every guided fulfilment step', async ({ page }) => {
  await mockSession(page, true)
  let current = structuredClone(order)
  const updates: Array<Record<string, unknown>> = []
  await page.route('**/api/v1/admin/overview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: 18, customers: 12, open_orders: 1, hidden_comments: 0 }) }))
  await page.route('**/api/v1/admin/orders**', async (route: Route) => {
    if (route.request().method() === 'PATCH') {
      const update = route.request().postDataJSON() as Record<string, string | null>
      updates.push(update)
      current = {
        ...current,
        status: update.status,
        tracking_carrier: update.tracking_carrier ?? current.tracking_carrier,
        tracking_reference: update.tracking_reference ?? current.tracking_reference,
        tracking_url: update.tracking_url ?? current.tracking_url,
        status_history: [...current.status_history, { status: update.status, occurred_at: new Date().toISOString() }],
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [current] }) })
  })

  await page.goto('/admin')
  await page.getByRole('button', { name: 'orders', exact: true }).click()
  await page.getByRole('button', { name: /Manage/ }).click()
  await page.getByRole('button', { name: 'Start preparing' }).click()
  await expect(page.locator('[data-status="processing"]')).toBeVisible()

  await page.getByLabel('Carrier').fill('Correos')
  await page.getByLabel('Tracking reference').fill('PQ48392761ES')
  await page.getByLabel(/Tracking URL/).fill('https://www.correos.es/track/PQ48392761ES')
  await page.getByRole('button', { name: 'Review shipment' }).click()
  await page.getByRole('button', { name: 'Confirm update' }).click()
  await expect(page.locator('[data-status="shipped"]')).toBeVisible()

  await page.getByRole('button', { name: 'Mark out for delivery' }).click()
  await expect(page.locator('[data-status="out_for_delivery"]')).toBeVisible()
  await page.getByRole('button', { name: 'Mark delivered' }).click()
  await expect(page.getByText(/customer will receive an email/i)).toBeVisible()
  await page.getByRole('button', { name: 'Confirm update' }).click()
  await expect(page.locator('[data-status="delivered"]')).toBeVisible()

  expect(updates.map((update) => update.status)).toEqual(['processing', 'shipped', 'out_for_delivery', 'delivered'])
  expect(updates[1]).toMatchObject({ tracking_carrier: 'Correos', tracking_reference: 'PQ48392761ES' })
})
