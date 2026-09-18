import { useEffect } from 'react'

const SITE_ORIGIN = 'https://orphaleia.com'

type PageMetaProps = {
  title: string
  description: string
  canonicalPath?: string | null
  noIndex?: boolean
}

export function PageMeta({ title, description, canonicalPath, noIndex = false }: PageMetaProps) {
  useEffect(() => {
    document.title = `${title} · Orphaleia`
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.append(meta)
    }
    meta.content = description
  }, [description, title])

  useEffect(() => {
    if (canonicalPath === undefined) return

    const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (canonicalPath === null) {
      existing?.remove()
      return
    }

    const canonical = existing ?? document.createElement('link')
    canonical.rel = 'canonical'
    canonical.href = new URL(canonicalPath, SITE_ORIGIN).href
    if (!existing) document.head.append(canonical)
  }, [canonicalPath])

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!noIndex) {
      existing?.remove()
      return
    }
    const robots = existing ?? document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    if (!existing) document.head.append(robots)
    return () => robots.remove()
  }, [noIndex])

  return null
}
