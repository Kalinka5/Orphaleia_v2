import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react'
import s from './FormNotification.module.css'

export type NotificationVariant = 'error' | 'warning' | 'success' | 'info'

type FormNotificationProps = {
  message: string
  title: string
  variant?: NotificationVariant
  onClose: () => void
  action?: ReactNode
}

function NotificationIcon({ variant }: { variant: NotificationVariant }) {
  if (variant === 'success') return <CheckCircle size={23} weight="fill" aria-hidden="true" />
  if (variant === 'warning') return <Warning size={23} weight="fill" aria-hidden="true" />
  if (variant === 'info') return <Info size={23} weight="fill" aria-hidden="true" />
  return <WarningCircle size={23} weight="fill" aria-hidden="true" />
}

export function FormNotification({ message, title, variant = 'info', onClose, action }: FormNotificationProps) {
  const titleId = useId()
  const messageId = useId()
  const notificationRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const hasAction = Boolean(action)

  useEffect(() => {
    if (!message || !hasAction) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    notificationRef.current?.focus()
    return () => previousFocusRef.current?.focus()
  }, [hasAction, message])

  if (!message || typeof document === 'undefined') return null

  const assertive = variant === 'error' || variant === 'warning'
  return createPortal(
    <div className={s.viewport}>
      <aside
        ref={notificationRef}
        className={s.notification}
        data-variant={variant}
        role={hasAction ? 'alertdialog' : assertive ? 'alert' : 'status'}
        aria-live={hasAction ? undefined : assertive ? 'assertive' : 'polite'}
        aria-atomic="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={hasAction ? -1 : undefined}
        onKeyDown={(event) => { if (hasAction && event.key === 'Escape') onClose() }}
      >
        <span className={s.icon}><NotificationIcon variant={variant} /></span>
        <div className={s.content}>
          <h2 id={titleId}>{title}</h2>
          <p id={messageId}>{message}</p>
          {action && <div className={s.action}>{action}</div>}
        </div>
        <button className={s.close} type="button" onClick={onClose} aria-label="Dismiss notification">
          <X size={18} aria-hidden="true" />
        </button>
      </aside>
    </div>,
    document.body,
  )
}
