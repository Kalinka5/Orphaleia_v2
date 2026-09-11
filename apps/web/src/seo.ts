const INDEXABLE_ROUTES = new Set([
  '/',
  '/books',
  '/genres',
  '/authors',
  '/rankings',
  '/privacy',
  '/terms',
])

function paginationSuffix(search: string) {
  const params = new URLSearchParams(search)
  let hasContentVariant = false
  params.forEach((value, key) => {
    const isTrackingParameter = key.startsWith('utm_') || key === 'gclid' || key === 'fbclid'
    const isDefaultSort = key === 'sort' && value === 'title'
    if (key !== 'page' && !isTrackingParameter && !isDefaultSort) hasContentVariant = true
  })
  if (hasContentVariant) return ''

  const page = params.get('page')
  return page && page !== '1' && /^[1-9]\d*$/.test(page) ? `?page=${page}` : ''
}

export function getCanonicalPath(pathname: string, search = ''): string | null {
  if (pathname === '/all-books') return `/books${paginationSuffix(search)}`
  if (pathname === '/books') return `${pathname}${paginationSuffix(search)}`
  if (INDEXABLE_ROUTES.has(pathname)) return pathname
  if (/^\/(books|genres|authors)\/[^/]+$/.test(pathname)) return pathname
  return null
}
