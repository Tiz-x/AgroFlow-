import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { sendNotificationToUser } from '../services/notificationService'

const router = Router()

// Save subscription
router.post('/subscribe', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint, keys } = req.body

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Invalid subscription data' })
      return
    }

    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user!.id },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.user!.id },
    })

    res.json({ success: true })
  } catch (err) {
    console.error('Subscribe error:', err)
    res.status(500).json({ error: 'Failed to save subscription' })
  }
})

// Remove subscription
router.post('/unsubscribe', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body

    // Prisma drops `undefined` filter fields, so `where: { endpoint: undefined }`
    // collapses to `where: {}` — which deleted every push subscription on the
    // platform for anyone who posted an empty body. Require the endpoint, and
    // scope the delete to the caller so one user cannot unsubscribe another.
    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
      res.status(400).json({ error: 'A subscription endpoint is required' })
      return
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user!.id },
    })

    res.json({ success: true })
  } catch (err) {
    console.error('Unsubscribe error:', err)
    res.status(500).json({ error: 'Failed to remove subscription' })
  }
})

// Test notification
router.post('/test', protect, async (req: AuthRequest, res: Response) => {
  try {
    await sendNotificationToUser(req.user!.id, {
      title: '🌾 AgroFlow+ Notifications Active!',
      body:  'You will now receive updates on orders, matches and new listings.',
      url:   '/',
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Test notification error:', err)
    res.status(500).json({ error: 'Failed to send test notification' })
  }
})

export default router