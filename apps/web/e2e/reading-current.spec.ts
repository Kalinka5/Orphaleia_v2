import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const genre = { id: 'genre-fantasy', name: 'Fantasy', slug: 'fantasy', description: 'Journeys through imagined worlds.' }
const result = {
  version: '2026.1', completed_at: '2026-09-17T12:00:00Z', primary_genre: genre,
  related_genres: [
    { id: 'genre-adventure', name: 'Adventure', slug: 'adventure', description: 'Bold journeys.' },
    { id: 'genre-young-adult', name: 'Young Adult', slug: 'young-adult', description: 'Stories of becoming.' },
  ],
  archetype: { id: 'elsewhere-dreamer', name: 'The Elsewhere Dreamer', description: 'You read to test the border between the possible and the almost believable.' },
  explanation: 'Your choices point to room for wonder, worlds that bend what is possible, and the charged moment of becoming.',
  traits: ['room for wonder', 'worlds that bend what is possible', 'the charged moment of becoming'],
  books: [{
    id: 'book-1', title: 'The Lantern Atlas', slug: 'the-lantern-atlas', isbn: '9780000000001', description: 'A mapmaker follows a light beyond the edge of every known chart.', publication_year: 2026,
    price_cents: 1800, currency: 'EUR', stock_qty: 0, available: false, cover_url: '/covers/the-hobbit.webp', featured: false, active: true, rating_average: 4.4, rating_count: 18,
    authors: [{ id: 'author-1', name: 'Iris Vale', slug: 'iris-vale', bio: '', image_url: null }], genres: [genre],
  }],
}

function question(step: number) {
  const scene = step <= 2 ? 'moonlit-harbor' : step <= 4 ? 'doorway-archive' : step <= 6 ? 'forked-forest' : 'distant-lighthouse'
  return { id: `question-${step}`, prompt: `Which route calls at chapter ${step}?`, hint: 'Choose the answer that feels true today.', scene, step, total_steps: 8, answers: [
    { id: 'lantern', label: 'Follow the lantern', description: 'A warm light and an uncertain path.' },
    { id: 'stars', label: 'Read the stars', description: 'A larger pattern waits overhead.' },
    { id: 'map', label: 'Trust the map', description: 'Careful marks and a tested route.' },
    { id: 'tide', label: 'Listen to the tide', description: 'Let the current make the first decision.' },
  ] }
}

async function mockReadingCurrent(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith('/users/me')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) })
    if (path.endsWith('/reading-current') && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '2026.1', total_steps: 8, title: 'Find Your Reading Current', introduction: 'Eight choices will chart the stories most likely to keep you reading.', first_question: question(1) }) })
    if (path.endsWith('/reading-current/step')) {
      const body = request.postDataJSON() as { answers: unknown[] }
      const payload = body.answers.length === 8
        ? { status: 'complete', version: '2026.1', total_steps: 8, result }
        : { status: 'question', version: '2026.1', total_steps: 8, question: question(body.answers.length + 1) }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    }
    if (path.endsWith('/reading-current/shares') && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'share-1', url: 'http://localhost:5173/reading-current/shared/public-token', display_name: null, created_at: result.completed_at, expires_at: '2027-09-17T12:00:00Z', revoked_at: null, revoke_token: 'private-browser-token' }) })
    if (path.endsWith('/reading-current/shares/public-token') && request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result, display_name: null, expires_at: '2027-09-17T12:00:00Z' }) })
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) })
  })
}

async function expectAccessible(page: Page) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  const serious = report.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
}

async function finishVoyage(page: Page) {
  for (let step = 1; step <= 8; step += 1) {
    const answer = page.getByRole('radio', { name: /Follow the lantern/ })
    const next = page.getByRole('button', { name: step === 8 ? /Reveal my current/ : /Continue/ })
    await answer.check({ force: true })
    await expect(answer).toBeChecked()
    await expect(next).toBeEnabled()
    await next.click({ force: true })
    if (step < 8) await expect(page.getByRole('heading', { name: `Which route calls at chapter ${step + 1}?` })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Fantasy', exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  await mockReadingCurrent(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('guest completes exactly eight choices and can open a recommendation', async ({ page }) => {
  await page.goto('/reading-current')
  await expect(page.getByRole('heading', { name: 'Find Your Reading Current' })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: /Set sail/ }).click()
  await expect(page.getByText('QUESTION 1 OF 8', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continue/ })).toBeDisabled()
  await expectAccessible(page)
  await finishVoyage(page)
  await expect(page.getByText('Currently out of stock')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('link', { name: /The Lantern Atlas/ }).click()
  await expect(page).toHaveURL(/\/books\/the-lantern-atlas$/)
})

test('public share round trip uses a generic noindex result page', async ({ page }) => {
  await page.goto('/reading-current')
  await page.getByRole('button', { name: /Set sail/ }).click()
  await finishVoyage(page)
  await page.getByRole('button', { name: /Create a share link/ }).click()
  const shareField = page.getByLabel('Your public link')
  await expect(shareField).toHaveValue(/public-token/)
  await page.goto(new URL(await shareField.inputValue()).pathname)
  await expect(page.getByRole('heading', { name: 'Fantasy', exact: true })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  await expect(page.getByRole('link', { name: /Start your own voyage/ })).toHaveAttribute('href', '/reading-current')
  await expectAccessible(page)
})

test('visual states remain intentional on desktop and mobile', async ({ page }, testInfo) => {
  test.skip(!['chromium', 'mobile-chromium'].includes(testInfo.project.name), 'Visual baselines cover desktop and mobile Chromium.')
  await page.goto('/reading-current')
  await expect(page.getByRole('heading', { name: 'Find Your Reading Current' })).toBeVisible()
  await expect(page).toHaveScreenshot('reading-current-introduction.png', { animations: 'disabled' })
  await page.getByRole('button', { name: /Set sail/ }).click()
  await expect(page.getByRole('heading', { name: 'Which route calls at chapter 1?' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page).toHaveScreenshot('reading-current-question.png', { animations: 'disabled' })
  await finishVoyage(page)
  await expect(page).toHaveScreenshot('reading-current-result.png', { animations: 'disabled', fullPage: true })
  await page.goto('/reading-current/shared/public-token')
  await expect(page.getByRole('heading', { name: 'Fantasy', exact: true })).toBeVisible()
  await expect(page).toHaveScreenshot('reading-current-shared.png', { animations: 'disabled', fullPage: true })
})
