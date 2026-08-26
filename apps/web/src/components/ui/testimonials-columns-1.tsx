import type { CSSProperties } from 'react'
import columnStyles from './testimonials-columns-1.module.css'

export type Testimonial = {
  text: string
  image: string
  name: string
  role: string
}

type TestimonialsColumnProps = {
  className?: string
  testimonials: Testimonial[]
  duration?: number
  paused?: boolean
}

export function TestimonialsColumn({ className = '', testimonials, duration = 18, paused = false }: TestimonialsColumnProps) {
  const animationStyle = { '--testimonial-duration': `${duration}s` } as CSSProperties

  return <div className={`${columnStyles.column} ${paused ? columnStyles.paused : ''} ${className}`}>
    <div className={columnStyles.track} style={animationStyle}>
      {[0, 1].map((copyIndex) => <div className={columnStyles.group} key={copyIndex} aria-hidden={copyIndex === 1 ? 'true' : undefined}>
        {testimonials.map(({ text, image, name, role }) => <article className={columnStyles.card} key={`${copyIndex}-${name}`}>
          <p>“{text}”</p>
          <div className={columnStyles.reader}>
            <img width="44" height="44" src={image} alt="" loading="lazy" />
            <div>
              <strong>{name}</strong>
              <span>{role}</span>
            </div>
          </div>
        </article>)}
      </div>)}
    </div>
  </div>
}
