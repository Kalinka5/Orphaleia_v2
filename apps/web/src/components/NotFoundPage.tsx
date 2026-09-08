import { useEffect, useState } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import s from './NotFoundPage.module.css'

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(reducedMotionQuery).matches
      : false,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(reducedMotionQuery)
    const updatePreference = () => setReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener?.('change', updatePreference)
    return () => mediaQuery.removeEventListener?.('change', updatePreference)
  }, [])

  return reducedMotion
}

export function NotFoundPage() {
  const reducedMotion = usePrefersReducedMotion()
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)

  return (
    <section className={s.page} aria-labelledby="not-found-title">
      <div className={s.copy}>
        <p className={s.eyebrow}>Error 404</p>
        <h1 id="not-found-title">We cannot tell a lie...</h1>
        <p className={s.description}>If we told you this page was here, our nose would grow. Let's return to safety.</p>
        <Link className={s.homeLink} to="/">
          <ArrowLeft size={18} weight="bold" aria-hidden="true" />
          Return home
        </Link>
      </div>

      <figure className={s.scene} role="group" aria-labelledby="not-found-scene-description">
        <div className={s.mediaFrame}>
          <img
            className={s.poster}
            data-testid="not-found-poster"
            src="/assets/not-found/pinocchio-404-poster.webp"
            alt=""
            width="1920"
            height="1080"
            aria-hidden="true"
          />
          {!reducedMotion && !videoFailed && (
            <video
              className={`${s.video} ${videoReady ? s.videoReady : ''}`}
              data-testid="not-found-video"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              poster="/assets/not-found/pinocchio-404-poster.webp"
              aria-hidden="true"
              onCanPlay={() => setVideoReady(true)}
              onError={() => {
                setVideoReady(false)
                setVideoFailed(true)
              }}
            >
              <source src="/assets/not-found/pinocchio-404.webm" type="video/webm" />
              <source src="/assets/not-found/pinocchio-404.mp4" type="video/mp4" />
            </video>
          )}
        </div>
        <figcaption id="not-found-scene-description" className={s.srOnly}>
          A carved wooden storybook puppet holds a sign reading “This page exists” beside oversized 404 numerals. His long wooden nose reaches across the numbers to a cricket holding up a small stop sign.
        </figcaption>
      </figure>
    </section>
  )
}
