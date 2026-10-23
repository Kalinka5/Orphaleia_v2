import { expect, test } from '@playwright/test'

test('rankings appear immediately with URL-backed filters and no preview messaging', async ({ page }) => {
  let salesRequests = 0
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, body: '{}' }))
  await page.route('**/api/v1/rankings/sales**', (route) => {
    salesRequests++
    return route.fulfill({ json: { status: 'unavailable', available_years: [], available_markets: [], available_genres: [], items: [] } })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/rankings')
  const chart = page.getByRole('list', { name: /2025 top-selling print books in Covered markets/ })
  await expect(chart.getByRole('listitem')).toHaveCount(8)
  await expect(chart.getByRole('link')).toHaveCount(0)
  await expect(page.getByText('2,486,300')).toBeVisible()
  await expect(page).toHaveURL(/year=2025.*market=all-covered/)
  await expect(page.getByRole('main').getByText(/concept|fictional|illustrative|demo|not published|public-display/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View concept preview' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Exit preview' })).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Fantasy', exact: true }).click()
  await expect(chart.getByRole('listitem')).toHaveCount(2)
  await expect(page).toHaveURL(/genre=fantasy/)
  await page.goBack()
  await expect(chart.getByRole('listitem')).toHaveCount(8)

  await page.getByRole('combobox', { name: 'Sales year' }).click()
  await page.getByRole('option', { name: '2024', exact: true }).click()
  const selectedChart = page.getByRole('list', { name: /2024 top-selling print books/ })
  await expect(selectedChart.getByRole('listitem').first()).toContainText('A Map of Quiet Places')
  await expect(page.getByText('2,213,400')).toBeVisible()

  await page.getByRole('combobox', { name: /^Market / }).click()
  await page.getByRole('option', { name: 'Spain', exact: true }).click()
  await expect(page).toHaveURL(/year=2024.*market=spain/)
  await expect(page.getByText('196,320')).toBeVisible()
  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Fantasy', exact: true }).click()
  await expect(selectedChart.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByText('142,730')).toBeVisible()
  await page.reload()
  await expect(selectedChart.getByRole('listitem')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(salesRequests).toBe(0)

  await page.goto('/rankings?preview=concept')
  await expect(chart.getByRole('listitem')).toHaveCount(8)
  await expect(page.getByRole('main').getByText(/concept|fictional|illustrative|demo|not published/i)).toHaveCount(0)
  expect(salesRequests).toBe(0)
})
