import { expect, test } from '@playwright/test'

test('catalog custom filters are keyboard accessible and URL driven', async ({ page }) => {
  await page.goto('/books')
  const genre = page.getByRole('button', { name: /Genre All genres/i })
  await genre.focus()
  await genre.press('ArrowDown')
  await genre.press('ArrowDown')
  await genre.press('Enter')
  await expect(page).toHaveURL(/genre=/)
  await expect(page.locator('select')).toHaveCount(0)

  const search = page.getByRole('textbox', { name: 'Search books' })
  await search.fill('prince')
  await expect(page).toHaveURL(/q=prince/, { timeout: 2_000 })
  await expect(page.getByRole('status').first()).toContainText(/book/i)
})

test('author portraits reveal color from synchronized pointer and focus states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/authors')

  const gallery = page.getByLabel('Author portrait gallery')
  const portraitLink = gallery.getByRole('link').first()
  const portrait = portraitLink.getByRole('img')
  await expect(portrait).toBeVisible()
  await expect.poll(() => portrait.evaluate((image) => getComputedStyle(image).filter)).toContain('grayscale(1)')

  await portraitLink.hover()
  await expect(portraitLink).toHaveAttribute('data-active', 'true')
  await expect.poll(() => portrait.evaluate((image) => getComputedStyle(image).filter)).toContain('grayscale(0)')

  await page.mouse.move(0, 0)
  await portraitLink.focus()
  await expect(portraitLink).toHaveAttribute('data-active', 'true')
  await expect.poll(() => portrait.evaluate((image) => getComputedStyle(image).filter)).toContain('grayscale(0)')

  const textLink = page.locator('ol').getByRole('link').first()
  await textLink.dispatchEvent('pointerdown', { pointerType: 'touch' })
  await expect(portraitLink).toHaveAttribute('data-active', 'true')
})

test('customer and admin route guards wait for auth and render stable states', async ({ page }) => {
  const user = { id: 'user-1', email: 'admin@orphaleia.local', full_name: 'Admin Reader', role: 'admin', is_verified: true }
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/api/v1/cart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }) }))
  await page.route('**/api/v1/orders', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/overview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: 18, orders: 3, readers: 12, comments: 7 }) }))
  await page.route('**/api/v1/admin/books', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/authors', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/genres', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/shipping-zones', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/orders', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/comments', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))

  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Welcome, Admin' })).toBeVisible()
  await expect(page).toHaveURL('/account')

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Shop admin' })).toBeVisible()
  await expect(page.getByText('18')).toBeVisible()
  const adminTabs = new Map([
    ['books', 'Catalog'],
    ['taxonomy', 'Authors and shelves'],
    ['shipping', 'Shipping zones'],
    ['orders', 'Orders'],
    ['comments', 'Reader comments'],
  ])
  for (const [tab, heading] of adminTabs) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('all routes remain free of unexpected console and page errors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Console traversal is sampled once in desktop Chromium.')
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  const user = { id: 'console-user', email: 'keeper@orphaleia.local', full_name: 'Ada Keeper', role: 'admin', is_verified: true }
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/api/v1/cart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cart', items: [], subtotal_cents: 0, currency: 'EUR' }) }))
  await page.route('**/api/v1/orders', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/overview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: 18, orders: 3, readers: 12, comments: 7 }) }))

  const routes = ['/', '/books', '/books/the-little-prince', '/genres', '/authors', '/rankings', '/sign-in', '/register', '/verify', '/forgot-password', '/reset-password', '/cart', '/checkout', '/payment/return', '/account', '/admin', '/admin/books/new', '/not-a-real-page']
  for (const route of routes) {
    await page.goto(route)
    await page.locator('main').waitFor()
    await page.waitForTimeout(100)
  }
  expect(errors).toEqual([])
})

test('representative routes do not overflow at key responsive widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Responsive geometry is sampled once in desktop Chromium.')
  test.setTimeout(75_000)
  const routes = ['/', '/books', '/books/the-little-prince', '/genres', '/authors', '/rankings', '/sign-in', '/register', '/not-a-real-page']
  const widths = [320, 390, 768, 1024, 1440]
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    for (const route of routes) {
      await page.goto(route)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await page.locator('img').evaluateAll((images) => images.every((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    }
  }
})
