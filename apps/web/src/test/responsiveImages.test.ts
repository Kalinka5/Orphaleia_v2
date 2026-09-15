import { describe, expect, it } from 'vitest'
import { coverTextureSrc, responsiveCoverProps } from '../responsiveImages'

describe('responsive local covers', () => {
  it('uses generated variants for bundled covers', () => {
    expect(responsiveCoverProps('/covers/the-little-prince.webp', '50vw')).toEqual({
      srcSet: '/covers/the-little-prince-320w.webp 320w, /covers/the-little-prince-640w.webp 640w, /covers/the-little-prince.webp 1024w',
      sizes: '50vw',
    })
    expect(coverTextureSrc('/covers/the-little-prince.webp')).toBe('/covers/the-little-prince-640w.webp')
  })

  it('leaves uploaded and external covers untouched', () => {
    expect(responsiveCoverProps('/media/covers/custom.webp', '50vw')).toEqual({})
    expect(coverTextureSrc('https://images.example/cover.webp')).toBe('https://images.example/cover.webp')
  })
})
