import { expect, test } from '@playwright/test'

const visualProjects = new Set(['chromium', 'mobile-chromium'])

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!visualProjects.has(testInfo.project.name), 'Ranking baselines use the Chromium reference viewports.')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) }))
})

test('annual bestseller chart visual baseline', async ({ page }) => {
  await page.goto('/rankings')
  await expect(page.getByRole('heading', { name: 'Top-selling books' })).toBeVisible()
  await expect(page.getByRole('list', { name: /top-selling print books/i })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('annual-bestseller-chart.png', { animations: 'disabled', fullPage: true, timeout: 15_000 })
})
