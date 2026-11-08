import { expect, test } from '@playwright/test'

for (const path of ['/reading-current', '/reading-current/shared/old-link']) {
  test(`removed quiz URL shows the not-found page: ${path}`, async ({ page }) => {
    const quizRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/') && request.url().includes('reading-current')) quizRequests.push(request.url())
    })
    await page.route('**/api/v1/users/me', (route) => route.fulfill({ json: null }))
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'We cannot tell a lie...' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('a[href*="reading-current"]')).toHaveCount(0)
    expect(quizRequests).toEqual([])
  })
}

test('storefront pages contain no quiz links or invitations', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ json: null }))
  for (const path of ['/', '/books', '/genres', '/account']) {
    await page.goto(path)
    await expect(page.locator('header').first()).toBeVisible()
    await expect(page.locator('a[href*="reading-current"]')).toHaveCount(0)
    await expect(page.getByText(/Find Your Reading Current|Eight choices will chart|READING CURRENT/)).toHaveCount(0)
  }
})
