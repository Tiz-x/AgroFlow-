import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../db/index'
import { protect } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'
import { AuthRequest } from '../middleware/auth'

const router = Router()

// ── GET ALL USERS (admin only) ────────────────────
router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id:        true,
        name:      true,
        email:     true,
        phone:     true,
        role:      true,
        status:    true,
        location:  true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ users, total: users.length })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// ── GET ONE USER (admin only) ─────────────────────
router.get('/:id', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id:        true,
        name:      true,
        email:     true,
        phone:     true,
        role:      true,
        status:    true,
        location:  true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// ── ADD USER (admin only) ─────────────────────────
router.post('/', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role, phone, location } = req.body

    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password and role are required' })
      return
    }

    // This handler had drifted from /auth/register and enforced none of its
    // rules. An unrecognised role produced an account with no profile row that
    // satisfied no authorization check, and a mixed-case email could never log
    // in because login lowercases the identifier before looking it up.
    const validRoles = ['farmer', 'buyer', 'seller', 'admin']
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Role must be one of: farmer, buyer, seller, admin' })
      return
    }

    const cleanEmail = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address' })
      return
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } })
    if (existing) {
      res.status(400).json({ error: 'Email already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // User and profile are created together so a failed profile insert cannot
    // leave an orphaned account behind.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email:    cleanEmail,
          password: hashedPassword,
          role,
          phone:    phone    || null,
          location: location || null,
        },
      })

      if (role === 'farmer') {
        await tx.farmer.create({
          data: { userId: created.id, location: location || '' },
        })
      } else if (role === 'buyer') {
        await tx.buyer.create({ data: { userId: created.id } })
      } else if (role === 'seller') {
        await tx.seller.create({ data: { userId: created.id } })
      }

      return created
    })

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    })
  } catch (error) {
    console.error('Add user error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// ── SUSPEND / REINSTATE USER (admin only) ─────────
router.patch('/:id/status', protect, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body

    if (!['active', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or suspended' })
      return
    }

    // Suspending yourself locks you out of the admin panel, and suspending the
    // last admin leaves nobody who can undo it.
    const targetId = String(req.params.id)
    if (targetId === req.user!.id) {
      res.status(400).json({ error: 'You cannot change your own account status' })
      return
    }

    // Without an explicit select, Prisma returns the whole row — including the
    // bcrypt password hash — straight to the admin panel.
    const user = await prisma.user.update({
      where: { id: targetId },
      data:  { status },
      select: {
        id:     true,
        name:   true,
        email:  true,
        role:   true,
        status: true,
      },
    })

    res.json({ message: `User ${status} successfully`, user })
  } catch (error) {
    console.error('Update user status error:', error)
    res.status(500).json({ error: 'Failed to update user status' })
  }
})

// ── UPDATE MY PROFILE ─────────────────────────────
router.patch('/me/update', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, location } = req.body

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data:  {
        ...(name     && { name     }),
        ...(phone    && { phone    }),
        ...(location && { location }),
      },
      select: {
        id:       true,
        name:     true,
        email:    true,
        phone:    true,
        location: true,
        role:     true,
      },
    })

    res.json({ message: 'Profile updated', user })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

export default router