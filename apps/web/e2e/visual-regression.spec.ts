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
  await expect(page.getByRole('heading', { name: 'Books worth keeping close.' })).toBeVisible()
  await capture(page, 'home', false)
})

test('Wonderland genre tableau visual baseline', async ({ page }) => {
  await page.goto('/')
  const tableau = page.getByTestId('wonderland-tea-party')
  const image = tableau.locator('img')
  await tableau.scrollIntoViewIfNeeded()
  await expect(image).toHaveJSProperty('complete', true)
  await settle(page)
  await expect(tableau).toHaveScreenshot('wonderland-genre-tableau.png', { animations: 'disabled', timeout: 15_000 })
})

test('Cheshire cat genre heading visual baseline', async ({ page }) => {
  await page.goto('/')
  const heading = page.getByRole('heading', { name: 'Follow your reading instinct.' })
  const composition = heading.locator('..')
  const image = page.getByTestId('genre-companion').locator('img')
  await composition.scrollIntoViewIfNeeded()
  await expect(image).toHaveJSProperty('complete', true)
  await settle(page)
  await expect(composition).toHaveScreenshot('cheshire-cat-genre-heading.png', { animations: 'disabled', timeout: 15_000 })
})

test('collection-to-genre desktop transition visual baseline', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'This transition adjustment is desktop-only.')
  await page.goto('/')
  const collectionCards = page.getByTestId('collection-stack').locator('article')
  await expect(collectionCards).toHaveCount(4)
  await collectionCards.last().scrollIntoViewIfNeeded()
  await expect(collectionCards.last().locator('img')).toHaveJSProperty('complete', true)
  const genreSection = page.locator('section[aria-labelledby="genre-section-title"]')
  await genreSection.scrollIntoViewIfNeeded()
  await expect(page.getByTestId('genre-companion').locator('img')).toHaveJSProperty('complete', true)
  await settle(page)
  const genreTop = await genreSection.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  await page.evaluate((top) => window.scrollTo(0, top), Math.max(0, genreTop - 320))
  await expect(page).toHaveScreenshot('collection-genre-transition.png', { animations: 'disabled', fullPage: false, timeout: 15_000 })
})

test('Don Quixote collection introduction visual baseline', async ({ page }) => {
  await page.goto('/')
  const intro = page.getByTestId('collection-intro')
  const image = intro.getByTestId('don-quixote-tableau').locator('img')
  await intro.scrollIntoViewIfNeeded()
  await expect(image).toHaveJSProperty('complete', true)
  await settle(page)
  await expect(intro).toHaveScreenshot('don-quixote-collection-intro.png', { animations: 'disabled', timeout: 15_000 })
})

test('catalog open-filter visual baseline', async ({ page }) => {
  await page.goto('/books')
  await page.getByRole('button', { name: /Genre All genres/i }).click()
  await expect(page.getByRole('listbox', { name: 'Genre' })).toBeVisible()
  await capture(page, 'catalog-open-filter')
})

test('book detail visual baseline', async ({ page }) => {
  await page.goto('/books/the-little-prince')
  await expect(page.getByRole('region', { name: /Interactive preview of The Little Prince/i })).toBeVisible()
  await capture(page, 'book-detail')
})

test('book detail open-page visual baseline', async ({ page }) => {
  await page.goto('/books/the-little-prince')
  const experience = page.getByRole('region', { name: /Interactive preview of The Little Prince/i })
  if ((page.viewportSize()?.width ?? 0) > 900) {
    await page.getByRole('button', { name: 'Next spread' }).click()
  } else {
    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByRole('button', { name: 'Next page' }).click()
    await page.getByRole('button', { name: 'Next page' }).click()
  }
  await settle(page)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(experience).toHaveScreenshot('book-detail-open.png', { animations: 'disabled', timeout: 15_000 })
})

test('authentication visual baselines', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await capture(page, 'sign-in')

  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()
  await capture(page, 'register')
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
