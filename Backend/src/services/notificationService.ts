import webpush from 'web-push'
import prisma from '../db/index'

// Push is a nice-to-have, not a hard dependency. This used to run with `!`
// assertions at module load, so a missing VAPID var took the whole API down
// at boot instead of just disabling notifications.
const VAPID_EMAIL = process.env.VAPID_EMAIL
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

let pushEnabled = false

if (VAPID_EMAIL && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    pushEnabled = true
  } catch (err) {
    console.error('Push notifications disabled — invalid VAPID config:', err)
  }
} else {
  console.warn('Push notifications disabled — VAPID env vars are not configured')
}

export interface NotificationPayload {
  title:  string
  body:   string
  icon?:  string
  badge?: string
  url?:   string
  tag?:   string
  data?:  any
}

// ── Send to one user ──────────────────────────────────────────────────
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload,
) {
  if (!pushEnabled) return

  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } })
    if (!subs.length) {
      console.log(`📬 No push subscriptions found for user ${userId}`)
      return
    }

    const message = JSON.stringify({
      title:  payload.title,
      body:   payload.body,
      icon:   payload.icon  || '/icons/icon-192x192.png',
      badge:  payload.badge || '/icons/badge-72x72.png',
      url:    payload.url   || '/',
      tag:    payload.tag   || 'agroflow',
      data:   payload.data  || {},
      id:     `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    })

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
          )
          console.log(`✅ Push sent to user ${userId}`)
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } })
            console.log(`🗑️ Removed expired subscription for user ${userId}`)
          } else {
            console.error(`❌ Push failed for user ${userId}:`, err.message)
          }
        }
      })
    )
  } catch (err) {
    console.error('Push notification error:', err)
  }
}

// ── Send to multiple users ────────────────────────────────────────────
export async function sendNotificationToUsers(
  userIds: string[],
  payload: NotificationPayload,
) {
  if (!userIds.length) return
  console.log(`📬 Sending push to ${userIds.length} users: ${payload.title}`)
  await Promise.allSettled(userIds.map(id => sendNotificationToUser(id, payload)))
}

// ── Get all admin user IDs ──────
export async function getAllAdminUserIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true },
  })
  console.log(`📋 Found ${admins.length} admin users`);
  return admins.map(a => a.id)
}

// ── NOTIFICATION TEMPLATES ─────────────────────────────────────────────

// ── 1. NEW LISTING ────────────────────────
export async function notifyNewListing(buyerUserIds: string[], cropType: string, location: string) {
  await sendNotificationToUsers(buyerUserIds, {
    title: `🌾 New ${cropType} Available`,
    body:  `Fresh ${cropType} just listed in ${location}. Tap to view.`,
    url:   '/buyer/dashboard',
    tag:   'new-listing',
    data:  { type: 'new_listing', cropType, location }
  })
}

// ── 1b. NEW LISTING TO ADMIN ─────────────────────────────────────────
export async function notifyNewListingToAdmins(
  cropType: string, 
  location: string, 
  sellerName: string,
  listingId: string
) {
  const adminIds = await getAllAdminUserIds()
  await sendNotificationToUsers(adminIds, {
    title: `🌾 New ${cropType} Listing`,
    body: `${sellerName} listed ${cropType} in ${location}. Tap to review.`,
    url: '/admin/listings',
    tag: 'admin-new-listing',
    data: { type: 'new_listing_admin', cropType, location, sellerName, listingId }
  })
}

// ── 2. NEW ORDER ──────────────────────────────────────────────────────
export async function notifyNewOrderToAdmins(
  cropType: string,
  quantity: number,
  buyerName: string,
  sellerName: string,
  orderId: string
) {
  const adminIds = await getAllAdminUserIds()
  await sendNotificationToUsers(adminIds, {
    title: `🛒 New Order`,
    body: `${buyerName} ordered ${quantity}kg of ${cropType} from ${sellerName}.`,
    url: '/admin/orders',
    tag: 'admin-new-order',
    data: { type: 'new_order_admin', cropType, quantity, buyerName, sellerName, orderId }
  })
}

// ── 3. ORDER STATUS UPDATE ────────────────────────────────────────────
export async function notifyOrderStatusUpdate(
  userIds: string[],
  cropType: string,
  status: string,
  orderId: string,
  rider?: { riderName?: string; riderPhone?: string },
) {
  const statusMessages: Record<string, string> = {
    placed:             'Order placed successfully.',
    accepted:           'Order accepted by seller.',
    preparing:          'Seller is preparing your produce.',
    transport_assigned: 'Transport has been assigned.',
    in_transit:         'Your produce is on the way.',
    delivered:          'Produce delivered. Please confirm receipt.',
    completed:          'Order completed successfully.',
    cancelled:          'Order has been cancelled.',
  }

  const statusIcons: Record<string, string> = {
    placed:             '📋',
    accepted:           '✅',
    preparing:          '👨‍🌾',
    transport_assigned: '🚚',
    in_transit:         '🚚',
    delivered:          '📦',
    completed:          '⭐',
    cancelled:          '❌',
  }

  // The whole point of assigning a rider is handing their contact to the
  // buyer, so put it in the notification rather than a generic message.
  let body = statusMessages[status] || `Order status: ${status}`
  if (status === 'transport_assigned' && rider?.riderName) {
    body = rider.riderPhone
      ? `${rider.riderName} is delivering your order — ${rider.riderPhone}`
      : `${rider.riderName} is delivering your order.`
  }

  await sendNotificationToUsers(userIds, {
    title: `${statusIcons[status] || '📦'} Order Update — ${cropType}`,
    body,
    url: '/orders',
    tag: 'order-update',
    data: { type: 'order_update', status, cropType, orderId, ...(rider || {}) }
  })
}

// ── 4. SELLER VERIFICATION REQUEST ──────────────────────────────────
export async function notifyNewVerificationToAdmins(
  sellerName: string,
  sellerEmail: string,
  sellerId: string
) {
  const adminIds = await getAllAdminUserIds()
  await sendNotificationToUsers(adminIds, {
    title: `🆕 Verification Request`,
    body: `${sellerName} (${sellerEmail}) submitted verification. Tap to review.`,
    url: '/admin/verification',
    tag: 'new-verification',
    data: { type: 'new_verification', sellerName, sellerEmail, sellerId }
  })
}

// ── 5. VERIFICATION APPROVED ──────────────────────────────────────────
export async function notifyVerificationApproved(
  sellerUserId: string,
  sellerName: string
) {
  await sendNotificationToUser(sellerUserId, {
    title: `✅ Verification Approved`,
    body: `Congratulations ${sellerName}! You can now start selling.`,
    url: '/seller/dashboard',
    tag: 'verification-approved',
    data: { type: 'verification_approved' }
  })
}

// ── 6. VERIFICATION REJECTED ──────────────────────────────────────────
export async function notifyVerificationRejected(
  sellerUserId: string,
  sellerName: string,
  reason: string
) {
  await sendNotificationToUser(sellerUserId, {
    title: `❌ Verification Rejected`,
    body: `Hi ${sellerName}, your verification was rejected. Reason: ${reason}`,
    url: '/seller/dashboard',
    tag: 'verification-rejected',
    data: { type: 'verification_rejected', reason }
  })
}

// ── 7. NEW USER REGISTRATION ──────────────────────────────────────────
export async function notifyNewUserToAdmins(
  userName: string,
  userEmail: string,
  role: string
) {
  const adminIds = await getAllAdminUserIds()
  await sendNotificationToUsers(adminIds, {
    title: `👤 New ${role} Registered`,
    body: `${userName} (${userEmail}) just joined as a ${role}.`,
    url: '/admin/users',
    tag: 'new-user',
    data: { type: 'new_user', userName, userEmail, role }
  })
}

// ── 8. NEW REQUEST FROM BUYER ──────────────────────────────────────────
export async function notifyNewRequest(sellerUserId: string, cropType: string, quantity: number) {
  await sendNotificationToUser(sellerUserId, {
    title: '🛒 New Buy Request',
    body:  `Someone wants to buy ${quantity}kg of your ${cropType}.`,
    url:   '/seller/requests',
    tag:   'new-request',
    data:  { type: 'new_request', cropType, quantity }
  })
}

// ── 9. NEW MATCH FOUND ────────────────────────────────────────────────
export async function notifyNewMatch(userIds: string[], cropType: string) {
  await sendNotificationToUsers(userIds, {
    title: '🤝 New Match Found',
    body:  `A match has been found for ${cropType}. Tap to view.`,
    url:   '/matches',
    tag:   'new-match',
    data:  { type: 'new_match', cropType }
  })
}

// ── 10. LOW STOCK ALERT ──────────────────────────────────────────────
export async function notifyLowStock(
  sellerUserId: string, 
  cropType: string, 
  remainingQty: number
) {
  await sendNotificationToUser(sellerUserId, {
    title: '⚠️ Low Stock Alert',
    body:  `Your ${cropType} is almost sold out! Only ${remainingQty}kg left.`,
    url:   '/seller/dashboard',
    tag:   'low-stock',
    data:  { type: 'low_stock', cropType, remainingQty }
  })
}

// ── 10b. LOW STOCK TO ADMIN ──────────────────────────────────────────
export async function notifyLowStockToAdmin(
  cropType: string,
  remainingQty: number,
  sellerName: string
) {
  const adminIds = await getAllAdminUserIds()
  await sendNotificationToUsers(adminIds, {
    title: `⚠️ Low Stock Alert`,
    body: `${sellerName}'s ${cropType} is running low. Only ${remainingQty}kg left.`,
    url: '/admin/listings',
    tag: 'admin-low-stock',
    data: { type: 'low_stock_admin', cropType, remainingQty, sellerName }
  })
}

// ── 11. DELIVERY CONFIRMED ────────────────────────────────────────────
export async function notifyDeliveryConfirmedToSeller(
  sellerUserId: string, 
  cropType: string
) {
  await sendNotificationToUser(sellerUserId, {
    title: '✅ Delivery Confirmed',
    body:  `The buyer has confirmed delivery of ${cropType}.`,
    url:   '/seller/orders',
    tag:   'delivery-confirmed',
    data:  { type: 'delivery_confirmed', cropType }
  })
}

// ── 12. ORDER CANCELLED ──────────────────────────────────────────────
export async function notifyOrderCancelledToSeller(
  sellerUserId: string, 
  cropType: string, 
  quantity: number
) {
  await sendNotificationToUser(sellerUserId, {
    title: '❌ Order Cancelled',
    body:  `A buyer cancelled their order for ${quantity}kg of ${cropType}.`,
    url:   '/seller/orders',
    tag:   'order-cancelled',
    data:  { type: 'order_cancelled', cropType, quantity }
  })
}

// ── 13. DEMAND MATCHED ──────────────────────────────────────────────
export async function notifyDemandMatched(
  buyerUserId: string, 
  cropType: string, 
  sellerName: string
) {
  await sendNotificationToUser(buyerUserId, {
    title: '🎯 Demand Matched',
    body:  `${sellerName} has produce matching your demand for ${cropType}.`,
    url:   '/buyer/dashboard',
    tag:   'demand-matched',
    data:  { type: 'demand_matched', cropType, sellerName }
  })
}

// ── 14. REVIEW RECEIVED ──────────────────────────────────────────────
export async function notifyReviewReceived(
  sellerUserId: string,
  cropType: string,
  rating: number
) {
  await sendNotificationToUser(sellerUserId, {
    title: `⭐ New Review`,
    body: `You received a ${rating}-star review for ${cropType}.`,
    url: '/seller/reviews',
    tag: 'new-review',
    data: { type: 'new_review', cropType, rating }
  })
}