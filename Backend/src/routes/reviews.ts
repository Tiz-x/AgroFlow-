import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { notifyReviewReceived } from '../services/notificationService'

const router = Router()

// Submit a review
router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, rating, comment } = req.body

    // Rating must be a whole number 1-5. `!rating` alone also rejected 0,
    // but let 2.7 and "5" through.
    const parsedRating = Number(rating)
    if (
      !orderId ||
      typeof orderId !== 'string' ||
      !Number.isInteger(parsedRating) ||
      parsedRating < 1 ||
      parsedRating > 5
    ) {
      res.status(400).json({ error: 'Valid orderId and rating (1-5) required' })
      return
    }

    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
      res.status(400).json({ error: 'Comment must be text' })
      return
    }

    const cleanComment =
      typeof comment === 'string' && comment.trim() !== ''
        ? comment.trim().slice(0, 2000)
        : null

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { match: true }
    })

    if (!order) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    // ── Only the buyer on this order may review it ────────────────────
    // Without this check any authenticated user could post reviews on
    // orders they had nothing to do with, and `buyerId` was never stored.
    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!buyer || order.buyerId !== buyer.id) {
      res.status(403).json({ error: 'You can only review your own orders' })
      return
    }

    if (order.status !== 'completed') {
      res.status(400).json({ error: 'Can only review completed orders' })
      return
    }

    // A farmer holds both a buyer and a seller profile, so on an order where
    // both sides resolve to the same account the buyer could rate themselves
    // and inflate their own seller rating.
    const orderSeller = await prisma.seller.findUnique({
      where:  { id: order.sellerId },
      select: { userId: true },
    })

    if (orderSeller?.userId === req.user!.id) {
      res.status(400).json({ error: 'You cannot review your own sale' })
      return
    }

    // Check if already reviewed
    const existing = await prisma.review.findUnique({ where: { orderId } })
    if (existing) {
      res.status(400).json({ error: 'You already reviewed this order' })
      return
    }

    const review = await prisma.review.create({
      data: {
        orderId,
        reviewerId: req.user!.id,
        buyerId:    buyer.id,
        sellerId:   order.sellerId,
        rating:     parsedRating,
        comment:    cleanComment,
      }
    })

    // ── Let the seller know, mirroring the other order events ─────────
    try {
      const seller = await prisma.seller.findUnique({
        where: { id: order.sellerId },
        select: { userId: true },
      })
      if (seller) {
        await notifyReviewReceived(
          seller.userId,
          order.match?.cropType || 'produce',
          parsedRating,
        )
      }
    } catch (notifyError) {
      console.error('Failed to send review notification:', notifyError)
    }

    res.status(201).json({ success: true, review })
  } catch (error: any) {
    console.error('Review error:', error)
    res.status(500).json({ error: 'Failed to submit review' })
  }
})

// Get reviews for a seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const sellerId = String(req.params.sellerId || '')
    if (!sellerId) {
      res.status(400).json({ error: 'sellerId is required' })
      return
    }

    // The page shows the 100 most recent reviews, but the headline rating and
    // count must describe *all* of them. Deriving both from the truncated page
    // meant a seller with 250 reviews advertised "100 reviews" and an average
    // that silently ignored everything older.
    const [reviews, stats] = await Promise.all([
      prisma.review.findMany({
        where:   { sellerId },
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    100,
      }),
      prisma.review.aggregate({
        where: { sellerId },
        _avg:   { rating: true },
        _count: { _all: true },
      }),
    ])

    const avg = stats._avg.rating ?? 0

    res.json({
      reviews,
      averageRating: Math.round(avg * 10) / 10,
      total: stats._count._all,
    })
  } catch (error) {
    console.error('Fetch seller reviews error:', error)
    res.status(500).json({ error: 'Failed to fetch reviews' })
  }
})

export default router