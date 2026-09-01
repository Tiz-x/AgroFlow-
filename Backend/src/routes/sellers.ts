import { Router, Response } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'
import {
  notifyNewVerificationToAdmins,
  notifyVerificationApproved,
  notifyVerificationRejected,
} from '../services/notificationService'

const router = Router()

// ── Cloudinary Configuration ──────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// ── Multer Configuration ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed'))
  },
})

// ── Helper to safely get param ────────────────────────────
const getParam = (param: string | string[] | undefined): string =>
  Array.isArray(param) ? param[0] : param || ''

// ── GET MY VERIFICATION STATUS ────────────────────────────
router.get('/my/status', protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: {
        id: true,
        verificationStatus: true,
        selfieUrl: true,
        verificationNote: true,
        updatedAt: true,
      },
    })

    res.json({
      verificationStatus: seller?.verificationStatus ?? 'unverified',
      seller: seller ?? null,
    })
  } catch (error) {
    console.error('Get verification status error:', error)
    res.status(500).json({ error: 'Failed to get verification status' })
  }
})

// ── SUBMIT VERIFICATION (seller) ─────────────────────────
router.post('/verify', protect, upload.single('selfie'), async (req: AuthRequest, res: Response) => {
  console.log('📋 POST /verify called')

  try {
    const { description, farmName, yearsExperience } = req.body
    const userId = req.user!.id

    // ── Validate file exists ──────────────────────────────────────
    if (!req.file) {
      res.status(400).json({ error: 'Selfie photo is required' })
      return
    }

    // ── Upload selfie to Cloudinary ──────────────────────────────
    let selfieUrl: string
    try {
      const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder:         'agroflow/selfies',
            public_id:      `selfie_${userId}_${Date.now()}`,
            transformation: [{ quality: 'auto', fetch_format: 'auto', width: 800, crop: 'limit' }],
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result as { secure_url: string })
          }
        )
        uploadStream.end(req.file!.buffer)
      })
      selfieUrl = uploadResult.secure_url
      console.log('✅ Selfie uploaded to Cloudinary:', selfieUrl)
    } catch (uploadError) {
      console.error('❌ Cloudinary upload error:', uploadError)
      res.status(500).json({ error: 'Failed to upload selfie. Please try again.' })
      return
    }

    // ── Build verification note ──────────────────────────────────
    let verificationNote = ''
    if (farmName) verificationNote += `Farm: ${farmName}. `
    if (yearsExperience) verificationNote += `Experience: ${yearsExperience} years. `
    if (description) verificationNote += `Description: ${description}`

    // ── Check if seller profile exists ──────────────────────────
    let seller = await prisma.seller.findUnique({
      where: { userId },
      include: { user: true },
    })

    // ── Check if already verified ──────────────────────────────
    if (seller?.verificationStatus === 'verified') {
      res.status(400).json({ error: 'Your account is already verified' })
      return
    }

    // ── Create or update seller ──────────────────────────────────
    if (!seller) {
      seller = await prisma.seller.create({
        data: {
          userId,
          verificationStatus: 'pending',
          selfieUrl,
          verificationNote: verificationNote || 'No additional info provided',
        },
        include: { user: true },
      })
      console.log('✅ New seller created:', seller.id)
    } else {
      seller = await prisma.seller.update({
        where: { userId },
        data: {
          verificationStatus: 'pending',
          selfieUrl,
          verificationNote: verificationNote || 'No additional info provided',
        },
        include: { user: true },
      })
      console.log('✅ Seller updated:', seller.id)
    }

    // ── NOTIFY ADMINS ──────────────────────────────────────────
    try {
      await notifyNewVerificationToAdmins(
        seller.user.name,
        seller.user.email,
        seller.id
      )
      console.log('🔔 Admin push notification sent for verification')
    } catch (notifyError) {
      console.error('Failed to notify admins of new verification:', notifyError)
    }

    res.json({
      message: 'Verification submitted successfully',
      seller: {
        id: seller.id,
        verificationStatus: seller.verificationStatus,
        selfieUrl: seller.selfieUrl,
      },
    })
  } catch (error) {
    console.error('❌ Submit verification error:', error)
    res.status(500).json({ error: 'Failed to submit verification' })
  }
})

// ── ADMIN: GET ALL SELLERS ───────────────────────────────
router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const sellers = await prisma.seller.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            location: true,
          },
        },
        listings: {
          select: {
            id: true,
            cropType: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ sellers })
  } catch (error) {
    console.error('Get sellers error:', error)
    res.status(500).json({ error: 'Failed to fetch sellers' })
  }
})

// ── ADMIN: GET PENDING SELLERS ───────────────────────────
router.get('/pending', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const sellers = await prisma.seller.findMany({
      where: {
        verificationStatus: 'pending',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            location: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ sellers })
  } catch (error) {
    console.error('Get pending sellers error:', error)
    res.status(500).json({ error: 'Failed to fetch pending sellers' })
  }
})

// ── ADMIN: GET SELLER BY ID ──────────────────────────────
router.get('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id)
    if (!id) {
      res.status(400).json({ error: 'Seller ID is required' })
      return
    }

    const seller = await prisma.seller.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            location: true,
          },
        },
        listings: true,
      },
    })
    if (!seller) {
      res.status(404).json({ error: 'Seller not found' })
      return
    }
    res.json({ seller })
  } catch (error) {
    console.error('Get seller error:', error)
    res.status(500).json({ error: 'Failed to fetch seller' })
  }
})

// ── ADMIN: APPROVE SELLER ────────────────────────────────
router.patch('/:id/approve', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id)
    const { note } = req.body

    if (!id) {
      res.status(400).json({ error: 'Seller ID is required' })
      return
    }

    const existing = await prisma.seller.findUnique({
      where: { id },
      select: { id: true, verificationStatus: true },
    })

    if (!existing) {
      res.status(404).json({ error: 'Seller not found' })
      return
    }

    const seller = await prisma.seller.update({
      where: { id },
      data: {
        verificationStatus: 'verified',
        verificationNote: typeof note === 'string' && note.trim() ? note.trim() : 'Approved',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (existing.verificationStatus !== 'verified') {
      try {
        await notifyVerificationApproved(seller.user.id, seller.user.name)
        console.log(`🔔 Approval notification sent to ${seller.user.name}`)
      } catch (notifyError) {
        console.error('Failed to send approval notification:', notifyError)
      }
    }

    res.json({
      message: 'Seller approved successfully',
      seller,
    })
  } catch (error) {
    console.error('Approve seller error:', error)
    res.status(500).json({ error: 'Failed to approve seller' })
  }
})

// ── ADMIN: REJECT SELLER ─────────────────────────────────
router.patch('/:id/reject', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = getParam(req.params.id)
    const { reason } = req.body

    if (!id) {
      res.status(400).json({ error: 'Seller ID is required' })
      return
    }

    if (typeof reason !== 'string' || reason.trim() === '') {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }

    const cleanReason = reason.trim().slice(0, 500)

    const existing = await prisma.seller.findUnique({
      where: { id },
      select: { id: true, verificationStatus: true },
    })

    if (!existing) {
      res.status(404).json({ error: 'Seller not found' })
      return
    }

    const seller = await prisma.seller.update({
      where: { id },
      data: {
        verificationStatus: 'rejected',
        verificationNote: cleanReason,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (existing.verificationStatus !== 'rejected') {
      try {
        await notifyVerificationRejected(seller.user.id, seller.user.name, cleanReason)
        console.log(`🔔 Rejection notification sent to ${seller.user.name}`)
      } catch (notifyError) {
        console.error('Failed to send rejection notification:', notifyError)
      }
    }

    res.json({
      message: 'Seller rejected',
      seller,
    })
  } catch (error) {
    console.error('Reject seller error:', error)
    res.status(500).json({ error: 'Failed to reject seller' })
  }
})

export default router