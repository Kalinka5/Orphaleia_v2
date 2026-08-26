import { expect, test, type Page } from '@playwright/test'

const visualProjects = new Set(['chromium', 'mobile-chromium'])

async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => document.fonts.ready)
}

async function mockAuthenticatedReader(page: Page, admin = false) {
  const user = {
    id: 'visual-user',
    email: admin ? 'keeper@orphaleia.local' : 'reader@orphaleia.local',
    full_name: admin ? 'Ada Keeper' : 'Mina Reader',
    role: admin ? 'admin' : 'customer',
    is_verified: true,
  }
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/api/v1/orders', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }))
  await page.route('**/api/v1/admin/overview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: 18, orders: 3, readers: 12, comments: 7 }) }))
}

async function capture(page: Page, name: string, fullPage = true) {
  await settle(page)
  await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', fullPage, timeout: 15_000 })
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!visualProjects.has(testInfo.project.name), 'Visual baselines use the two Chromium reference viewports.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('home visual baseline', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ophelia, beyond the page.' })).toBeVisible()
  await capture(page, 'home', false)
})

test('catalog open-filter visual baseline', async ({ page }) => {
  await page.goto('/books')
  await page.getByRole('button', { name: /Genre All genres/i }).click()
  await expect(page.getByRole('listbox', { name: 'Genre' })).toBeVisible()
  await capture(page, 'catalog-open-filter')
})

test('book detail visual baseline', async ({ page }) => {
  await page.goto('/books/the-little-prince')
  await expect(page.getByRole('heading', { name: 'The Little Prince' })).toBeVisible()
  await capture(page, 'book-detail')
})

test('authentication visual baseline', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await capture(page, 'sign-in')
})

test('checkout visual baseline', async ({ page }) => {
  await mockAuthenticatedReader(page)
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { name: 'Where should these stories find you?' })).toBeVisible()
  await capture(page, 'checkout')
})

test('account visual baseline', async ({ page }) => {
  await mockAuthenticatedReader(page)
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Welcome, Mina' })).toBeVisible()
  await capture(page, 'account')
})

test('admin visual baseline', async ({ page }) => {
  await mockAuthenticatedReader(page, true)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Today at Orphaleia' })).toBeVisible()
  await capture(page, 'admin')
})

test('not-found visual baseline', async ({ page }) => {
  await page.goto('/not-a-real-page')
  await expect(page.getByRole('heading', { name: 'This island is not on the chart.' })).toBeVisible()
  await capture(page, 'not-found')
})
