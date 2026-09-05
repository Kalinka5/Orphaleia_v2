import { ArrowRight, CheckCircle, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import s from './VerificationPassage.module.css'

type VerificationPassageProps = {
  busy: boolean
  message: string
  error: string
}

export function VerificationPassage({ busy, message, error }: VerificationPassageProps) {
  const state = busy ? 'checking' : message ? 'success' : 'failed'
  const success = state === 'success'

  return <section className={`${s.page} ${success ? s.success : state === 'failed' ? s.failed : s.checking}`} aria-labelledby="verification-title">
    <div className={s.copy}>
      <span className={s.eyebrow}>{busy ? 'CHECKING YOUR PASSAGE' : success ? 'PASSAGE GRANTED' : 'PASSAGE CLOSED'}</span>
      <h1 id="verification-title">{busy ? 'Verifying your email' : success ? 'Welcome, fellow reader' : 'We could not verify this link'}</h1>
      {busy ? <div className={s.loading} role="status" aria-live="polite">
        <SpinnerGap size={22} aria-hidden="true" />
        <span>Checking your invitation…</span>
      </div> : <div className={s.result} role={success ? 'status' : 'alert'} aria-live={success ? 'polite' : 'assertive'}>
        <span className={s.resultIcon}>{success ? <CheckCircle size={26} weight="fill" aria-hidden="true" /> : <WarningCircle size={26} weight="fill" aria-hidden="true" />}</span>
        <div>
          <strong>{success ? 'Your place is ready' : 'The gateway is still guarded'}</strong>
          <p>{success ? message : error}</p>
        </div>
      </div>}
      {!busy && <Link className={s.action} to="/sign-in">
        {success ? 'Continue to sign in' : 'Return to sign in'} <ArrowRight size={17} aria-hidden="true" />
      </Link>}
    </div>

    {!busy && <figure className={s.artwork} data-testid={`verification-${state}-artwork`}>
      <img
        src={success ? '/assets/verification/four-musketeers-welcome.png' : '/assets/verification/four-musketeers-guard.png'}
        alt={success
          ? 'd’Artagnan bows with his hat as Athos, Porthos, and Aramis welcome the reader through a glowing library archway.'
          : 'd’Artagnan, Athos, Porthos, and Aramis stand guard before a closed library gateway.'}
        width={success ? 1635 : 1570}
        height={success ? 962 : 1002}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </figure>}
  </section>
}
