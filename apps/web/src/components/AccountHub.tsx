import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, BookOpenText, Camera, CaretDown, Check, LockKey, MapPin, ShieldCheck, Trash, UserCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiRequestError, api, money } from '../api'
import { addressFields, countryOptions, emptyAddress } from '../address'
import { orderJourney, orderStatusLabel } from '../orderStatus'
import type { Address, Order, User } from '../types'
import { AccountEmptyState } from './AccountEmptyState'
import { ReaderAvatar } from './ReaderAvatar'
import { ErrorState, RouteState as State } from './ui/RouteState'
import { SelectControl } from './ui/SelectControl'
import s from './AccountHub.module.css'

type AccountSection = 'orders' | 'profile' | 'delivery' | 'security'
const sections: Array<{ id: AccountSection; label: string; description: string }> = [
  { id: 'orders', label: 'Orders', description: 'Purchases and delivery progress' },
  { id: 'profile', label: 'Profile', description: 'Public name and reader portrait' },
  { id: 'delivery', label: 'Delivery', description: 'Private default shipping address' },
  { id: 'security', label: 'Security', description: 'Sign-in email and password' },
]

function fieldError(error: unknown, field: string) {
  return error instanceof ApiRequestError ? error.fieldErrors?.[field] : undefined
}

function SectionIcon({ section }: { section: AccountSection }) {
  if (section === 'orders') return <BookOpenText size={21} aria-hidden="true" />
  if (section === 'profile') return <UserCircle size={21} aria-hidden="true" />
  if (section === 'delivery') return <MapPin size={21} aria-hidden="true" />
  return <ShieldCheck size={21} aria-hidden="true" />
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function safeTrackingUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function OrderDetails({ order }: { order: Order }) {
  const history = order.status_history ?? []
  const eventByStatus = new Map(history.map((event) => [event.status, event]))
  const currentJourneyIndex = orderJourney.indexOf(order.status)
  const furthestJourneyIndex = Math.max(currentJourneyIndex, ...history.map((event) => orderJourney.indexOf(event.status)))
  const trackingUrl = safeTrackingUrl(order.tracking_url)
  const isException = order.status === 'cancelled' || order.status === 'refunded'
  const legacyHistory = order.status !== 'pending_payment' && history.length === 0

  return <div className={s.orderDetails} id={`order-details-${order.id}`}>
    {isException && <div className={s.orderException} role="status">
      <b>{orderStatusLabel(order.status)}</b>
      <p>{order.status === 'cancelled' ? 'This unpaid order will not be prepared or dispatched.' : 'This order is recorded as refunded. Contact the shop if you need payment details.'}</p>
    </div>}
    <ol className={s.timeline} aria-label={`Delivery progress for ${order.number}`}>
      {orderJourney.map((status, index) => {
        const event = eventByStatus.get(status)
        const state = isException
          ? index <= furthestJourneyIndex ? 'complete' : 'future'
          : index < furthestJourneyIndex ? 'complete' : index === currentJourneyIndex ? 'current' : 'future'
        return <li key={status} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
          <span className={s.timelineMark} aria-hidden="true">{state === 'complete' ? <Check size={14} weight="bold" /> : index + 1}</span>
          <div><b>{orderStatusLabel(status)}</b><small>{event ? eventDate(event.occurred_at) : legacyHistory && state !== 'future' ? 'Recorded before timeline tracking began' : 'Pending'}</small></div>
        </li>
      })}
    </ol>
    {legacyHistory && <p className={s.legacyNote}>Earlier updates were recorded before timeline tracking began.</p>}
    <div className={s.orderMeta}>
      <section aria-labelledby={`items-${order.id}`}><h4 id={`items-${order.id}`}>In this order</h4><ul>{order.items.map((item) => <li key={item.book_id}><span>{item.title}</span><small>{item.quantity} × {money(item.unit_price_cents)}</small></li>)}</ul></section>
      <section aria-labelledby={`delivery-${order.id}`}><h4 id={`delivery-${order.id}`}>Delivery address</h4><address>{order.shipping.name}<br />{order.shipping.line1}{order.shipping.line2 && <><br />{order.shipping.line2}</>}<br />{order.shipping.postal_code} {order.shipping.city}<br />{order.shipping.country}</address></section>
      {(order.tracking_carrier || order.tracking_reference) && <section aria-labelledby={`tracking-${order.id}`}><h4 id={`tracking-${order.id}`}>Parcel tracking</h4><p>{order.tracking_carrier && <strong>{order.tracking_carrier}</strong>}<span>{order.tracking_reference}</span></p>{trackingUrl && <a href={trackingUrl} target="_blank" rel="noreferrer">Track with carrier <ArrowSquareOut size={15} aria-hidden="true" /></a>}</section>}
    </div>
  </div>
}

export function AccountHub({ user, refresh }: { user: User; refresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams()
  const requestedSection = params.get('section')
  const requestedOrder = params.get('order')
  const section: AccountSection = requestedSection === 'profile' || requestedSection === 'delivery' || requestedSection === 'security' ? requestedSection : 'orders'
  const client = useQueryClient()
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => api<{ items: Order[] }>('/orders'), enabled: section === 'orders' })
  const [expandedOrder, setExpandedOrder] = useState<string | null>(() => requestedOrder)
  const [profileNotice, setProfileNotice] = useState('')
  const [profileError, setProfileError] = useState<unknown>(null)
  const [profileBusy, setProfileBusy] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [deliveryAddress, setDeliveryAddress] = useState<Address>(() => user.default_shipping_address ?? emptyAddress(user.full_name))
  const [hasSavedDeliveryAddress, setHasSavedDeliveryAddress] = useState(Boolean(user.default_shipping_address))
  const [deliveryNotice, setDeliveryNotice] = useState('')
  const [deliveryError, setDeliveryError] = useState<unknown>(null)
  const [deliveryBusy, setDeliveryBusy] = useState(false)
  const [emailNotice, setEmailNotice] = useState('')
  const [emailError, setEmailError] = useState<unknown>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState('')
  const [passwordError, setPasswordError] = useState<unknown>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile])

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])
  useEffect(() => { setExpandedOrder(requestedOrder) }, [requestedOrder])

  function toggleOrder(orderId: string) {
    const nextOrder = expandedOrder === orderId ? null : orderId
    const nextParams = new URLSearchParams(params)
    if (nextOrder) nextParams.set('order', nextOrder)
    else nextParams.delete('order')
    setExpandedOrder(nextOrder)
    setParams(nextParams, { replace: true })
  }

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

  async function saveDeliveryAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDeliveryBusy(true); setDeliveryNotice(''); setDeliveryError(null)
    try {
      const nextUser = await api<User>('/users/me/delivery-address', { method: 'PUT', body: JSON.stringify(deliveryAddress) })
      rememberUser(nextUser)
      setDeliveryAddress(nextUser.default_shipping_address ?? emptyAddress(nextUser.full_name))
      setHasSavedDeliveryAddress(true)
      setDeliveryNotice('Default delivery address saved.')
    } catch (error) { setDeliveryError(error) } finally { setDeliveryBusy(false) }
  }

  async function removeDeliveryAddress() {
    setDeliveryBusy(true); setDeliveryNotice(''); setDeliveryError(null)
    try {
      const nextUser = await api<User>('/users/me/delivery-address', { method: 'DELETE' })
      rememberUser(nextUser)
      setDeliveryAddress(emptyAddress(nextUser.full_name))
      setHasSavedDeliveryAddress(false)
      setDeliveryNotice('Default delivery address removed.')
    } catch (error) { setDeliveryError(error) } finally { setDeliveryBusy(false) }
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
      <div className={s.greeting}><span className={s.kicker}>Reader’s account</span><h1 id="account-title">Welcome, {user.full_name.split(' ')[0]}</h1><p>{user.email}<span aria-hidden="true"> · </span>{user.is_verified ? 'Verified reader' : 'Email verification pending'}</p></div>
      <figure className={s.dorian}>
        <img src="/assets/account/dorian-gray-account-header-v3.png" alt="Dorian Gray leans against the page and presents a golden frame containing his frightening, corrupted portrait." width="1024" height="1536" decoding="async" />
      </figure>
    </header>
    <div className={s.folio}>
      <nav className={s.navigation} aria-label="Account sections">
        {sections.map((item) => <Link key={item.id} to={`/account?section=${item.id}`} aria-current={section === item.id ? 'page' : undefined}>
          <SectionIcon section={item.id} /><span><b>{item.label}</b><small>{item.description}</small></span>
        </Link>)}
      </nav>
      <div className={s.content}>
        {section === 'orders' && <section aria-labelledby="orders-title"><div className={s.sectionHeading}><span>Order history</span><h2 id="orders-title">Books on their way and on your shelf</h2><p>Open an order to follow each step from confirmation to your door.</p></div>{orders.isLoading ? <State title="Loading your orders…" loading /> : orders.error ? <ErrorState error={orders.error} retry={() => void orders.refetch()} /> : orders.data?.items.length ? <div className={s.orders}>{orders.data.items.map((order) => {
          const expanded = expandedOrder === order.id
          return <article key={order.id} data-expanded={expanded || undefined}>
            <button type="button" className={s.orderSummary} aria-expanded={expanded} aria-controls={`order-details-${order.id}`} onClick={() => toggleOrder(order.id)}>
              <div><small>{new Date(order.created_at).toLocaleDateString()}</small><h3>{order.number}</h3><p>{order.items.map((item) => item.title).join(', ')}</p></div>
              <span className={s.status} data-status={order.status}>{orderStatusLabel(order.status)}</span>
              <b>{money(order.total_cents)}</b><CaretDown className={s.orderCaret} size={18} aria-hidden="true" />
            </button>
            {expanded && <OrderDetails order={order} />}
          </article>
        })}</div> : <AccountEmptyState />}</section>}
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
        {section === 'delivery' && <section aria-labelledby="delivery-title"><div className={s.sectionHeading}><span>Private delivery details</span><h2 id="delivery-title">Where your books usually find you</h2><p>Save one default address to prefill checkout. You can still change it for any individual order.</p></div>
          <form className={`${s.form} ${s.deliveryForm}`} onSubmit={(event) => void saveDeliveryAddress(event)} aria-busy={deliveryBusy || undefined}>
            {addressFields.map(({ key, label, required, autoComplete }) => <label key={key} htmlFor={`delivery-${key}`}>{label}<input id={`delivery-${key}`} value={deliveryAddress[key]} required={required} autoComplete={autoComplete} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, [key]: event.target.value })} aria-invalid={Boolean(fieldError(deliveryError, key)) || undefined} />{fieldError(deliveryError, key) && <span className={s.fieldError}>{fieldError(deliveryError, key)}</span>}</label>)}
            <SelectControl label="Country" labelMode="stacked" value={deliveryAddress.country} options={countryOptions} onChange={(country) => setDeliveryAddress({ ...deliveryAddress, country })} />
            <div className={s.deliveryActions}><button className={s.primaryButton} disabled={deliveryBusy}>{deliveryBusy ? 'Saving…' : 'Save delivery address'}</button>{hasSavedDeliveryAddress && <button className={s.textButton} type="button" disabled={deliveryBusy} onClick={() => void removeDeliveryAddress()}><Trash size={16} aria-hidden="true" /> Remove saved address</button>}</div>
          </form>
          {deliveryNotice && <p className={s.notice} role="status" aria-live="polite">{deliveryNotice}</p>}{deliveryError ? <p className={s.error} role="alert">{(deliveryError as Error).message}</p> : null}
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
