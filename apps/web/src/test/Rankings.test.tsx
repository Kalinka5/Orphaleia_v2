import { describe, expect, it } from 'vitest'

import { formatSalesUnits, salesBarRatio } from '../rankingUtils'
import { getRankingPreview } from '../rankingPreview'


describe('annual bestseller chart helpers', () => {
  it('formats exact sales units with grouping separators', () => {
    expect(formatSalesUnits(1876543)).toBe('1,876,543')
  })

  it('scales bars against the selected chart leader with a visible minimum', () => {
    expect(salesBarRatio(250, 1000)).toBe(.25)
    expect(salesBarRatio(1, 1000)).toBe(.025)
    expect(salesBarRatio(0, 0)).toBe(0)
  })
})

describe('fictional concept data', () => {
  it('has no provider attribution or catalog links', () => {
    const data = getRankingPreview('', '', '')
    expect(data.items).toHaveLength(8)
    expect(data.source).toBeUndefined()
    expect(data.items.every((item) => !item.catalog_slug && !item.isbn13)).toBe(true)
  })

  it('filters categories and ranks the selected year and market deterministically', () => {
    const data = getRankingPreview('2024', 'spain', 'fantasy')
    expect(data.items.map((item) => item.rank)).toEqual([1, 2])
    expect(data.items.every((item) => item.genre === 'Fantasy')).toBe(true)
    expect(data.items[0].units_sold).toBe(142730)
    expect(getRankingPreview('2025', 'spain', '').items[0].title).toBe('A Map of Quiet Places')
  })
})
