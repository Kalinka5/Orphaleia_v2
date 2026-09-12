import { expect, test, type Page } from '@playwright/test'

async function mockGuest(page: Page) {
  await page.route('**/api/v1/users/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) }))
}

test('home exposes the discovery route', async ({ page }) => {
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Books worth keeping close.' })
  await expect(hero.getByRole('heading', { name: 'Books worth keeping close.' })).toBeVisible()
  await expect(hero.getByRole('link', { name: /Browse books/i })).toHaveAttribute('href', '/books')
  await expect(hero.getByRole('link', { name: /Bestseller charts/i })).toHaveAttribute('href', '/rankings')

  const stage = hero.getByTestId('hero-book-stage')
  const compactHero = (page.viewportSize()?.width ?? 0) <= 760
  await expect(stage).toHaveAttribute('aria-label', new RegExp(`hovering fan of ${compactHero ? 'three' : 'five'} featured books`, 'i'))
  await expect.poll(() => stage.getAttribute('data-scene-state')).toMatch(/ready|fallback/)
  const expectedHeroSlugs = compactHero
    ? ['romeo-and-juliet', 'the-adventures-of-sherlock-holmes', 'the-little-prince']
    : ['twenty-thousand-leagues-under-the-sea', 'romeo-and-juliet', 'the-adventures-of-sherlock-holmes', 'the-little-prince', 'the-hobbit']
  await expect(stage.locator('[data-hero-book-slug]')).toHaveCount(expectedHeroSlugs.length)
  expect(await stage.locator('[data-hero-book-slug]').evaluateAll((items) => items.map((item) => item.getAttribute('data-hero-book-slug')))).toEqual(expectedHeroSlugs)
  await expect(stage.getByRole('link')).toHaveCount(0)
  await expect(stage.getByRole('button')).toHaveCount(0)
  await expect(hero.locator('video')).toHaveCount(0)

  const header = page.getByRole('banner')
  await expect(header).toBeVisible()
  await expect(page.getByRole('link', { name: /Cart with 0 items/i })).toBeVisible()

  if ((page.viewportSize()?.width ?? 0) <= 1050) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'All books' })).toBeVisible()
  }
})

test('annual bestseller chart uses sourced exact sales and URL-backed filters', async ({ page }) => {
  await mockGuest(page)
  await page.route('**/api/v1/rankings/sales**', async (route) => {
    const url = new URL(route.request().url())
    const genre = url.searchParams.get('genre')
    const allItems = [
      { rank: 1, title: 'The Test Passage', authors: ['Test Voyager'], genre: 'Adventure', units_sold: 1876543, isbn13: '9780000099999', catalog_slug: 'the-test-passage' },
      { rank: 2, title: 'A Quiet Atlas', authors: ['Mara Sol'], genre: 'Fantasy', units_sold: 934221, isbn13: '9781111111113', catalog_slug: null },
    ]
    const items = genre === 'fantasy' ? [{ ...allItems[1], rank: 1 }] : allItems
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      status: 'published', year: 2025, market: 'all-covered', genre, scope_label: 'BookScan covered markets',
      source: { name: 'NielsenIQ BookScan', url: 'https://example.com/bookscan', coverage_note: 'Licensed print point-of-sale data across covered markets.', methodology_note: 'Calendar-year units grouped into provider-defined works.' },
      available_years: [2025, 2024], available_markets: [{ value: 'all-covered', label: 'BookScan covered markets' }],
      available_genres: [{ value: 'adventure', label: 'Adventure' }, { value: 'fantasy', label: 'Fantasy' }], items,
    }) })
  })

  await page.goto('/rankings')
  await expect(page.getByRole('heading', { name: 'Top-selling books' })).toBeVisible()
  await expect(page).toHaveURL(/year=2025.*market=all-covered/)
  await expect(page.getByRole('list', { name: /2025 top-selling print books/i })).toBeVisible()
  await expect(page.getByText('1,876,543')).toBeVisible()
  await expect(page.getByRole('link', { name: 'The Test Passage' })).toHaveAttribute('href', '/books/the-test-passage')
  await expect(page.getByRole('link', { name: 'A Quiet Atlas' })).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Category' }).click()
  await page.getByRole('option', { name: 'Fantasy' }).click()
  await expect(page).toHaveURL(/genre=fantasy/)
  await expect(page.getByText('934,221')).toBeVisible()
  await expect(page.getByText('The Test Passage')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('annual bestseller chart never substitutes sample sales for unavailable licensed data', async ({ page }) => {
  await mockGuest(page)
  await page.route('**/api/v1/rankings/sales**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', available_years: [], available_markets: [], available_genres: [], items: [] }) }))
  await page.goto('/rankings')
  await expect(page.getByRole('heading', { name: 'Verified annual data is not published yet' })).toBeVisible()
  await expect(page.getByText(/public-display rights have been confirmed/i)).toBeVisible()
  await expect(page.getByRole('list')).toHaveCount(0)
})

test('hero books react without becoming navigation targets', async ({ page }) => {
  await page.goto('/')
  const stage = page.getByTestId('hero-book-stage')
  await expect.poll(() => stage.getAttribute('data-scene-state')).toMatch(/ready|fallback/)
  const sceneState = await stage.getAttribute('data-scene-state')

  const canvas = stage.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  const originalUrl = page.url()

  if ((page.viewportSize()?.width ?? 0) > 760) {
    if (sceneState === 'ready') {
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * .56)
      await expect.poll(() => stage.getAttribute('data-active-book')).not.toBe('')
      const activeBook = await stage.getAttribute('data-active-book')
      for (let sample = 0; sample < 8; sample += 1) {
        await page.waitForTimeout(80)
        expect(await stage.getAttribute('data-active-book')).toBe(activeBook)
      }
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * .56)
    } else {
      const centerBook = stage.locator('[data-hero-book-slug="the-adventures-of-sherlock-holmes"]')
      const frontCover = centerBook.locator(':scope > span').last()
      const restTransform = await frontCover.evaluate((element) => getComputedStyle(element).transform)
      await centerBook.hover({ position: { x: 160, y: 160 } })
      await expect(stage).toHaveAttribute('data-active-book', 'the-adventures-of-sherlock-holmes')
      await expect.poll(() => frontCover.evaluate((element) => getComputedStyle(element).transform)).not.toBe(restTransform)
      for (let sample = 0; sample < 8; sample += 1) {
        await page.waitForTimeout(80)
        await expect(stage).toHaveAttribute('data-active-book', 'the-adventures-of-sherlock-holmes')
      }
      await centerBook.click({ position: { x: 160, y: 160 } })
    }
    await expect(page).toHaveURL(originalUrl)
    await page.mouse.move(4, 4)
    await expect(stage).toHaveAttribute('data-active-book', '')
  } else {
    await expect(canvas).toHaveCSS('touch-action', 'pan-y')
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height * .62
    await canvas.dispatchEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: startX, clientY: startY })
    await expect(stage).toHaveAttribute('data-dragging', 'true')
    await canvas.dispatchEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: startX + 70, clientY: startY + 4 })
    await canvas.dispatchEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: startX + 70, clientY: startY + 4 })
    await expect(stage).toHaveAttribute('data-dragging', 'false')
    await expect(page).toHaveURL(originalUrl)
  }
})

test('book detail turns pages responsively and keeps purchase accessible', async ({ page }) => {
  await mockGuest(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/books/the-little-prince')

  if ((page.viewportSize()?.width ?? 0) > 900) {
    const stage = page.getByTestId('book-spread')
    const bottomPageBlock = page.getByTestId('book-page-block-bottom')
    await expect(bottomPageBlock).toHaveCSS('clip-path', 'inset(0px 0px 0px 50%)')
    const flipViewport = page.getByTestId('turning-leaf')
    await expect(flipViewport).toHaveCSS('overflow', 'visible')
    await expect.poll(() => flipViewport.evaluate((element) => getComputedStyle(element).clipPath)).toContain('-18%')
    const leaf = flipViewport.locator('.stf__block')
    const box = await leaf.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width * .985, box!.y + box!.height * .05)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * .72, box!.y + box!.height * .2, { steps: 8 })
    await expect(flipViewport).toHaveAttribute('data-turning', 'true')
    const forwardDestination = flipViewport.locator('.stf__item[style*="z-index: 13"]')
    const forwardLeaf = flipViewport.locator('.stf__item[style*="z-index: 15"]')
    await expect(forwardDestination).toHaveCount(1)
    await expect(forwardDestination).toContainText('About the book')
    await expect.poll(() => forwardDestination.evaluate((element) => getComputedStyle(element).clipPath)).not.toBe('none')
    await expect(forwardLeaf).toHaveCount(1)
    await expect.poll(() => forwardLeaf.evaluate((element) => getComputedStyle(element).clipPath)).not.toBe('none')
    await expect.poll(() => forwardLeaf.evaluate((element) => getComputedStyle(element).filter)).not.toBe('none')
    await page.mouse.move(box!.x + box!.width * .4, box!.y + box!.height * .26, { steps: 12 })
    await page.mouse.up()
    await expect(stage).toHaveAttribute('data-spread', '2')
    await expect(flipViewport).toHaveAttribute('data-turning', 'false')
    await expect(bottomPageBlock).toHaveCSS('clip-path', 'inset(0px 0px 0px 50%)')
    await expect(stage.getByRole('heading', { name: 'About the book' })).toBeVisible()

    await page.mouse.move(box!.x + box!.width * .015, box!.y + box!.height * .05)
    await expect(flipViewport).toHaveAttribute('data-state', 'fold_corner')
    const hoverDestination = flipViewport.locator('.stf__item[style*="z-index: 13"]')
    await expect(hoverDestination).toHaveCount(1)
    await expect.poll(() => hoverDestination.evaluate((element) => getComputedStyle(element).clipPath)).not.toBe('none')
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * .3, box!.y + box!.height * .2, { steps: 8 })
    await expect(flipViewport).toHaveAttribute('data-turning', 'true')
    const reverseDestination = flipViewport.locator('.stf__item[style*="z-index: 13"]')
    const reverseLeaf = flipViewport.locator('.stf__item[style*="z-index: 15"]')
    await expect(reverseDestination).toHaveCount(1)
    await expect(reverseDestination.locator('img[alt^="Cover of"]')).toHaveCount(1)
    await expect.poll(() => reverseDestination.evaluate((element) => getComputedStyle(element).clipPath)).not.toBe('none')
    await expect(reverseLeaf).toHaveCount(1)
    await expect(reverseLeaf).toContainText('The Little Prince')
    await expect.poll(() => reverseLeaf.evaluate((element) => getComputedStyle(element).clipPath)).not.toBe('none')
    await expect(flipViewport.locator('.stf__innerShadow')).toHaveCSS('background-color', 'rgb(248, 242, 231)')
    await page.mouse.move(box!.x + box!.width * .85, box!.y + box!.height * .85, { steps: 12 })
    await page.mouse.up()
    await expect(stage).toHaveAttribute('data-spread', '1')
    await expect(flipViewport).toHaveAttribute('data-turning', 'false')

    await page.mouse.move(box!.x + box!.width * .985, box!.y + box!.height * .05)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * .94, box!.y + box!.height * .08, { steps: 4 })
    await page.mouse.up()
    await page.mouse.move(4, 4)
    await expect(stage).toHaveAttribute('data-spread', '1')
    await expect(flipViewport).toHaveAttribute('data-turning', 'false')
    await expect(flipViewport.locator('.stf__item[style*="z-index: 13"]')).toHaveCount(0)
  } else {
    const pages = page.getByTestId('mobile-book-pages')
    const box = await pages.boundingBox()
    expect(box).not.toBeNull()
    await expect(pages).toHaveCSS('touch-action', 'pan-y')
    await pages.dispatchEvent('pointerdown', { bubbles: true, pointerId: 18, pointerType: 'touch', clientX: box!.x + box!.width * .8, clientY: box!.y + box!.height * .5 })
    await pages.dispatchEvent('pointermove', { bubbles: true, pointerId: 18, pointerType: 'touch', clientX: box!.x + box!.width * .2, clientY: box!.y + box!.height * .5 + 3 })
    await pages.dispatchEvent('pointerup', { bubbles: true, pointerId: 18, pointerType: 'touch', clientX: box!.x + box!.width * .2, clientY: box!.y + box!.height * .5 + 3 })
    await expect(pages).toHaveAttribute('data-page', '2')
    await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add to bag/i }).locator('..')).toHaveCSS('position', 'sticky')
  }

  await page.getByRole('button', { name: /Add to bag/i }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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

test('homepage FAQ sits before the final CTA and supports independent keyboard expansion', async ({ page }) => {
  await page.goto('/')

  const faq = page.getByRole('region', { name: 'Frequently asked questions.' })
  const cta = page.getByRole('region', { name: 'Find the book you’ll keep talking about.' })
  const firstQuestion = faq.getByRole('button', { name: 'How does Orphaleia choose its books?' })
  const paymentQuestion = faq.getByRole('button', { name: 'How can I pay?' })
  const firstCard = firstQuestion.locator('..')
  const paymentCard = paymentQuestion.locator('..')
  const firstAnswer = firstCard.getByTestId('faq-answer')

  await faq.scrollIntoViewIfNeeded()
  await expect(faq.getByTestId('faq-card')).toHaveCount(8)
  await expect(faq.locator('[data-open="true"]')).toHaveCount(0)
  await expect(firstAnswer).toHaveCSS('grid-template-rows', '0px')

  await firstQuestion.focus()
  await page.keyboard.press('Enter')
  await paymentQuestion.focus()
  await page.keyboard.press('Enter')

  await expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
  await expect(paymentQuestion).toHaveAttribute('aria-expanded', 'true')
  await expect(firstCard).toHaveAttribute('data-open', 'true')
  await expect(paymentCard).toHaveAttribute('data-open', 'true')
  await expect(firstAnswer).not.toHaveCSS('grid-template-rows', '0px')

  const faqBox = await faq.boundingBox()
  const ctaBox = await cta.boundingBox()
  expect(faqBox).not.toBeNull()
  expect(ctaBox).not.toBeNull()
  expect(faqBox!.y + faqBox!.height).toBeLessThanOrEqual(ctaBox!.y + 1)

  const mobile = (page.viewportSize()?.width ?? 0) <= 760
  const columns = faq.getByTestId('faq-columns')
  await expect(columns).toHaveCSS('grid-template-columns', mobile ? /\d+(?:\.\d+)?px/ : /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('seven storybook dwarfs peek from behind the featured bento', async ({ page }) => {
  await page.goto('/')

  const stage = page.getByTestId('featured-bento-stage')
  const tableau = page.getByTestId('featured-dwarfs')
  const bento = page.getByTestId('featured-bento')
  const dwarfs = tableau.locator('[data-dwarf-id]')

  await stage.scrollIntoViewIfNeeded()
  await expect(tableau).toHaveAttribute('aria-hidden', 'true')
  await expect(tableau).toHaveCSS('pointer-events', 'none')
  await expect(dwarfs).toHaveCount(7)

  expect(await dwarfs.evaluateAll((items) => items.filter((item) => item.getAttribute('data-dwarf-side') === 'left').length)).toBe(2)
  expect(await dwarfs.evaluateAll((items) => items.filter((item) => item.getAttribute('data-dwarf-side') === 'top').length)).toBe(3)
  expect(await dwarfs.evaluateAll((items) => items.filter((item) => item.getAttribute('data-dwarf-side') === 'right').length)).toBe(2)

  const visibleDwarfs = dwarfs.filter({ visible: true })
  for (const image of await visibleDwarfs.locator('img').all()) {
    await expect(image).toHaveJSProperty('complete', true)
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)
  }

  const mobile = (page.viewportSize()?.width ?? 0) <= 760
  await expect(visibleDwarfs).toHaveCount(mobile ? 3 : 7)
  const visibleSides = await visibleDwarfs.evaluateAll((items) => items.map((item) => item.getAttribute('data-dwarf-side')))
  expect(visibleSides.filter((side) => side === 'left')).toHaveLength(mobile ? 1 : 2)
  expect(visibleSides.filter((side) => side === 'top')).toHaveLength(mobile ? 1 : 3)
  expect(visibleSides.filter((side) => side === 'right')).toHaveLength(mobile ? 1 : 2)

  const bentoBox = await bento.boundingBox()
  expect(bentoBox).not.toBeNull()
  for (const dwarf of await visibleDwarfs.all()) {
    const side = await dwarf.getAttribute('data-dwarf-side')
    const box = await dwarf.boundingBox()
    expect(box).not.toBeNull()
    if (side === 'left') {
      expect(box!.x).toBeLessThan(bentoBox!.x)
      expect(box!.x + box!.width).toBeGreaterThan(bentoBox!.x)
      expect(box!.y + box!.height).toBeLessThanOrEqual(bentoBox!.y + bentoBox!.height + 1)
    } else if (side === 'right') {
      expect(box!.x).toBeLessThan(bentoBox!.x + bentoBox!.width)
      expect(box!.x + box!.width).toBeGreaterThan(bentoBox!.x + bentoBox!.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(bentoBox!.y + bentoBox!.height + 1)
    } else {
      expect(box!.y).toBeLessThan(bentoBox!.y)
      expect(box!.y + box!.height).toBeGreaterThan(bentoBox!.y)
    }
  }

  expect(Number(await bento.evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThan(Number(await tableau.evaluate((element) => getComputedStyle(element).zIndex)))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await bento.locator('[data-featured-slug]').first().click()
  await expect(page).toHaveURL(/\/books\/romeo-and-juliet$/)
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

  const hero = page.getByRole('region', { name: 'Books worth keeping close.' })
  await expect(hero.getByRole('heading', { name: 'Books worth keeping close.' })).toBeVisible()
  await expect(hero.getByRole('link', { name: /Browse books/i })).toBeVisible()
  const stage = hero.getByTestId('hero-book-stage')
  await expect(stage).toHaveAttribute('data-scene-state', 'reduced-motion')
  await expect(stage.getByTestId('hero-book-fallback')).toBeVisible()
  await expect(stage.locator('[data-hero-book-slug]')).toHaveCount((page.viewportSize()?.width ?? 0) <= 760 ? 3 : 5)
  await expect(stage.locator('canvas')).toBeHidden()
  await expect(hero.locator('video')).toHaveCount(0)
})

test('hero keeps an interactive 3D fallback when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return Reflect.apply(getContext, this, [type, ...args])
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/')

  const hero = page.getByRole('region', { name: 'Books worth keeping close.' })
  const stage = hero.getByTestId('hero-book-stage')
  await expect(stage).toHaveAttribute('data-scene-state', 'fallback')
  await expect(stage).toHaveAttribute('data-fallback-reason', /webgl2-unavailable|initialization-failed/)
  await expect(stage.getByTestId('hero-book-fallback')).toBeVisible()
  const centerBook = stage.locator('[data-hero-book-slug="the-adventures-of-sherlock-holmes"]')
  if ((page.viewportSize()?.width ?? 0) > 760) {
    await page.waitForTimeout(1300)
    const heroBox = await hero.boundingBox()
    const restVisualBoxes = await stage.locator('[data-hero-book-visual]').evaluateAll((elements) => elements.map((element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom }
    }))
    expect(heroBox).not.toBeNull()
    expect(heroBox!.height).toBeGreaterThanOrEqual(1099)
    expect(heroBox!.height).toBeLessThanOrEqual(1101)
    for (const bounds of restVisualBoxes) {
      expect(bounds.top).toBeGreaterThanOrEqual(heroBox!.y)
      expect(bounds.bottom).toBeLessThanOrEqual(heroBox!.y + heroBox!.height + 1)
    }
  }
  await centerBook.hover({ position: { x: 140, y: 150 } })
  await expect(stage).toHaveAttribute('data-active-book', 'the-adventures-of-sherlock-holmes')
  for (let sample = 0; sample < 10; sample += 1) {
    await page.waitForTimeout(80)
    await expect(stage).toHaveAttribute('data-active-book', 'the-adventures-of-sherlock-holmes')
  }
  if ((page.viewportSize()?.width ?? 0) > 760) {
    const visualBox = await centerBook.locator('[data-hero-book-visual]').boundingBox()
    const stageBox = await stage.boundingBox()
    const copy = hero.getByTestId('hero-copy')
    expect(visualBox).not.toBeNull()
    expect(stageBox).not.toBeNull()
    expect(visualBox!.y).toBeGreaterThanOrEqual(0)
    expect(visualBox!.y + visualBox!.height).toBeLessThanOrEqual(1101)
    expect(Number(await stage.evaluate((element) => getComputedStyle(element).zIndex))).toBeLessThan(
      Number(await copy.evaluate((element) => getComputedStyle(element).zIndex)),
    )
    const presentation = await stage.getByTestId('hero-book-fallback').evaluate((element) => ({
      maskImage: getComputedStyle(element).maskImage,
      pointerEvents: getComputedStyle(element).pointerEvents,
      stageOverflow: getComputedStyle(element.parentElement!).overflow,
    }))
    expect(presentation.maskImage).toContain('linear-gradient')
    expect(presentation.pointerEvents).toBe('auto')
    expect(presentation.stageOverflow).toBe('visible')
    expect(await copy.evaluate((element) => getComputedStyle(element, '::before').backgroundImage)).toContain('radial-gradient')
  }
  await expect(hero.getByRole('link', { name: /Browse books/i })).toBeVisible()
  await expect(hero.getByRole('link', { name: /Bestseller charts/i })).toBeVisible()
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Check your email to verify your account', email_preview_url: 'http://localhost:8025' }) })
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
  await expect(page.getByRole('status')).toContainText('marina@example.com')
  await expect(page.getByRole('link', { name: 'Open development inbox' })).toHaveAttribute('href', 'http://localhost:8025')
  const shellBox = await page.getByTestId('auth-shell').boundingBox()
  const headingBox = await page.getByRole('heading', { name: 'Register' }).boundingBox()
  expect(shellBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  expect(headingBox!.y).toBeGreaterThanOrEqual(shellBox!.y)
  expect(requests).toBe(1)
  expect(submittedBody).toEqual({ email: 'marina@example.com', full_name: 'Marina Soler', password: 'longpassword123' })
  expect(submittedBody).not.toHaveProperty('confirmPassword')

  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open development inbox' })).toHaveCount(0)
})

test('auth routes keep account recovery and cross-navigation links', async ({ page }) => {
  await mockGuest(page)
  await page.goto('/sign-in')
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')

  await page.goto('/register')
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
})

test('registration infrastructure errors float without shifting the form', async ({ page }) => {
  await mockGuest(page)
  await page.route('**/api/v1/auth/register', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Request protection is temporarily unavailable' }),
  }))
  await page.goto('/register')
  await page.getByLabel('Your name').fill('Marina Soler')
  await page.getByLabel('Email address').fill('marina@example.com')
  await page.locator('input[name="password"]').fill('longpassword123')
  await page.locator('input[name="confirmPassword"]').fill('longpassword123')
  const headingBefore = await page.getByRole('heading', { name: 'Register' }).boundingBox()

  await page.getByRole('button', { name: 'Create account' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Account not created')
  await expect(alert).toContainText('Request protection is temporarily unavailable')
  await expect(page.getByLabel('Email address')).not.toHaveAttribute('aria-invalid', 'true')
  const headingAfter = await page.getByRole('heading', { name: 'Register' }).boundingBox()
  expect(headingBefore).not.toBeNull()
  expect(headingAfter).not.toBeNull()
  expect(Math.abs(headingAfter!.y - headingBefore!.y)).toBeLessThan(1)

  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(alert).toBeHidden()
})
