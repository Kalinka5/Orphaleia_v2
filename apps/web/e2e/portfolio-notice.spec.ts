import { expect, test } from '@playwright/test'

test('portfolio disclosure leaves header controls accessible across routes', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) }))
  await page.goto('/')

  const notice = page.getByRole('note').filter({ hasText: 'Portfolio demonstration' })
  const header = page.getByRole('banner')
  await expect(notice).toBeVisible()
  const noticeBox = await notice.boundingBox()
  const headerBox = await header.boundingBox()
  expect(headerBox!.y).toBeGreaterThanOrEqual(noticeBox!.y + noticeBox!.height)

  if ((page.viewportSize()?.width ?? 0) <= 1050) {
    const menu = page.getByRole('button', { name: 'Open navigation' })
    await menu.click()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
  }

  await header.getByRole('link', { name: 'Cart with 0 items' }).click()
  await expect(page).toHaveURL('/sign-in')
  const authNoticeBox = await notice.boundingBox()
  expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(authNoticeBox!.y + authNoticeBox!.height)
  await header.getByRole('link', { name: 'Orphaleia home' }).click()
  await expect(page).toHaveURL('/')

  await page.goto('/terms')
  const termsNoticeBox = await notice.boundingBox()
  expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(termsNoticeBox!.y + termsNoticeBox!.height)

  await page.evaluate(() => window.scrollTo(0, 240))
  await expect.poll(async () => (await notice.boundingBox())!.y + (await notice.boundingBox())!.height).toBeLessThanOrEqual(0)
})

test('wrapped disclosure reserves space on narrow screens with enlarged text', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'Exercise narrow layout in both mobile engines.')
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/')
  const notice = page.getByRole('note').filter({ hasText: 'Portfolio demonstration' })
  await notice.evaluate((element) => { element.style.fontSize = '24px' })
  const noticeBox = await notice.boundingBox()
  expect((await page.getByRole('banner').boundingBox())!.y).toBeGreaterThanOrEqual(noticeBox!.y + noticeBox!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
})
