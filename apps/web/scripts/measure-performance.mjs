import { chromium } from '@playwright/test'

const baseURL = process.env.PERF_BASE_URL || 'http://127.0.0.1:4173'
const samples = 5
const targets = { lcp: 2500, cls: 0.1, inp: 200 }
const routes = [
  {
    name: 'Home',
    path: '/',
    interact: async (page) => {
      const pause = page.getByRole('button', { name: /Pause reader notes/i })
      await pause.scrollIntoViewIfNeeded()
      await pause.click()
    },
  },
  {
    name: 'Catalog',
    path: '/books',
    interact: async (page) => {
      const genre = page.getByRole('combobox', { name: 'Genre' })
      await genre.click()
      await genre.press('Escape')
    },
  },
]
const observedPages = new WeakSet()

const installObservers = () => {
  window.__orphaleiaVitals = { lcp: 0, cls: 0, inp: 0 }
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const latest = entries.at(-1)
      if (latest) window.__orphaleiaVitals.lcp = latest.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__orphaleiaVitals.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.interactionId) window.__orphaleiaVitals.inp = Math.max(window.__orphaleiaVitals.inp, entry.duration)
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
  } catch {}
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function summarize(runs) {
  return Object.fromEntries(Object.keys(targets).map((metric) => {
    const values = runs.map((run) => run[metric])
    return [metric, { median: Number(median(values).toFixed(2)), worst: Number(Math.max(...values).toFixed(2)) }]
  }))
}

async function measurePage(page, route) {
  if (!observedPages.has(page)) {
    await page.addInitScript(installObservers)
    observedPages.add(page)
  }
  await page.goto(`${baseURL}${route.path}`, { waitUntil: 'domcontentloaded' })
  await page.locator('main h1').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  await route.interact(page)
  await page.waitForTimeout(350)
  return page.evaluate(() => window.__orphaleiaVitals)
}

const browser = await chromium.launch()
const report = {}
let failed = false

try {
  for (const route of routes) {
    const cold = []
    for (let index = 0; index < samples; index += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      cold.push(await measurePage(await context.newPage(), route))
      await context.close()
    }

    const warm = []
    const warmContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const warmPage = await warmContext.newPage()
    await measurePage(warmPage, route)
    for (let index = 0; index < samples; index += 1) warm.push(await measurePage(warmPage, route))
    await warmContext.close()

    report[route.name] = { cold: summarize(cold), warm: summarize(warm) }
    for (const mode of ['cold', 'warm']) {
      for (const [metric, target] of Object.entries(targets)) {
        if (report[route.name][mode][metric].median > target) failed = true
      }
    }
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({ samples, targets, routes: report }, null, 2))
if (failed) process.exitCode = 1
