import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { 
  notifyOrderStatusUpdate,
  notifyNewOrderToAdmins,
  notifyOrderCancelledToSeller,
  notifyDeliveryConfirmedToSeller
} from '../services/notificationService'

const router = Router()

// ── Helper to safely get param as string ──────────────────
const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || ''

// ── Rider detail validation ───────────────────────────────
const RIDER_NAME_MAX = 80
const RIDER_PHONE_MAX = 20

// Accepts Nigerian formats: 08012345678, 8012345678, +2348012345678
function normalizeRiderPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[\s()-]/g, '')
  if (!/^\+?\d{10,15}$/.test(digits)) return null
  return digits.slice(0, RIDER_PHONE_MAX)
}

function normalizeRiderName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  // A whitespace-only string is truthy, so `!riderName` was not enough.
  if (trimmed.length < 2) return null
  return trimmed.slice(0, RIDER_NAME_MAX)
}

// ── Recompute a listing's status from its remaining quantity ──────────
// Previously the cancel path collapsed this to available/sold, which
// wrongly marked a partially-sold listing as fully available.
function listingStatusFor(remainingQty: number, totalQty: number) {
  if (remainingQty <= 0) return 'sold' as const
  if (remainingQty < totalQty) return 'partial' as const
  return 'available' as const
}

// ── Return the quantity on a cancelled order back to its listing ──────
async function restoreListingQuantity(listingId: string | undefined, quantity: number) {
  if (!listingId || quantity <= 0) return

  // Read-then-write meant two cancellations landing together both read the
  // same `remainingQty` and wrote the same result, so one restore was lost and
  // that stock became unsellable. Increment atomically, then clamp.
  await prisma.$transaction(async (tx) => {
    const exists = await tx.listing.findUnique({
      where:  { id: listingId },
      select: { id: true },
    })
    if (!exists) return

    await tx.listing.update({
      where: { id: listingId },
      data:  { remainingQty: { increment: quantity } },
    })

    const fresh = await tx.listing.findUnique({ where: { id: listingId } })
    if (!fresh) return

    // Never restore past the original quantity.
    const newQty = Math.min(fresh.quantity, fresh.remainingQty)

    await tx.listing.update({
      where: { id: fresh.id },
      data: {
        remainingQty: newQty,
        status: listingStatusFor(newQty, fresh.quantity),
      },
    })
  })
}

// ── statusHistory is a Json column, but older rows were written with
//    JSON.stringify, so they hold a *string* containing JSON. Reads must
//    tolerate both shapes (and malformed data) rather than throwing
//    mid-request. New writes pass the array natively. ───────────────────
type StatusHistoryEntry = { status: string; timestamp: string; note?: string }

function parseStatusHistory(raw: unknown): StatusHistoryEntry[] {
  if (Array.isArray(raw)) return raw as StatusHistoryEntry[]
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── CREATE ORDER FROM MATCH ──────────────────────────────────
export async function createOrderFromMatch(
  matchId: string, 
  buyerId: string, 
  sellerId: string, 
  quantity: number, 
  listingId: string
) {
  // ── Check for duplicate order ──────────────────────────────
  const existing = await prisma.order.findFirst({
    where: { matchId }
  })
  if (existing) return existing

  // ── Create order ────────────────────────────────────────────
  const order = await prisma.order.create({
    data: {
      matchId,
      buyerId,
      sellerId,
      status: 'placed',
      // Json column — pass the array natively rather than stringifying it.
      statusHistory: [
        { status: 'placed', timestamp: new Date().toISOString(), note: 'Order placed' }
      ] as any
    }
  })

  // ── Update listing remaining quantity ──────────────────────
  // Read-then-write let two concurrent orders both read the same
  // `remainingQty` and each subtract from that stale value, overselling the
  // listing. Decrement atomically, guarded so it cannot go negative.
  const claimed = await prisma.listing.updateMany({
    where: { id: listingId, remainingQty: { gte: quantity } },
    data:  { remainingQty: { decrement: quantity } },
  })

  if (claimed.count > 0) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId } })

    if (listing) {
      await prisma.listing.update({
        where: { id: listingId },
        data: { status: listingStatusFor(listing.remainingQty, listing.quantity) },
      })
    }
  }

  // ── NOTIFY ADMINS ABOUT NEW ORDER ──────────────────────────
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        buyer: { include: { user: true } },
        seller: { include: { user: true } }
      }
    })
    if (match) {
      await notifyNewOrderToAdmins(
        match.cropType,
        match.quantity,
        match.buyer.user.name,
        match.seller.user.name,
        order.id
      )
      console.log(`🔔 Admin notification sent for new order ${order.id}`)
    }
  } catch (notifyError) {
    console.error('Failed to send admin order notification:', notifyError)
  }

  return order
}

// ── GET ALL ORDERS FOR THE CURRENT USER ────────────────────
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id

    const buyer = await prisma.buyer.findUnique({
      where: { userId },
    })

    const seller = await prisma.seller.findUnique({
      where: { userId },
    })

    const filter: any = {}
    if (buyer && seller) {
      filter.OR = [
        { buyerId: buyer.id },
        { sellerId: seller.id },
      ]
    } else if (buyer) {
      filter.buyerId = buyer.id
    } else if (seller) {
      filter.sellerId = seller.id
    } else {
      res.json({ orders: [] })
      return
    }

    const orders = await prisma.order.findMany({
      where: filter,
      include: {
        match: {
          include: {
            listing: true,
          },
        },
        // The UI hides "Leave a Review" once a review exists, which never
        // worked because the review was not being sent.
        review: true,
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Farmers hold both a buyer and a seller profile, so "am I the seller
    // here?" has to be answered per order — the client cannot infer it from
    // the account role alone.
    const formattedOrders = orders.map((order: any) => ({
      ...order,
      statusHistory: parseStatusHistory(order.statusHistory),
      viewerRole: seller && order.sellerId === seller.id ? 'seller' : 'buyer',
    }))

    res.json({ orders: formattedOrders })
  } catch (error) {
    console.error('Get orders error:', error)
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

// ── GET A SINGLE ORDER ────────────────────────────────────
router.get('/:orderId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const orderId = getParam(req.params.orderId)
    const userId = req.user!.id

    const buyer = await prisma.buyer.findUnique({
      where: { userId },
    })

    const seller = await prisma.seller.findUnique({
      where: { userId },
    })

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        match: {
          include: {
            listing: true,
          },
        },
        review: true,
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    const isBuyer = buyer && order.buyerId === buyer.id
    const isSeller = seller && order.sellerId === seller.id

    if (!isBuyer && !isSeller) {
      res.status(403).json({ error: 'You do not have access to this order' })
      return
    }

    const formattedOrder = {
      ...order,
      statusHistory: parseStatusHistory(order.statusHistory),
      viewerRole: isSeller ? 'seller' : 'buyer',
    }

    res.json({ order: formattedOrder })
  } catch (error) {
    console.error('Get order error:', error)
    res.status(500).json({ error: 'Failed to fetch order' })
  }
})

// ── UPDATE ORDER STATUS ────────────────────────────────────
router.patch('/:orderId/status', protect, async (req: AuthRequest, res: Response) => {
  try {
    const orderId = getParam(req.params.orderId)
    const { status, note, riderName, riderPhone } = req.body  // ← Added riderName and riderPhone
    const userId = req.user!.id

    const validStatuses = [
      'placed',
      'accepted',
      'preparing',
      'transport_assigned',
      'in_transit',
      'delivered',
      'completed',
      'cancelled',
    ]

    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      })
      return
    }

    // ── VALIDATE RIDER INFO FOR TRANSPORT_ASSIGNED ──────────────
    // Validate up front so a blank/garbage rider can't be persisted.
    let cleanRiderName: string | null = null
    let cleanRiderPhone: string | null = null

    if (status === 'transport_assigned') {
      cleanRiderName = normalizeRiderName(riderName)
      cleanRiderPhone = normalizeRiderPhone(riderPhone)

      if (!cleanRiderName) {
        res.status(400).json({
          error: "Please provide the rider's full name (at least 2 characters)",
        })
        return
      }

      if (!cleanRiderPhone) {
        res.status(400).json({
          error: "Please provide a valid rider phone number",
        })
        return
      }
    }

    const buyer = await prisma.buyer.findUnique({
      where: { userId },
    })

    const seller = await prisma.seller.findUnique({
      where: { userId },
    })

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        match: {
          include: {
            listing: true,
          },
        },
      },
    })

    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    const isBuyer = buyer && order.buyerId === buyer.id
    const isSeller = seller && order.sellerId === seller.id

    if (!isBuyer && !isSeller) {
      res.status(403).json({ error: 'You do not have access to this order' })
      return
    }

    const currentStatus = order.status
    const validTransitions: Record<string, string[]> = {
      placed: ['accepted', 'cancelled'],
      accepted: ['preparing', 'cancelled'],
      preparing: ['transport_assigned', 'cancelled'],
      transport_assigned: ['in_transit', 'cancelled'],
      in_transit: ['delivered', 'cancelled'],
      delivered: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    }

    if (isSeller) {
      // Re-sending transport_assigned is allowed so a seller can correct
      // rider details; every other same-status replay is rejected, since
      // it just spammed status history and re-fired notifications.
      const isRiderCorrection =
        status === 'transport_assigned' && currentStatus === 'transport_assigned'

      if (!validTransitions[currentStatus]?.includes(status) && !isRiderCorrection) {
        res.status(400).json({
          error: `Cannot transition from ${currentStatus} to ${status}`,
        })
        return
      }
    } else if (isBuyer) {
      if (status === 'cancelled') {
        if (['delivered', 'completed'].includes(currentStatus)) {
          res.status(400).json({
            error: 'Cannot cancel an order that has been delivered or completed',
          })
          return
        }
        if (currentStatus === 'cancelled') {
          res.status(400).json({ error: 'Order is already cancelled' })
          return
        }
      } else if (status === 'completed') {
        if (currentStatus !== 'delivered') {
          res.status(400).json({
            error: 'Can only complete an order after it has been delivered',
          })
          return
        }
      } else {
        res.status(400).json({
          error: 'Buyers can only cancel or complete orders',
        })
        return
      }
    }

    // ── Only the seller assigns transport ───────────────────────────────
    // Buyers legitimately call this endpoint (to cancel/complete), and the
    // rider fields used to be written from the body on ANY transition —
    // so a buyer could overwrite the seller's rider details.
    if (status === 'transport_assigned' && !isSeller) {
      res.status(403).json({
        error: 'Only the seller can assign a rider to this order',
      })
      return
    }

    const statusHistory = parseStatusHistory(order.statusHistory)

    statusHistory.push({
      status,
      timestamp: new Date().toISOString(),
      note: note || `Status updated to ${status}`,
    })

    // ── Cancelling here must return stock, same as /cancel ──────────────
    // This route accepted `cancelled` but never restored the listing
    // quantity, so inventory silently vanished depending on which
    // endpoint the client happened to call.
    if (status === 'cancelled' && currentStatus !== 'cancelled') {
      await restoreListingQuantity(
        order.match?.listingId,
        order.match?.quantity || 0,
      )
    }

    // ── UPDATE ORDER WITH RIDER INFO ──────────────────────────────
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: status as any,
        // `statusHistory` is a Prisma `Json` column, so stringifying it here
        // stored a *string* containing JSON rather than an array. Every reader
        // then had to double-parse it. Pass the array through natively.
        statusHistory: statusHistory as any,
        notes: note ? (order.notes ? `${order.notes}\n${note}` : note) : order.notes,
        // Only written on the transport_assigned transition, by the seller.
        ...(cleanRiderName ? { riderName: cleanRiderName } : {}),
        ...(cleanRiderPhone ? { riderPhone: cleanRiderPhone } : {}),
        // A cancelled order has no rider. Leaving the details behind meant the
        // buyer's order card kept showing a courier who was never coming.
        ...(status === 'cancelled' ? { riderName: null, riderPhone: null } : {}),
      },
      include: {
        match: {
          include: {
            listing: true,
          },
        },
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    // ── NOTIFY THE *OTHER* PARTY ABOUT THE ORDER STATUS UPDATE ─────────
    // Notifications used to go to the buyer on every transition and to the
    // seller on cancel, regardless of who acted — so a buyer who cancelled
    // their own order was pushed a notice about their own click, and a seller
    // who cancelled was told their order had been cancelled. Only notify the
    // counterparty.
    const actorRole: 'seller' | 'buyer' = isSeller ? 'seller' : 'buyer'

    try {
      const cropType = updatedOrder.match?.cropType || updatedOrder.match?.listing?.cropType || 'produce'

      // Seller acted → tell the buyer.
      if (actorRole === 'seller' && updatedOrder?.buyer?.userId) {
        await notifyOrderStatusUpdate(
          [updatedOrder.buyer.userId],
          cropType,
          status,
          updatedOrder.id,
          // Give the buyer the rider's details in the notification itself.
          status === 'transport_assigned'
            ? {
                riderName: updatedOrder.riderName || undefined,
                riderPhone: updatedOrder.riderPhone || undefined,
              }
            : undefined,
        )
      }

      // Buyer acted → tell the seller.
      if (actorRole === 'buyer' && updatedOrder?.seller?.userId) {
        if (status === 'cancelled') {
          const quantity = updatedOrder.match?.quantity || 0
          await notifyOrderCancelledToSeller(
            updatedOrder.seller.userId,
            cropType,
            quantity
          )
        } else if (status === 'completed') {
          // This fired on `delivered`, which is the *seller's* own transition —
          // so the seller was told "the buyer has confirmed delivery" the
          // moment they marked it delivered, and got nothing when the buyer
          // actually confirmed. `completed` is the buyer's confirmation.
          await notifyDeliveryConfirmedToSeller(
            updatedOrder.seller.userId,
            cropType
          )
        }
      }
    } catch (notifyError) {
      console.error('Failed to send order status notification:', notifyError)
    }

    const formattedOrder = {
      ...updatedOrder,
      statusHistory: parseStatusHistory(updatedOrder.statusHistory),
      viewerRole: isSeller ? 'seller' : 'buyer',
    }

    res.json({
      message: 'Order status updated successfully',
      order: formattedOrder,
    })
  } catch (error) {
    console.error('Update order status error:', error)
    res.status(500).json({ error: 'Failed to update order status' })
  }
})

// ── CANCEL ORDER ──────────────────────────────────────────
router.patch('/:orderId/cancel', protect, async (req: AuthRequest, res: Response) => {
  try {
    const orderId = getParam(req.params.orderId)
    const { reason } = req.body
    const userId = req.user!.id

    const buyer = await prisma.buyer.findUnique({
      where: { userId },
    })

    const seller = await prisma.seller.findUnique({
      where: { userId },
    })

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        match: {
          include: {
            listing: true,
          },
        },
      },
    })

    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    const isBuyer = buyer && order.buyerId === buyer.id
    const isSeller = seller && order.sellerId === seller.id

    if (!isBuyer && !isSeller) {
      res.status(403).json({ error: 'You do not have access to this order' })
      return
    }

    if (['delivered', 'completed'].includes(order.status)) {
      res.status(400).json({
        error: 'Cannot cancel an order that has been delivered or completed',
      })
      return
    }

    if (order.status === 'cancelled') {
      res.status(400).json({ error: 'Order is already cancelled' })
      return
    }

    // Restore stock through the shared helper. This used to call
    // `findUnique({ where: { id: order.match?.listingId } })`, which throws
    // when listingId is undefined, and set status to 'available' whenever
    // any quantity remained — wiping the 'partial' state of a listing that
    // still had other sales against it.
    await restoreListingQuantity(
      order.match?.listingId,
      order.match?.quantity || 0,
    )

    const statusHistory = parseStatusHistory(order.statusHistory)

    statusHistory.push({
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      note: reason || `Order cancelled by ${isSeller ? 'seller' : 'buyer'}`,
    })

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'cancelled',
        // Native array — see the note in /status. `statusHistory` is a Json
        // column, so stringifying stored JSON-inside-a-string.
        statusHistory: statusHistory as any,
        notes: order.notes ? `${order.notes}\nCancelled: ${reason || 'No reason provided'}` : `Cancelled: ${reason || 'No reason provided'}`,
        // No rider on a cancelled order.
        riderName: null,
        riderPhone: null,
      },
      include: {
        match: {
          include: {
            listing: true,
          },
        },
        buyer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    })

    // ── NOTIFY THE COUNTERPARTY ABOUT THE CANCELLATION ──────────────────
    // Both sides used to be notified unconditionally, so whoever cancelled
    // received a push telling them their own order had been cancelled.
    try {
      const cropType = updatedOrder.match?.cropType || updatedOrder.match?.listing?.cropType || 'produce'

      if (isSeller && updatedOrder?.buyer?.userId) {
        await notifyOrderStatusUpdate(
          [updatedOrder.buyer.userId],
          cropType,
          'cancelled',
          updatedOrder.id
        )
      }

      // The seller was never told about cancellations made through this
      // route, even though /status already did so.
      if (!isSeller && updatedOrder?.seller?.userId) {
        await notifyOrderCancelledToSeller(
          updatedOrder.seller.userId,
          cropType,
          updatedOrder.match?.quantity || 0
        )
      }
    } catch (notifyError) {
      console.error('Failed to send order cancellation notification:', notifyError)
    }

    const formattedOrder = {
      ...updatedOrder,
      statusHistory: parseStatusHistory(updatedOrder.statusHistory),
      viewerRole: isSeller ? 'seller' : 'buyer',
    }

    res.json({
      message: 'Order cancelled successfully',
      order: formattedOrder,
    })
  } catch (error) {
    console.error('Cancel order error:', error)
    res.status(500).json({ error: 'Failed to cancel order' })
  }
})

export default router