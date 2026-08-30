import { describe, expect, it } from 'vitest'

import { formatSalesUnits, salesBarRatio } from '../rankingUtils'


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
