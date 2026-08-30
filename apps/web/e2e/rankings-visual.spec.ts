import { expect, test } from '@playwright/test'


const visualProjects = new Set(['chromium', 'mobile-chromium'])
const rankingItems = [
  { rank: 1, title: 'Fourth Wing', authors: ['Rebecca Yarros'], genre: 'Fantasy', units_sold: 2513487 },
  { rank: 2, title: 'The Women', authors: ['Kristin Hannah'], genre: 'Historical Fiction', units_sold: 1842761 },
  { rank: 3, title: 'Atomic Habits', authors: ['James Clear'], genre: 'Non-fiction', units_sold: 1538904 },
  { rank: 4, title: 'Happy Place', authors: ['Emily Henry'], genre: 'Romance', units_sold: 1217643 },
]


test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!visualProjects.has(testInfo.project.name), 'Ranking baselines use the Chromium reference viewports.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) }))
  await page.route('**/api/v1/rankings/sales**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    status: 'published', year: 2025, market: 'all-covered', scope_label: 'BookScan covered markets',
    source: { name: 'NielsenIQ BookScan', url: 'https://example.com/bookscan', coverage_note: 'Licensed print point-of-sale data across covered markets.', methodology_note: 'Calendar-year units grouped into provider-defined works.' },
    available_years: [2025], available_markets: [{ value: 'all-covered', label: 'BookScan covered markets' }],
    available_genres: [{ value: 'fantasy', label: 'Fantasy' }, { value: 'historical-fiction', label: 'Historical Fiction' }, { value: 'non-fiction', label: 'Non-fiction' }, { value: 'romance', label: 'Romance' }],
    items: rankingItems,
  }) }))
})


test('annual bestseller chart visual baseline', async ({ page }) => {
  await page.goto('/rankings')
  await expect(page.getByRole('heading', { name: 'Top-selling books' })).toBeVisible()
  await expect(page.getByRole('list', { name: /top-selling print books/i })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('annual-bestseller-chart.png', { animations: 'disabled', fullPage: true, timeout: 15_000 })
})
