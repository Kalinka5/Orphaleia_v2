import { expect, test } from '@playwright/test'

test('concept is explicit, interactive and isolated from live data', async ({ page }) => {
  let salesRequests = 0
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, body: '{}' }))
  await page.route('**/api/v1/rankings/sales**', (route) => {
    salesRequests++
    return route.fulfill({ json: { status: 'unavailable', available_years: [], available_markets: [], available_genres: [], items: [] } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/rankings?preview=concept')
  await expect(page.getByText('Concept preview · Fictional data')).toBeVisible()
  const chart = page.getByRole('list', { name: /Fictional concept/ })
  await expect(chart.getByRole('listitem')).toHaveCount(8)
  await expect(chart.getByRole('link')).toHaveCount(0)
  expect(salesRequests).toBe(0)
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Fantasy', exact: true }).click()
  await expect(chart.getByRole('listitem')).toHaveCount(2)
  await expect(page).toHaveURL(/genre=fantasy/)
  await page.goBack()
  await expect(chart.getByRole('listitem')).toHaveCount(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/rankings-concept-${test.info().project.name}.png`, fullPage: true })
  await page.getByRole('link', { name: 'Exit preview' }).click()
  await expect(page.getByText('Verified annual data is not published yet')).toBeVisible()
  await expect(chart).toHaveCount(0)
  await page.getByRole('button', { name: 'View concept preview' }).click()
  await expect(page.getByText('Concept preview · Fictional data')).toBeVisible()
})
