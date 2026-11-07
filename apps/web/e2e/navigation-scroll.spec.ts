import { expect, test } from '@playwright/test'

for (const source of ['featured', 'collection'] as const) {
  test(`opening a ${source} book from Home starts at the top`, async ({ page }) => {
    await page.goto('/')
    const bookLink = source === 'featured'
      ? page.getByTestId('featured-bento').getByRole('link').last()
      : page.getByRole('link', { name: 'Open this book', exact: true }).last()
    await bookLink.scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
    const destination = await bookLink.getAttribute('href')
    await bookLink.click()

    await expect(page).toHaveURL(destination!)
    await expect(page.getByRole('region', { name: /^Interactive preview of / })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.getByRole('banner')).toBeInViewport()
  })
}
