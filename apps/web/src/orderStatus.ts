import type { OrderStatus } from './types'

export const orderJourney: OrderStatus[] = ['paid', 'processing', 'shipped', 'out_for_delivery', 'delivered']

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  payment_review: 'Payment review',
  paid: 'Confirmed',
  processing: 'Preparing',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'processing',
  processing: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
}

export function orderStatusLabel(status: OrderStatus) {
  return orderStatusLabels[status]
}

export function nextOrderStatus(status: OrderStatus) {
  return nextStatus[status]
}
