import { FormEvent, useState } from 'react'
import { CaretDown, CheckCircle, Package, Truck } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, money } from '../api'
import { nextOrderStatus, orderStatusLabel } from '../orderStatus'
import type { Order, OrderStatus } from '../types'
import { FormNotification } from './ui/FormNotification'
import s from '../styles.module.css'

type StatusUpdate = {
  status: OrderStatus
  tracking_carrier?: string
  tracking_reference?: string
  tracking_url?: string | null
}

function actionLabel(status: OrderStatus) {
  const labels: Partial<Record<OrderStatus, string>> = {
    processing: 'Start preparing',
    shipped: 'Prepare shipment',
    out_for_delivery: 'Mark out for delivery',
    delivered: 'Mark delivered',
  }
  return labels[status] ?? orderStatusLabel(status)
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function AdminOrderOperations({ order }: { order: Order }) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState<StatusUpdate | null>(null)
  const [notice, setNotice] = useState('')
  const next = nextOrderStatus(order.status)
  const canCancel = order.status === 'pending_payment'
  const canRefund = ['payment_review', 'paid', 'processing', 'shipped', 'out_for_delivery'].includes(order.status)
  const update = useMutation({
    mutationFn: (payload: StatusUpdate) => api<Order>(`/admin/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      setConfirming(null)
      setNotice('Order status updated and the reader notification has been queued.')
      await client.invalidateQueries({ queryKey: ['admin-orders'] })
    },
  })

  function startAction(status: OrderStatus) {
    if (status === 'delivered' || status === 'cancelled' || status === 'refunded') {
      setConfirming({ status })
      return
    }
    update.mutate({ status })
  }

  function reviewShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setConfirming({
      status: 'shipped',
      tracking_carrier: String(data.get('tracking_carrier') || '').trim(),
      tracking_reference: String(data.get('tracking_reference') || '').trim(),
      tracking_url: String(data.get('tracking_url') || '').trim() || null,
    })
  }

  const history = order.status_history ?? []
  const confirmationMessage = confirming?.status === 'refunded'
    ? 'This records and emails the status only. It does not send money through Stripe or PayPal.'
    : confirming?.status === 'shipped'
      ? `The customer will receive ${confirming.tracking_carrier} tracking details by email.`
      : 'The customer will receive an email about this change.'

  return <article className={s.adminOrder} data-expanded={expanded || undefined}>
    <FormNotification
      title={confirming ? `Confirm “${orderStatusLabel(confirming.status)}”` : update.error ? 'Order not updated' : 'Order updated'}
      message={confirming ? confirmationMessage : update.error?.message || notice}
      variant={confirming ? 'warning' : update.error ? 'error' : 'success'}
      onClose={() => { setConfirming(null); update.reset(); setNotice('') }}
      action={confirming ? <>
        <button className={s.primaryButton} disabled={update.isPending} onClick={() => update.mutate(confirming)}>{update.isPending ? 'Saving…' : 'Confirm update'}</button>
        <button className={s.textButton} disabled={update.isPending} onClick={() => setConfirming(null)}>Keep current status</button>
      </> : undefined}
    />
    <button type="button" className={s.adminOrderSummary} aria-expanded={expanded} aria-controls={`admin-order-${order.id}`} onClick={() => setExpanded(!expanded)}>
      <div><b>{order.number}</b><small>{new Date(order.created_at).toLocaleDateString()}</small></div>
      <span>{money(order.total_cents)}</span>
      <span className={s.adminStatus} data-status={order.status}>{orderStatusLabel(order.status)}</span>
      <span className={s.manageLabel}>Manage <CaretDown size={16} aria-hidden="true" /></span>
    </button>
    {expanded && <div className={s.adminOrderBody} id={`admin-order-${order.id}`}>
      <div className={s.adminOrderHistory}>
        <h3>Status history</h3>
        {history.length ? <ol>{history.map((event) => <li key={`${event.status}-${event.occurred_at}`}><CheckCircle size={17} weight="fill" aria-hidden="true" /><span><b>{orderStatusLabel(event.status)}</b><small>{formatEventDate(event.occurred_at)}</small></span></li>)}</ol> : <p>Earlier updates were recorded before timeline tracking began.</p>}
      </div>
      <div className={s.adminOrderActions}>
        <h3>Next action</h3>
        {order.status === 'payment_review' && <p className={s.adminOrderComplete}>Provider payment requires review before recording the external refund. Reason: {order.payment_review_reason?.replaceAll('_', ' ') || 'unknown'}.</p>}
        {next === 'shipped' ? <form className={s.shipmentForm} onSubmit={reviewShipment}>
          <label>Carrier<input name="tracking_carrier" defaultValue={order.tracking_carrier ?? ''} maxLength={120} placeholder="Correos" required /></label>
          <label>Tracking reference<input name="tracking_reference" defaultValue={order.tracking_reference ?? ''} maxLength={120} placeholder="PQ48 392 761 ES" required /></label>
          <label>Tracking URL <span>(optional)</span><input name="tracking_url" defaultValue={order.tracking_url ?? ''} type="url" inputMode="url" placeholder="https://carrier.example/track/…" /></label>
          <button className={s.secondaryButton} disabled={update.isPending}><Truck size={17} aria-hidden="true" /> Review shipment</button>
        </form> : next ? <button className={s.secondaryButton} disabled={update.isPending} onClick={() => startAction(next)}>{next === 'processing' ? <Package size={17} aria-hidden="true" /> : <CheckCircle size={17} aria-hidden="true" />}{update.isPending ? 'Saving…' : actionLabel(next)}</button> : <p className={s.adminOrderComplete}>No further delivery action is available.</p>}
        <div className={s.exceptionActions}>
          {canCancel && <button type="button" disabled={update.isPending} onClick={() => startAction('cancelled')}>Cancel unpaid order</button>}
          {canRefund && <button type="button" disabled={update.isPending} onClick={() => startAction('refunded')}>Record as refunded</button>}
        </div>
      </div>
    </div>}
  </article>
}
