import { ArrowUpRight } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './cta-with-marquee.module.css'

type MarqueeProps = {
  children: (duplicate: boolean) => ReactNode
  reverse?: boolean
  speed?: number
}

function Marquee({ children, reverse = false, speed = 34 }: MarqueeProps) {
  return <div className={styles.marquee} style={{ '--marquee-duration': `${speed}s` } as CSSProperties}>
    <div className={`${styles.marqueeTrack} ${reverse ? styles.marqueeReverse : ''}`}>{children(false)}</div>
    <div className={`${styles.marqueeTrack} ${reverse ? styles.marqueeReverse : ''}`} aria-hidden="true">{children(true)}</div>
  </div>
}

const firstRow = [
  { slug: 'the-little-prince', src: '/assets/landing/the-little-prince-featured.webp', alt: 'The Little Prince beneath a vast night sky' },
  { slug: 'the-adventures-of-sherlock-holmes', src: '/assets/landing/the-adventures-of-sherlock-holmes-featured.webp', alt: 'Sherlock Holmes in a shadowed London study' },
  { slug: 'the-cartographer-of-ithaca', src: '/assets/landing/the-cartographer-of-ithaca-featured.webp', alt: 'A cartographer studying a map of Ithaca' },
  { slug: 'letters-from-the-wine-dark-sea', src: '/assets/landing/letters-from-the-wine-dark-sea-featured.webp', alt: 'Letters beside the wine-dark sea' },
]

const secondRow = [
  { slug: 'olivewood-astronomy', src: '/assets/landing/olivewood-astronomy-featured.webp', alt: 'An astronomer reading the night sky' },
  { slug: 'twenty-thousand-leagues-under-the-sea', src: '/assets/landing/twenty-thousand-leagues-under-the-sea-featured.webp', alt: 'A submarine voyage beneath the sea' },
  { slug: 'romeo-and-juliet', src: '/assets/landing/romeo-and-juliet-featured.webp', alt: 'Romeo and Juliet in a moonlit garden' },
  { slug: 'a-house-for-the-north-wind', src: '/assets/landing/a-house-for-the-north-wind-featured.webp', alt: 'A house standing against the north wind' },
]

function ArtworkTile({ slug, src, alt, duplicate }: { slug: string; src: string; alt: string; duplicate: boolean }) {
  return <Link className={styles.artworkTile} to={`/books/${slug}`} tabIndex={duplicate ? -1 : undefined}>
    <img src={src} alt={alt} width="640" height="640" loading="lazy" decoding="async" />
  </Link>
}

function BrowseLink() {
  return <Link className={styles.ctaButton} to="/books">
    <span>Browse every book</span>
    <ArrowUpRight size={17} aria-hidden="true" />
  </Link>
}

export function CtaWithMarquee() {
  return <section className={styles.section} aria-labelledby="book-marquee-cta-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>For people who read beyond the final page</p>
        <h2 id="book-marquee-cta-title">Find the book you’ll keep talking about.</h2>
        <div className={styles.supportingCopy}>
          <p>Stories chosen with intent.</p>
          <p>Editions worth keeping.</p>
        </div>
        <BrowseLink />
      </div>

      <div className={styles.marqueeGrid} aria-label="A moving gallery of Orphaleia book artwork">
        <Marquee speed={32} reverse>
          {(duplicate) => firstRow.map((image) => <ArtworkTile key={image.src} {...image} duplicate={duplicate} />)}
        </Marquee>
        <Marquee speed={36}>
          {(duplicate) => secondRow.map((image) => <ArtworkTile key={image.src} {...image} duplicate={duplicate} />)}
        </Marquee>
      </div>
    </div>
  </section>
}
