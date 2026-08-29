import { expect, test, type Page } from '@playwright/test'

async function mockGuest(page: Page) {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) }))
}

test('home exposes the discovery route', async ({ page }) => {
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Ophelia, beyond the page.' })
  await expect(hero.getByRole('heading', { name: 'Ophelia, beyond the page.' })).toBeVisible()
  await expect(hero.getByRole('link', { name: /Browse books/i })).toHaveAttribute('href', '/books')
  await expect(hero.getByRole('link', { name: /Readers’ charts/i })).toHaveAttribute('href', '/rankings')

  const heroImage = hero.getByRole('img', { name: /Ophelia floating peacefully/i })
  await expect(heroImage).toBeVisible()
  await expect(heroImage).toHaveJSProperty('complete', true)
  expect(await heroImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)

  const currentSource = await heroImage.evaluate((image: HTMLImageElement) => image.currentSrc)
  expect(currentSource).toContain((page.viewportSize()?.width ?? 0) <= 760 ? 'ophelia-hero-mobile.webp' : 'ophelia-hero-desktop.webp')

  const heroVideo = hero.locator('video')
  await expect(heroVideo).toBeVisible()
  await expect.poll(() => heroVideo.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(3)
  expect(await heroVideo.evaluate((video: HTMLVideoElement) => video.muted)).toBe(true)
  await expect(heroVideo).toHaveAttribute('playsinline', '')
  expect(await heroVideo.evaluate((video: HTMLVideoElement) => video.currentSrc)).toMatch(/ophelia-hero\.(webm|mp4)$/)

  const header = page.getByRole('banner')
  await expect(header).toBeVisible()
  await expect(page.getByRole('link', { name: /Cart with 0 items/i })).toBeVisible()

  if ((page.viewportSize()?.width ?? 0) <= 1050) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'All books' })).toBeVisible()
  }
})

test('home presents the ordered classic collection with complete artwork', async ({ page }) => {
  await page.goto('/')

  const expectedSlugs = [
    'romeo-and-juliet',
    'the-adventures-of-sherlock-holmes',
    'the-little-prince',
    'twenty-thousand-leagues-under-the-sea',
  ]
  const bento = page.getByTestId('featured-bento')
  const books = bento.locator('[data-featured-slug]')

  await expect(books).toHaveCount(4)
  await expect(books.nth(1)).toHaveAttribute('data-featured-layout', 'horizontal')
  expect(await books.evaluateAll((items) => items.map((item) => item.getAttribute('data-featured-slug')))).toEqual(expectedSlugs)

  for (const image of await bento.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }

  const storyCards = page.getByTestId('collection-stack').locator('[data-collection-slug]')
  await expect(storyCards).toHaveCount(4)
  expect(await storyCards.evaluateAll((items) => items.map((item) => item.getAttribute('data-collection-slug')))).toEqual(expectedSlugs)
  for (const image of await page.getByTestId('collection-stack').getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Cheshire cat stays centered directly above the genre guidance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const section = page.getByRole('region', { name: 'Follow your reading instinct.' })
  const heading = section.getByRole('heading', { name: 'Follow your reading instinct.' })
  const companion = section.getByTestId('genre-companion')
  const cat = companion.locator('figure')
  const copy = companion.getByText('Move sideways through the shelves. The collection that opens is the one asking for your attention.')

  await companion.scrollIntoViewIfNeeded()
  await expect(cat.locator('img')).toHaveJSProperty('complete', true)

  const headingBox = await heading.boundingBox()
  const catBox = await cat.boundingBox()
  const copyBox = await copy.boundingBox()
  expect(headingBox).not.toBeNull()
  expect(catBox).not.toBeNull()
  expect(copyBox).not.toBeNull()
  expect(copyBox!.y - (catBox!.y + catBox!.height)).toBeCloseTo(24, 0)
  expect(Math.abs((catBox!.x + catBox!.width / 2) - (copyBox!.x + copyBox!.width / 2))).toBeLessThan(2)

  if ((page.viewportSize()?.width ?? 0) <= 760) {
    expect(headingBox!.y + headingBox!.height).toBeLessThan(catBox!.y)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Wonderland tea party sits below the genre accordion without overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const accordion = page.getByTestId('genre-accordion')
  const tableau = page.getByTestId('wonderland-tea-party')
  const testimonials = page.getByRole('region', { name: 'Books travel farther when readers talk.' })
  const image = tableau.locator('img')
  await tableau.scrollIntoViewIfNeeded()
  await expect(image).toHaveJSProperty('complete', true)
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)

  const mobile = (page.viewportSize()?.width ?? 0) <= 760
  expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(`wonderland-tea-party-${mobile ? 'mobile' : 'desktop'}.png`)

  const accordionBox = await accordion.boundingBox()
  const tableauBox = await tableau.boundingBox()
  expect(accordionBox).not.toBeNull()
  expect(tableauBox).not.toBeNull()
  const accordionGap = tableauBox!.y - (accordionBox!.y + accordionBox!.height)
  expect(accordionGap).toBeGreaterThan(0)
  expect(accordionGap).toBeLessThanOrEqual(60)
  if (!mobile) {
    expect(tableauBox!.width).toBeCloseTo(Math.min(1096, accordionBox!.width), 0)
    expect(tableauBox!.x + tableauBox!.width / 2).toBeCloseTo(accordionBox!.x + accordionBox!.width / 2, 0)
  }

  const testimonialsBox = await testimonials.boundingBox()
  expect(testimonialsBox).not.toBeNull()
  const testimonialsGap = testimonialsBox!.y - (tableauBox!.y + tableauBox!.height)
  expect(testimonialsGap).toBeLessThanOrEqual(220)

  await expect(tableau).toHaveCSS('opacity', '1')
  await expect(tableau).toHaveCSS('transform', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('Peter Pan and Captain Hook frame the reader notes without covering its copy', async ({ page }) => {
  await page.goto('/')

  const section = page.getByRole('region', { name: 'Books travel farther when readers talk.' })
  const stage = section.getByTestId('reader-notes-characters')
  const heading = section.getByRole('heading', { name: 'Books travel farther when readers talk.' })
  const peter = section.getByTestId('reader-notes-peter')
  const hook = section.getByTestId('reader-notes-hook')

  await stage.scrollIntoViewIfNeeded()
  await expect(peter).toHaveAttribute('aria-hidden', 'true')
  await expect(hook).toHaveAttribute('aria-hidden', 'true')

  for (const image of [peter.locator('img'), hook.locator('img')]) {
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }

  const peterBox = await peter.boundingBox()
  const hookBox = await hook.boundingBox()
  const headingBox = await heading.boundingBox()
  expect(peterBox).not.toBeNull()
  expect(hookBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  expect(peterBox!.x).toBeLessThan(hookBox!.x)

  if ((page.viewportSize()?.width ?? 0) <= 760) {
    expect(peterBox!.y + peterBox!.height).toBeLessThanOrEqual(headingBox!.y)
    expect(hookBox!.y + hookBox!.height).toBeLessThanOrEqual(headingBox!.y)
  } else {
    expect(peterBox!.x + peterBox!.width).toBeLessThanOrEqual(headingBox!.x)
    expect(hookBox!.x).toBeGreaterThanOrEqual(headingBox!.x + headingBox!.width)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('collection introduction stays pinned while its books scroll', async ({ page }) => {
  await page.goto('/')

  const intro = page.getByTestId('collection-intro')
  const stack = page.getByTestId('collection-stack')
  await expect(stack.locator('[data-collection-slug]')).toHaveCount(4)

  if ((page.viewportSize()?.width ?? 0) <= 1050) {
    await expect(intro).toHaveCSS('position', 'static')
    return
  }

  await expect(intro).toHaveCSS('position', 'sticky')
  const scrollRange = await stack.evaluate((element) => ({
    top: element.getBoundingClientRect().top + window.scrollY,
    height: element.getBoundingClientRect().height,
  }))

  const firstScrollY = scrollRange.top + scrollRange.height * 0.18
  await page.evaluate((y) => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, y)
  }, firstScrollY)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(firstScrollY, 0)
  const firstPinnedY = (await intro.boundingBox())!.y

  const secondScrollY = scrollRange.top + scrollRange.height * 0.58
  await page.evaluate((y) => window.scrollTo(0, y), secondScrollY)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(secondScrollY, 0)
  await expect.poll(async () => (await intro.boundingBox())?.y).toBeCloseTo(firstPinnedY, 0)
})

test('Don Quixote tableau supports the collection introduction without obscuring it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const section = page.getByRole('region', { name: 'A shelf should feel like a conversation.' })
  const intro = section.getByTestId('collection-intro')
  const tableau = section.getByTestId('don-quixote-tableau')
  const image = tableau.locator('img')
  const link = intro.getByRole('link', { name: /Explore all collections/i })
  const firstCard = section.getByTestId('collection-stack').locator('[data-collection-slug]').first()

  await tableau.scrollIntoViewIfNeeded()
  await expect(tableau).toHaveAttribute('aria-hidden', 'true')
  await expect(image).toHaveJSProperty('complete', true)
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)

  const compact = (page.viewportSize()?.width ?? 0) <= 1050
  expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(`don-quixote-tableau-${compact ? 'mobile' : 'desktop'}.png`)
  await expect(tableau).toHaveCSS('pointer-events', 'none')
  await expect(tableau).toHaveCSS('opacity', '1')
  await expect(tableau).toHaveCSS('transform', 'none')

  const sectionBox = await section.boundingBox()
  const tableauBox = await tableau.boundingBox()
  expect(sectionBox).not.toBeNull()
  expect(tableauBox).not.toBeNull()
  expect(tableauBox!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1)
  expect(tableauBox!.x + tableauBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1)

  if (compact) {
    const linkBox = await link.boundingBox()
    const firstCardBox = await firstCard.boundingBox()
    expect(linkBox).not.toBeNull()
    expect(firstCardBox).not.toBeNull()
    expect(tableauBox!.y).toBeGreaterThan(linkBox!.y + linkBox!.height)
    expect(tableauBox!.y + tableauBox!.height).toBeLessThan(firstCardBox!.y)
  } else {
    await expect(intro).toHaveCSS('position', 'sticky')
    expect(Number(await tableau.evaluate((element) => getComputedStyle(element).zIndex))).toBeLessThan(
      Number(await link.evaluate((element) => getComputedStyle(element).zIndex)),
    )
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('hero remains complete with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const hero = page.getByRole('region', { name: 'Ophelia, beyond the page.' })
  await expect(hero.getByRole('heading', { name: 'Ophelia, beyond the page.' })).toBeVisible()
  await expect(hero.getByRole('link', { name: /Browse books/i })).toBeVisible()
  await expect(hero.getByRole('img', { name: /Ophelia floating peacefully/i })).toBeVisible()
  await expect(hero.locator('video')).toBeHidden()
})

test('genre artwork expands from a vertical crop to a complete square', async ({ page }) => {
  await page.goto('/')

  const accordion = page.getByTestId('genre-accordion')
  await accordion.scrollIntoViewIfNeeded()
  const panels = accordion.locator('[data-genre-slug]')
  await expect(panels).toHaveCount(5)

  const images = accordion.getByRole('img')
  await expect(images).toHaveCount(5)
  for (const image of await images.all()) {
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }

  const romance = accordion.locator('[data-genre-slug="romance"]')
  const scienceFiction = accordion.locator('[data-genre-slug="science-fiction"]')
  const viewportWidth = page.viewportSize()?.width ?? 0

  if (viewportWidth <= 760) {
    for (const panel of await panels.all()) {
      const box = await panel.boundingBox()
      const imageBox = await panel.getByRole('img').boundingBox()
      expect(box).not.toBeNull()
      expect(imageBox).not.toBeNull()
      expect(Math.abs(box!.width - box!.height)).toBeLessThan(2)
      expect(imageBox!.width).toBeLessThanOrEqual(box!.width + 1)
      expect(imageBox!.height).toBeLessThanOrEqual(box!.height + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    return
  }

  const romanceImage = romance.getByRole('img')
  const scienceFictionImage = scienceFiction.getByRole('img')
  const initialRomanceBox = await romance.boundingBox()
  const initialRomanceImageBox = await romanceImage.boundingBox()
  const initialScienceFictionBox = await scienceFiction.boundingBox()
  const initialScienceFictionImageBox = await scienceFictionImage.boundingBox()
  expect(initialRomanceImageBox!.x + initialRomanceImageBox!.width).toBeLessThanOrEqual(initialRomanceBox!.x + initialRomanceBox!.width + 1)
  expect(Math.abs(initialRomanceBox!.width - initialRomanceImageBox!.width)).toBeLessThan(2)
  expect(initialScienceFictionImageBox!.x).toBeLessThan(initialScienceFictionBox!.x - 20)
  expect(initialScienceFictionImageBox!.x + initialScienceFictionImageBox!.width).toBeGreaterThan(initialScienceFictionBox!.x + initialScienceFictionBox!.width + 20)
  expect(Math.abs((initialScienceFictionImageBox!.x + initialScienceFictionImageBox!.width / 2) - (initialScienceFictionBox!.x + initialScienceFictionBox!.width / 2))).toBeLessThan(2)

  await scienceFiction.hover()
  await page.waitForTimeout(800)
  const hoveredScienceFictionBox = await scienceFiction.boundingBox()
  const hoveredScienceFictionImageBox = await scienceFictionImage.boundingBox()
  expect(hoveredScienceFictionImageBox!.x + hoveredScienceFictionImageBox!.width).toBeLessThanOrEqual(hoveredScienceFictionBox!.x + hoveredScienceFictionBox!.width + 1)
  expect(Math.abs(hoveredScienceFictionBox!.width - hoveredScienceFictionImageBox!.width)).toBeLessThan(2)
  expect(Math.abs((hoveredScienceFictionImageBox!.x + hoveredScienceFictionImageBox!.width / 2) - (hoveredScienceFictionBox!.x + hoveredScienceFictionBox!.width / 2))).toBeLessThan(2)

  await page.mouse.move(0, 0)
  await scienceFiction.focus()
  await page.waitForTimeout(800)
  const focusedScienceFictionBox = await scienceFiction.boundingBox()
  const focusedScienceFictionImageBox = await scienceFictionImage.boundingBox()
  expect(focusedScienceFictionImageBox!.x + focusedScienceFictionImageBox!.width).toBeLessThanOrEqual(focusedScienceFictionBox!.x + focusedScienceFictionBox!.width + 1)
  expect(Math.abs(focusedScienceFictionBox!.width - focusedScienceFictionImageBox!.width)).toBeLessThan(2)
})

test('auth pages use their focused responsive shell and artwork', async ({ page }) => {
  await mockGuest(page)
  const mobile = (page.viewportSize()?.width ?? 0) <= 760
  const pages = [
    { route: '/sign-in', heading: 'Login', asset: 'sherlock-holmes' },
    { route: '/register', heading: 'Register', asset: 'doctor-watson' },
  ]
  let loginPalette: string[] | undefined

  for (const entry of pages) {
    await page.goto(entry.route)
    await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible()
    await expect(page.getByRole('contentinfo')).toHaveCount(0)

    const artwork = page.getByTestId('auth-artwork')
    const form = page.getByTestId('auth-form-panel')
    const formContent = form.locator('form')
    const image = artwork.getByRole('img')
    await expect(image).toBeVisible()
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
    expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(`${entry.asset}-${mobile ? 'mobile' : 'desktop'}.webp`)
    expect(await artwork.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none')
    expect(await artwork.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('none')

    const palette = await page.getByTestId('auth-shell').evaluate((shell) => {
      const panel = shell.querySelector<HTMLElement>('[data-testid="auth-form-panel"]')!
      const artworkPanel = shell.querySelector<HTMLElement>('[data-testid="auth-artwork"]')!
      const submit = shell.querySelector<HTMLElement>('form > button')!
      const heading = shell.querySelector<HTMLElement>('h1')!
      return [
        getComputedStyle(panel).backgroundColor,
        getComputedStyle(artworkPanel).backgroundColor,
        getComputedStyle(submit).backgroundColor,
        getComputedStyle(heading).color,
      ]
    })
    if (entry.route === '/sign-in') loginPalette = palette
    else expect(palette).toEqual(loginPalette)

    if (mobile) {
      await expect(page.getByRole('link', { name: 'Back to shop' })).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'Account page navigation' })).toBeHidden()
      const formBox = await form.boundingBox()
      const artworkBox = await artwork.boundingBox()
      expect(artworkBox!.y).toBeGreaterThanOrEqual(formBox!.y + formBox!.height - 1)
    } else {
      await expect(page.getByRole('link', { name: 'Browse books' })).toBeVisible()
      await expect(page.getByRole('link', { name: /Cart with 0 items/i })).toBeVisible()
      const shellBox = await page.getByTestId('auth-shell').boundingBox()
      const formBox = await form.boundingBox()
      const formContentBox = await formContent.boundingBox()
      const artworkBox = await artwork.boundingBox()
      const imageBox = await image.boundingBox()
      expect(shellBox!.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) - 76 + 1)
      expect(artworkBox!.x).toBeGreaterThanOrEqual(formBox!.x + formBox!.width - 1)
      expect(formContentBox!.width).toBeLessThanOrEqual(421)
      expect(formContentBox!.x).toBeLessThan(formBox!.x + (formBox!.width - formContentBox!.width) / 2)
      expect(artworkBox!.width).toBeLessThan(formBox!.width)
      expect(imageBox!.x).toBeLessThan(artworkBox!.x)
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('registration confirms passwords and submits the unchanged API payload', async ({ page }) => {
  await mockGuest(page)
  let requests = 0
  let submittedBody: Record<string, unknown> | undefined
  await page.route('**/api/v1/auth/register', async (route) => {
    requests += 1
    submittedBody = route.request().postDataJSON() as Record<string, unknown>
    await new Promise((resolve) => setTimeout(resolve, 150))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Check your email to verify your account.' }) })
  })

  await page.goto('/register')
  const password = page.locator('input[name="password"]')
  const confirmation = page.locator('input[name="confirmPassword"]')
  await page.getByLabel('Your name').fill('Marina Soler')
  await page.getByLabel('Email address').fill('marina@example.com')
  await password.fill('longpassword123')
  await confirmation.fill('longpassword456')

  await expect(password).toHaveAttribute('type', 'password')
  await expect(confirmation).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(confirmation).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show confirmation password' }).click()
  await expect(confirmation).toHaveAttribute('type', 'text')

  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
  expect(requests).toBe(0)

  await confirmation.fill('longpassword123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('button', { name: 'Creating account…' })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Check your email')
  expect(requests).toBe(1)
  expect(submittedBody).toEqual({ email: 'marina@example.com', full_name: 'Marina Soler', password: 'longpassword123' })
  expect(submittedBody).not.toHaveProperty('confirmPassword')
})

test('auth routes keep account recovery and cross-navigation links', async ({ page }) => {
  await mockGuest(page)
  await page.goto('/sign-in')
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')

  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
})
