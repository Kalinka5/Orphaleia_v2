import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

type RoundFixture = {
  answers: { type: string; question_id: string; answer: string }[]
  states: Record<string, { status: string; question?: { id: string; prompt: string }; book?: { title: string } }>
}
const fixture = JSON.parse(readFileSync(new URL('../src/test/fixtures/book-oracle.json', import.meta.url), 'utf8')) as RoundFixture & { manifest: object; alice: RoundFixture }

type Event = { type: string; question_id?: string; answer?: string; book_id?: string; correct?: boolean }
async function mockOracle(page: Page, round: RoundFixture = fixture) {
  await page.route('**/api/v1/book-oracle', (route) => route.fulfill({ json: fixture.manifest }))
  await page.route('**/api/v1/book-oracle/step', async (route) => {
    const events = route.request().postDataJSON().events as Event[]
    const state = round.states[JSON.stringify(events)]
    await route.fulfill(state ? { json: state } : { status: 422, json: { message: 'Unexpected transcript.' } })
  })
}
async function transition(page: Page, click: () => Promise<unknown>) {
  const response = page.waitForResponse((r) => r.url().endsWith('/book-oracle/step') && r.request().method() === 'POST')
  await click()
  const result = await response
  expect(result.status()).toBe(200)
  await expect(page.getByRole('region', { name: 'Book guessing game' })).toHaveAttribute('aria-busy', 'false')
  return result.json()
}
async function start(page: Page) {
  return transition(page, () => page.getByRole('button', { name: 'Let’s begin' }).click())
}
async function noSeriousViolations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
}

test('plays a complete round, resumes the tab, goes back, and restarts', async ({ page }, info) => {
  if (!process.env.ORACLE_LIVE) await mockOracle(page)
  await page.goto('/book-oracle')
  await expect(page.getByRole('heading', { name: 'Think of a book. Keep its title secret.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('oracle-introduction.png'), fullPage: true })
  await start(page)
  await page.screenshot({ path: info.outputPath('oracle-question.png'), fullPage: true })
  const labels: Record<string, string> = { yes: 'Yes', no: 'No', unknown: 'Don’t know' }
  for (let i = 0; i < fixture.answers.length; i++) {
    const answer = fixture.answers[i]
    const next = await transition(page, () => page.getByRole('button', { name: labels[answer.answer], exact: true }).click())
    if (i === 0) {
      const resumed = page.waitForResponse((r) => r.url().endsWith('/book-oracle/step'))
      await page.reload(); await resumed
      await expect(page.getByRole('heading', { name: next.question.prompt })).toBeVisible()
      await transition(page, () => page.getByRole('button', { name: 'Back', exact: true }).click())
      await transition(page, () => page.getByRole('button', { name: labels[answer.answer], exact: true }).click())
    }
  }
  await expect(page.getByRole('heading', { name: 'The Hobbit', exact: true })).toBeVisible()
  await noSeriousViolations(page)
  await page.screenshot({ path: info.outputPath('oracle-guess.png'), fullPage: true })
  await transition(page, () => page.getByRole('button', { name: 'That’s my book' }).click())
  await expect(page.getByRole('button', { name: 'Think of another book' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('oracle-success.png'), fullPage: true })
  await transition(page, () => page.getByRole('button', { name: 'Think of another book' }).click())
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled()
})

test('guesses Alice as soon as the white-rabbit plot is confirmed despite broad-answer mismatches', async ({ page }) => {
  if (!process.env.ORACLE_LIVE) await mockOracle(page, fixture.alice)
  await page.goto('/book-oracle')
  await start(page)
  let confirmedRabbit = false
  const labels: Record<string, string> = { yes: 'Yes', no: 'No', unknown: 'Don’t know' }
  for (const answer of fixture.alice.answers) {
    const next = await transition(page, () => page.getByRole('button', { name: labels[answer.answer], exact: true }).click())
    if (answer.question_id === 'clue-alices-adventures-in-wonderland') {
      expect(answer.answer).toBe('yes')
      expect(next.status).toBe('guess')
      expect(next.book.id).toBe('alices-adventures-in-wonderland')
      confirmedRabbit = true
    }
  }
  expect(confirmedRabbit).toBe(true)
  await expect(page.getByRole('heading', { name: 'Alice’s Adventures in Wonderland', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'That’s my book' })).toBeVisible()
})

test('retries a failed answer exactly once and continues after rejecting a guess', async ({ page }) => {
  await mockOracle(page)
  await page.goto('/book-oracle'); await start(page)
  let failed = ''
  await page.route('**/api/v1/book-oracle/step', async (route) => {
    failed = route.request().postData()!
    await route.fulfill({ status: 503, json: { message: 'The oracle needs a moment.' } })
  }, { times: 1 })
  const first = fixture.answers[0]
  await page.getByRole('button', { name: first.answer === 'yes' ? 'Yes' : 'No', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  const retry = page.waitForRequest((r) => r.url().endsWith('/book-oracle/step'))
  await transition(page, () => page.getByRole('button', { name: 'Retry' }).click())
  expect((await retry).postData()).toBe(failed)
  for (const answer of fixture.answers.slice(1)) {
    await transition(page, () => page.getByRole('button', { name: answer.answer === 'yes' ? 'Yes' : answer.answer === 'no' ? 'No' : 'Don’t know', exact: true }).click())
  }
  const next = await transition(page, () => page.getByRole('button', { name: 'Keep looking' }).click())
  expect(next.status).toBe('question')
  await expect(page.getByRole('heading', { name: next.question.prompt })).toBeVisible()
})

test('supports dark mode, reduced motion, keyboard answers, and fresh starts for old rounds', async ({ page }, info) => {
  await mockOracle(page)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(() => sessionStorage.setItem('orphaleia.book-oracle', JSON.stringify({ version: 'old', events: [] })))
  await page.goto('/book-oracle')
  await expect(page.getByText(/older or unreadable edition/)).toBeVisible()
  await noSeriousViolations(page)
  await start(page)
  await noSeriousViolations(page)
  const button = page.getByRole('button', { name: fixture.answers[0].answer === 'yes' ? 'Yes' : 'No', exact: true })
  await button.focus()
  await transition(page, () => page.keyboard.press('Enter'))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('oracle-dark-question.png'), fullPage: true })
})

test('homepage and mobile navigation expose the new game', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Meet the Book Oracle' })).toHaveAttribute('href', '/book-oracle')
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  const menu = page.getByRole('button', { name: 'Open navigation' })
  if (await menu.isVisible()) await menu.click()
  await expect(nav.getByRole('link', { name: 'Book Oracle' })).toBeVisible()
})
