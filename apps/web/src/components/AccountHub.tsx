import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BookOpenText, Camera, LockKey, ShieldCheck, Trash, UserCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiRequestError, api, money } from '../api'
import type { Order, User } from '../types'
import { AccountEmptyState } from './AccountEmptyState'
import { ReaderAvatar } from './ReaderAvatar'
import { ErrorState, RouteState as State } from './ui/RouteState'
import s from './AccountHub.module.css'

type AccountSection = 'orders' | 'profile' | 'security'
const sections: Array<{ id: AccountSection; label: string; description: string }> = [
  { id: 'orders', label: 'Orders', description: 'Purchases and delivery progress' },
  { id: 'profile', label: 'Profile', description: 'Public name and reader portrait' },
  { id: 'security', label: 'Security', description: 'Sign-in email and password' },
]

function fieldError(error: unknown, field: string) {
  return error instanceof ApiRequestError ? error.fieldErrors?.[field] : undefined
}

function SectionIcon({ section }: { section: AccountSection }) {
  if (section === 'orders') return <BookOpenText size={21} aria-hidden="true" />
  if (section === 'profile') return <UserCircle size={21} aria-hidden="true" />
  return <ShieldCheck size={21} aria-hidden="true" />
}

export function AccountHub({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const [params] = useSearchParams()
  const requestedSection = params.get('section')
  const section: AccountSection = requestedSection === 'profile' || requestedSection === 'security' ? requestedSection : 'orders'
  const client = useQueryClient()
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<{ items: Order[] }>('/orders'), enabled: section === 'orders' })
  const [profileNotice, setProfileNotice] = useState('')
  const [profileError, setProfileError] = useState<unknown>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [emailNotice, setEmailNotice] = useState('')
  const [emailError, setEmailError] = useState<unknown>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState('')
  const [passwordError, setPasswordError] = useState<unknown>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile])

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

  function rememberUser(nextUser: User) {
    client.setQueryData(['me'], nextUser)
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setProfileBusy(true); setProfileNotice(''); setProfileError(null)
    try {
      const nextUser = await api<User>('/users/me/profile', { method: 'PATCH', body: JSON.stringify({ full_name: data.get('full_name') }) })
      rememberUser(nextUser)
      setProfileNotice('Display name saved.')
    } catch (error) { setProfileError(error) } finally { setProfileBusy(false) }
  }

  async function saveAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!avatarFile) { setProfileError(new Error('Choose an image before saving.')); return }
    if (avatarFile.size > 5 * 1024 * 1024) { setProfileError(new Error('Choose an image smaller than 5 MB.')); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type)) { setProfileError(new Error('Choose a JPEG, PNG, or WebP image.')); return }
    const payload = new FormData(); payload.set('file', avatarFile)
    setProfileBusy(true); setProfileNotice(''); setProfileError(null)
    try {
      const nextUser = await api<User>('/users/me/avatar', { method: 'PUT', body: payload })
      rememberUser(nextUser)
      setAvatarFile(null)
      form.reset()
      setProfileNotice('Reader portrait updated.')
    } catch (error) { setProfileError(error) } finally { setProfileBusy(false) }
  }

  async function removeAvatar() {
    setProfileBusy(true); setProfileNotice(''); setProfileError(null)
    try {
      const nextUser = await api<User>('/users/me/avatar', { method: 'DELETE' })
      rememberUser(nextUser)
      setAvatarFile(null)
      setProfileNotice('Reader portrait removed. Your initials will be shown instead.')
    } catch (error) { setProfileError(error) } finally { setProfileBusy(false) }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setEmailBusy(true); setEmailNotice(''); setEmailError(null)
    try {
      const result = await api<{ message: string }>('/users/me/email-change', { method: 'POST', body: JSON.stringify({ email: data.get('email'), current_password: data.get('current_password') }) })
      form.reset()
      await refresh()
      setEmailNotice(`${result.message}.`)
    } catch (error) { setEmailError(error) } finally { setEmailBusy(false) }
  }

  async function cancelEmailChange() {
    setEmailBusy(true); setEmailNotice(''); setEmailError(null)
    try {
      const nextUser = await api<User>('/users/me/email-change', { method: 'DELETE' })
      rememberUser(nextUser)
      setEmailNotice('Pending email change cancelled.')
    } catch (error) { setEmailError(error) } finally { setEmailBusy(false) }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (data.get('new_password') !== data.get('confirm_password')) { setPasswordError(new Error('New passwords do not match.')); setPasswordNotice(''); return }
    setPasswordBusy(true); setPasswordNotice(''); setPasswordError(null)
    try {
      const result = await api<{ message: string }>('/users/me/password', { method: 'POST', body: JSON.stringify({ current_password: data.get('current_password'), new_password: data.get('new_password') }) })
      form.reset()
      setPasswordNotice(result.message)
    } catch (error) { setPasswordError(error) } finally { setPasswordBusy(false) }
  }

  return <section className={s.page} aria-labelledby="account-title">
    <header className={s.header}>
      <ReaderAvatar name={user.full_name} src={user.avatar_url} size="account" />
      <div><span className={s.kicker}>Reader’s account</span><h1 id="account-title">Welcome, {user.full_name.split(' ')[0]}</h1><p>{user.email}<span aria-hidden="true"> · </span>{user.is_verified ? 'Verified reader' : 'Email verification pending'}</p></div>
    </header>
    <div className={s.folio}>
      <nav className={s.navigation} aria-label="Account sections">
        {sections.map((item) => <Link key={item.id} to={`/account?section=${item.id}`} aria-current={section === item.id ? 'page' : undefined}>
          <SectionIcon section={item.id} /><span><b>{item.label}</b><small>{item.description}</small></span>
        </Link>)}
      </nav>
      <div className={s.content}>
        {section === 'orders' && <section aria-labelledby="orders-title"><div className={s.sectionHeading}><span>Order history</span><h2 id="orders-title">Books on their way and on your shelf</h2></div>{orders.isLoading ? <State title="Loading your orders…" loading /> : orders.error ? <ErrorState error={orders.error} retry={() => void orders.refetch()} /> : orders.data?.items.length ? <div className={s.orders}>{orders.data.items.map((order) => <article key={order.id}><div><small>{new Date(order.created_at).toLocaleDateString()}</small><h3>{order.number}</h3><p>{order.items.map((item) => item.title).join(', ')}</p></div><span className={s.status}>{order.status.replace('_', ' ')}</span><b>{money(order.total_cents)}</b></article>)}</div> : <AccountEmptyState />}</section>}
        {section === 'profile' && <section aria-labelledby="profile-title"><div className={s.sectionHeading}><span>Public profile</span><h2 id="profile-title">How fellow readers see you</h2><p>Your name and portrait appear beside every comment you leave, including past comments.</p></div>
          <div className={s.profileGrid}>
            <form className={s.avatarForm} onSubmit={(event) => void saveAvatar(event)} aria-busy={profileBusy || undefined}>
              <ReaderAvatar name={user.full_name} src={avatarPreview || user.avatar_url} size="account" />
              <div><h3>Reader portrait</h3><p>JPEG, PNG, or WebP. Up to 5 MB. Images are cropped to a square.</p><label className={s.fileButton}><Camera size={18} aria-hidden="true" /> Choose image<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /></label>{avatarFile && <small>{avatarFile.name}</small>}</div>
              <div className={s.buttonRow}><button className={s.primaryButton} disabled={profileBusy || !avatarFile}>{profileBusy ? 'Saving…' : 'Save portrait'}</button>{user.avatar_url && <button className={s.textButton} type="button" disabled={profileBusy} onClick={() => void removeAvatar()}><Trash size={16} aria-hidden="true" /> Remove</button>}</div>
            </form>
            <form className={s.form} onSubmit={(event) => void saveDisplayName(event)} aria-busy={profileBusy || undefined}>
              <h3>Display name</h3><p>This is public and does not need to be unique.</p>
              <label htmlFor="account-display-name">Display name<input id="account-display-name" name="full_name" defaultValue={user.full_name} minLength={2} maxLength={120} autoComplete="name" required aria-invalid={Boolean(fieldError(profileError, 'full_name')) || undefined} /></label>
              {fieldError(profileError, 'full_name') && <p className={s.fieldError}>{fieldError(profileError, 'full_name')}</p>}
              <button className={s.primaryButton} disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save display name'}</button>
            </form>
          </div>
          {profileNotice && <p className={s.notice} role="status" aria-live="polite">{profileNotice}</p>}{profileError ? <p className={s.error} role="alert">{(profileError as Error).message}</p> : null}
        </section>}
        {section === 'security' && <section aria-labelledby="security-title"><div className={s.sectionHeading}><span>Account security</span><h2 id="security-title">Your sign-in details</h2><p>Sensitive changes ask for your current password and notify you by email.</p></div>
          <div className={s.securityStack}>
            <form className={s.form} onSubmit={(event) => void requestEmailChange(event)} aria-busy={emailBusy || undefined}>
              <div className={s.formTitle}><ShieldCheck size={24} aria-hidden="true" /><div><h3>Sign-in email</h3><p>Current address: <strong>{user.email}</strong></p></div></div>
              {user.pending_email && <div className={s.pending}><div><b>Waiting for confirmation</b><span>{user.pending_email}</span></div><button type="button" className={s.textButton} disabled={emailBusy} onClick={() => void cancelEmailChange()}>Cancel request</button></div>}
              <label htmlFor="new-email">New email address<input id="new-email" name="email" type="email" defaultValue={user.pending_email || ''} autoComplete="email" required aria-invalid={Boolean(fieldError(emailError, 'email')) || undefined} /></label>
              <label htmlFor="email-current-password">Current password<input id="email-current-password" name="current_password" type="password" autoComplete="current-password" required /></label>
              <button className={s.primaryButton} disabled={emailBusy}>{emailBusy ? 'Sending…' : user.pending_email ? 'Resend confirmation' : 'Send confirmation'}</button>
              {emailNotice && <p className={s.notice} role="status" aria-live="polite">{emailNotice}</p>}{emailError ? <p className={s.error} role="alert">{(emailError as Error).message}</p> : null}
            </form>
            <form className={s.form} onSubmit={(event) => void changePassword(event)} aria-busy={passwordBusy || undefined}>
              <div className={s.formTitle}><LockKey size={24} aria-hidden="true" /><div><h3>Change password</h3><p>Other signed-in devices will be logged out.</p></div></div>
              <label htmlFor="password-current">Current password<input id="password-current" name="current_password" type="password" autoComplete="current-password" required /></label>
              <label htmlFor="password-new">New password<input id="password-new" name="new_password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required aria-describedby="password-help" /></label><small id="password-help">Use at least 10 characters.</small>
              <label htmlFor="password-confirm">Confirm new password<input id="password-confirm" name="confirm_password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required /></label>
              <button className={s.primaryButton} disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button>
              {passwordNotice && <p className={s.notice} role="status" aria-live="polite">{passwordNotice}</p>}{passwordError ? <p className={s.error} role="alert">{(passwordError as Error).message}</p> : null}
            </form>
          </div>
        </section>}
      </div>
    </div>
  </section>
}
