import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'
import { AuthRequest } from '../middleware/auth'

const router = Router()

// ── GET DASHBOARD STATS ────────────────────────────
router.get('/stats', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers, totalFarmers, totalBuyers,
      totalSellers, totalListings, totalOrders,
      activeListings, completedOrders, pendingOrders
    ] = await Promise.all([
      prisma.user.count(),
      prisma.farmer.count(),
      prisma.buyer.count(),
      prisma.seller.count(),
      prisma.listing.count(),
      prisma.order.count(),
      prisma.listing.count({ where: { status: 'available' } }),
      prisma.order.count({ where: { status: 'completed' } }),
      prisma.order.count({ where: { status: 'placed' } }),
    ])

    res.json({
      totalUsers,
      totalFarmers,
      totalBuyers,
      totalSellers,
      totalListings,
      totalOrders,
      activeListings,
      completedOrders,
      pendingOrders,
    })
  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

// ── GET ALL LISTINGS (admin) ───────────────────────
router.get('/listings', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const listings = await prisma.listing.findMany({
      include: {
        seller: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ listings })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch listings' })
  }
})

// ── DELETE LISTING (admin) ─────────────────────────
router.delete('/listings/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    // ✅ FIX: Added String() wrapper to ensure id is a string
    await prisma.listing.delete({ where: { id: String(req.params.id) } })
    res.json({ message: 'Listing deleted' })
  } catch (error) {
    console.error('Delete listing error:', error)
    res.status(500).json({ error: 'Failed to delete listing' })
  }
})

// ── GET ALL ORDERS (admin) ─────────────────────────
router.get('/orders', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        match: true,
        buyer:  { include: { user: { select: { name: true } } } },
        seller: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ orders })
  } catch (error) {
    console.error('Get orders error:', error)
    res.status(500).json({ error: 'Failed to fetch orders' })
  }
})

export default router