import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const publicRoutes = ['/', '/books', '/books/the-little-prince', '/sign-in', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms', '/not-a-real-page']

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
}

for (const route of publicRoutes) {
  test(`${route} has no serious automated WCAG violations`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    await expectNoSeriousViolations(page)
  })
}

test('authenticated customer and admin forms have no serious automated WCAG violations', async ({ page }) => {
  const user = { id: 'admin-1', email: 'keeper@orphaleia.local', pending_email: null, full_name: 'Ada Keeper', avatar_url: null, role: 'admin', is_verified: true, default_shipping_address: null }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/users/me')
      ? user
      : path.endsWith('/cart')
        ? { id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }
        : path.endsWith('/authors')
          ? { items: [{ id: 'author-1', name: 'Test Author', slug: 'test-author', bio: '', image_url: '/covers/test.webp' }] }
          : path.endsWith('/genres')
            ? { items: [{ id: 'genre-1', name: 'Fiction', slug: 'fiction', description: '' }] }
            : path.endsWith('/admin/overview')
              ? { books: 1, customers: 1, open_orders: 0, hidden_comments: 0 }
              : path.endsWith('/admin/shipping-zones') || path.endsWith('/admin/books') || path.endsWith('/admin/orders') || path.endsWith('/admin/comments') || path.endsWith('/admin/users')
                ? { items: [] }
                : { items: [] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  for (const route of ['/account?section=profile', '/account?section=delivery', '/account?section=security', '/checkout']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    await expectNoSeriousViolations(page)
  }

  await page.goto('/admin')
  await page.getByRole('button', { name: 'taxonomy', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add author' })).toBeVisible()
  await expectNoSeriousViolations(page)
  await page.getByRole('button', { name: 'shipping', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shipping zones', exact: true })).toBeVisible()
  await expect(page.getByLabel('Zone name')).toBeVisible()
  await expectNoSeriousViolations(page)

  await page.goto('/admin/books/new')
  await expect(page.getByRole('heading', { name: 'Add a book' })).toBeVisible()
  await expectNoSeriousViolations(page)
})
