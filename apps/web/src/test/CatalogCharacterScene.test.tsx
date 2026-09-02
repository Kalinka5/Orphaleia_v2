import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CatalogCharacterScene } from '../components/CatalogCharacterScene'

describe('catalog character scene', () => {
  it('renders the five characters as one decorative scene image', () => {
    render(<CatalogCharacterScene />)

    const scene = screen.getByTestId('catalog-character-scene')
    expect(scene).toHaveAttribute('aria-hidden', 'true')

    const images = scene.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', '/assets/catalog/winnie-the-pooh-friends-scene-pointing-fixed.png')
    expect(images[0]).toHaveAttribute('alt', '')
  })
})
