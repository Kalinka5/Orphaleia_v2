import { ArrowClockwise, Sparkle } from '@phosphor-icons/react'
import styles from './RouteState.module.css'

export type RouteStateProps = {
  title: string
  text?: string
  loading?: boolean
  action?: {
    label: string
    onClick: () => void
  }
  compact?: boolean
}

export function RouteState({ title, text, loading = false, action, compact = false }: RouteStateProps) {
  return <section className={`${styles.state} ${compact ? styles.compact : ''}`} role="status" aria-live="polite" aria-busy={loading || undefined}>
    {loading ? <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span />
    </div> : <Sparkle className={styles.compass} size={36} weight="light" aria-hidden="true" />}
    <h2>{title}</h2>
    {text && <p>{text}</p>}
    {action && <button type="button" className={styles.action} onClick={action.onClick}>
      <ArrowClockwise size={16} aria-hidden="true" /> {action.label}
    </button>}
  </section>
}

export function ErrorState({ error, retry, compact = false }: { error: unknown; retry?: () => void; compact?: boolean }) {
  const message = error instanceof Error ? error.message : 'We could not load this section.'
  return <RouteState
    title="This route is momentarily obscured"
    text={message}
    compact={compact}
    action={retry ? { label: 'Try again', onClick: retry } : undefined}
  />
}
