import { ArrowRight } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import s from './BookOracle.module.css'

export function BookOracleInvitation() {
  return <section className={s.invitation} aria-labelledby="oracle-invitation-title">
    <div className={s.invitationCopy}>
      <p className={s.eyebrow}>A little literary magic</p>
      <h2 id="oracle-invitation-title">Your book.<br />My little secret.</h2>
      <p>Think of a book. The oracle will ask the questions.<br />Can you keep her guessing?</p>
      <Link to="/book-oracle" className={s.primary}>Meet the Book Oracle <ArrowRight size={18} aria-hidden="true" /></Link>
    </div>
    <div className={s.invitationArt} aria-hidden="true"><img src="/assets/book-oracle/welcoming.webp" alt="" width="900" height="900" loading="lazy" decoding="async" /></div>
  </section>
}
