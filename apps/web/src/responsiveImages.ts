const localCoverPattern = /^(\/covers\/.+)\.webp$/

export function responsiveCoverProps(src: string, sizes: string) {
  const match = src.match(localCoverPattern)
  if (!match) return {}

  return {
    srcSet: `${match[1]}-320w.webp 320w, ${match[1]}-640w.webp 640w, ${src} 1024w`,
    sizes,
  }
}

export function coverTextureSrc(src: string) {
  const match = src.match(localCoverPattern)
  return match ? `${match[1]}-640w.webp` : src
}
