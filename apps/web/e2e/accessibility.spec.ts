import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const publicRoutes = ['/', '/books', '/books/the-little-prince', '/sign-in', '/privacy', '/terms', '/not-a-real-page']

for (const route of publicRoutes) {
  test(`${route} has no serious automated WCAG violations`, async ({ page }) => {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
  })
}
