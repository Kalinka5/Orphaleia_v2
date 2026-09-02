import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { authorPortraitCredits } from '../authorPortraitCredits'
import type { Author } from '../types'
import s from './AuthorShowcase.module.css'

type AuthorShowcaseProps = {
  authors: Author[]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
}

export function AuthorShowcase({ authors }: AuthorShowcaseProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())
  const columns = [0, 1, 2].map((column) => authors.filter((_, index) => index % 3 === column))

  function markFailed(authorId: string) {
    setFailedImages((current) => {
      const next = new Set(current)
      next.add(authorId)
      return next
    })
  }

  function stateProps(authorId: string) {
    return {
      onMouseEnter: () => setActiveId(authorId),
      onMouseLeave: () => setActiveId(null),
      onFocus: () => setActiveId(authorId),
      onBlur: () => setActiveId(null),
      onPointerDown: () => setActiveId(authorId),
      onPointerCancel: () => setActiveId(null),
    }
  }

  function portrait(author: Author, mobile = false) {
    const failed = failedImages.has(author.id) || !author.image_url
    return <span className={mobile ? s.mobilePortrait : s.portraitFrame}>
      {failed ? <span className={s.fallback} role="img" aria-label={`Portrait unavailable for ${author.name}`}>{initials(author.name)}</span> : <img src={author.image_url!} alt={`Portrait of ${author.name}`} loading="lazy" onError={() => markFailed(author.id)} />}
    </span>
  }

  return <>
    <div className={s.showcase} data-testid="author-showcase">
      <div className={s.mosaic} aria-label="Author portrait gallery">
        {columns.map((column, columnIndex) => <div className={s.portraitColumn} key={columnIndex}>
          {column.map((author) => {
            const active = activeId === author.id
            const dimmed = activeId !== null && !active
            return <Link
              className={s.portraitLink}
              data-active={active || undefined}
              data-dimmed={dimmed || undefined}
              key={author.id}
              to={`/authors/${author.slug}`}
              aria-label={`Open ${author.name} shelf`}
              {...stateProps(author.id)}
            >
              {portrait(author)}
            </Link>
          })}
        </div>)}
      </div>

      <ol className={s.authorList}>
        {authors.map((author, index) => {
          const active = activeId === author.id
          const dimmed = activeId !== null && !active
          return <li className={s.authorItem} key={author.id}>
            <Link
              className={s.authorLink}
              data-active={active || undefined}
              data-dimmed={dimmed || undefined}
              to={`/authors/${author.slug}`}
              {...stateProps(author.id)}
            >
              {portrait(author, true)}
              <span className={s.ordinal} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span className={s.authorCopy}>
                <h2>{author.name}</h2>
                <p>{author.bio}</p>
                <strong>Open shelf <ArrowRight size={14} aria-hidden="true" /></strong>
              </span>
            </Link>
          </li>
        })}
      </ol>
    </div>

    <details className={s.credits}>
      <summary>Portrait credits</summary>
      <div>
        <p className={s.creditNote}>Archival monochrome portraits were color-restored with AI assistance while preserving their original composition. Colors are interpretive.</p>
        {authorPortraitCredits.map((credit) => <p key={credit.slug}>
          <a href={credit.source} target="_blank" rel="noreferrer">{credit.author}</a>
          <span>{credit.creator} · {credit.license}</span>
        </p>)}
      </div>
    </details>
  </>
}
