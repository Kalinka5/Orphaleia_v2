export const formatSalesUnits = (value: number) => new Intl.NumberFormat('en-IE').format(value)

export const salesBarRatio = (value: number, maximum: number) => maximum > 0 ? Math.max(.025, value / maximum) : 0
