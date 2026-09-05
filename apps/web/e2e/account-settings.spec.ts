import { expect, test, type Page } from '@playwright/test'

const avatarPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const user = { id: 'reader-1', email: 'reader@example.com', pending_email: null, full_name: 'Ariadne Reader', avatar_url: null, role: 'customer', is_verified: true }

async function mockSession(page: Page) {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/api/v1/cart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }) }))
}

test('account hub deep links to profile and saves name and portrait', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/users/me/profile', async (route) => {
    const body = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, full_name: body.full_name }) })
  })
  await page.route('**/api/v1/users/me/avatar', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, avatar_url: '/media/avatars/reader-1/portrait.webp' }) }))

  await page.goto('/account?section=profile')
  await expect(page.getByRole('link', { name: /Profile/ })).toHaveAttribute('aria-current', 'page')
  await page.getByLabel('Display name').fill('Marina Reader')
  await page.getByRole('button', { name: 'Save display name' }).click()
  await expect(page.getByRole('status')).toContainText('Display name saved')

  await page.locator('input[name="avatar"]').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: avatarPng })
  await page.getByRole('button', { name: 'Save portrait' }).click()
  await expect(page.getByRole('status')).toContainText('Reader portrait updated')
})

test('comments show the reader portrait and retain an initials fallback', async ({ page }) => {
  await mockSession(page)
  const book = {
    id: 'book-1', title: 'The Test Passage', slug: 'the-test-passage', isbn: '9780000000001', description: 'A sufficiently long description for the browser test.', publication_year: 2026,
    price_cents: 2100, currency: 'EUR', stock_qty: 4, available: true, cover_url: '/covers/the-hobbit.webp', featured: false, active: true,
    rating_average: 4, rating_count: 1, authors: [{ id: 'author-1', name: 'Test Author', slug: 'test-author', bio: '', image_url: null }], genres: [{ id: 'genre-1', name: 'Fiction', slug: 'fiction', description: '' }],
    comments: [
      { id: 'comment-1', body: 'A note with a portrait.', created_at: '2026-09-05T00:00:00Z', author: 'Marina Reader', author_avatar_url: '/media/avatars/reader-1/portrait.webp' },
      { id: 'comment-2', body: 'A note with initials.', created_at: '2026-09-04T00:00:00Z', author: 'Ada Lovelace', author_avatar_url: null },
    ],
  }
  await page.route('**/api/v1/books/the-test-passage', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(book) }))
  await page.route('**/api/v1/books/book-1/rating-trend', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ points: [] }) }))
  await page.route('**/media/avatars/reader-1/portrait.webp', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: avatarPng }))

  await page.goto('/books/the-test-passage')
  const comments = page.getByText('From fellow readers').locator('..')
  await expect(comments.locator('img[src="/media/avatars/reader-1/portrait.webp"]')).toBeVisible()
  await expect(comments.getByText('AL', { exact: true })).toBeVisible()
})

test('confirming an email change clears the signed-in account state', async ({ page }) => {
  let confirmed = false
  await page.route('**/api/v1/users/me', (route) => confirmed ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Sign in required' }) }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/api/v1/cart', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cart-1', items: [], subtotal_cents: 0, currency: 'EUR' }) }))
  await page.route('**/api/v1/auth/confirm-email-change', (route) => { confirmed = true; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Email updated. Sign in again with your new address.' }) }) })

  await page.goto('/confirm-email-change?token=valid-token')
  await expect(page.getByRole('status')).toContainText('Email updated')
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
})
