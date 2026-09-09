export type VideoDetails = {
  provider: 'YouTube' | 'Vimeo'
  embedUrl: string
}

export function getExternalVideoDetails(value: string): VideoDetails | null {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return id ? { provider: 'YouTube', embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null
    }
    if (host === 'youtube.com') {
      const id = url.searchParams.get('v') || (url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : '')
      return id ? { provider: 'YouTube', embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null
    }
    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).pop()
      return id && /^\d+$/.test(id) ? { provider: 'Vimeo', embedUrl: `https://player.vimeo.com/video/${id}` } : null
    }
  } catch {
    return null
  }
  return null
}
