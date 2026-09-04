import { useState, type MouseEvent } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { getGenreCover } from '../genreCovers'
import type { Genre } from '../types'
import s from './GenreDirectory.module.css'

type GenreDirectoryProps = {
  genres: Genre[]
}

function usesTouchPreview() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none), (pointer: coarse)').matches
}

export function GenreDirectory({ genres }: GenreDirectoryProps) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())

  function markImageFailed(slug: string) {
    setFailedImages((current) => {
      const next = new Set(current)
      next.add(slug)
      return next
    })
  }

  function previewBeforeOpening(event: MouseEvent<HTMLAnchorElement>, slug: string, hasImage: boolean) {
    if (!hasImage || event.detail === 0 || !usesTouchPreview() || activeSlug === slug) return
    event.preventDefault()
    setActiveSlug(slug)
  }

  return <ol className={s.list} aria-label="Genre collections" data-testid="genre-directory">
    {genres.map((genre, index) => {
      const cover = getGenreCover(genre)
      const hasImage = Boolean(cover) && !failedImages.has(genre.slug)
      const active = hasImage && activeSlug === genre.slug

      return <li className={s.item} key={genre.id}>
        <Link
          className={`${s.row} ${hasImage ? s.hasImage : s.textOnly}`}
          data-active={active || undefined}
          aria-expanded={active || undefined}
          to={`/genres/${genre.slug}`}
          onClick={(event) => previewBeforeOpening(event, genre.slug, hasImage)}
        >
          {hasImage && cover && <span className={s.art}>
            <img
              src={cover.src}
              alt={cover.alt}
              data-genre={genre.slug}
              loading="lazy"
              onError={() => markImageFailed(genre.slug)}
            />
            <span className={s.scrim} aria-hidden="true" />
          </span>}

          <span className={s.content}>
            <span className={s.ordinal} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className={s.copy}>
              <span className={s.title}>{genre.name}</span>
              <span className={s.description}>{genre.description}</span>
              <span className={s.action}>
                <span className={s.openLabel}>Open shelf</span>
                <span className={s.touchLabel}>Tap again to open shelf</span>
              </span>
            </span>
            <span className={s.arrow} aria-hidden="true"><ArrowRight size={22} /></span>
          </span>
        </Link>
      </li>
    })}
  </ol>
}
