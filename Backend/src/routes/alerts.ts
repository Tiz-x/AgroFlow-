import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'

const router = Router()

router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        field: {
          include: {
            farmer: {
              include: {
                user: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = alerts.map((a: {
      id:         string
      fieldId:    string
      type:       string
      severity:   string
      resolved:   boolean
      resolvedAt: Date | null
      createdAt:  Date
      field: {
        farmerId: string
        location: string
        crop:     string
        farmer: {
          user: { name: string }
        }
      }
    }) => ({
      id:         a.id,
      fieldId:    a.fieldId,
      farmerName: a.field.farmer.user.name,
      farmerId:   a.field.farmerId,
      location:   a.field.location,
      crop:       a.field.crop,
      type:       a.type,
      severity:   a.severity,
      resolved:   a.resolved,
      resolvedAt: a.resolvedAt,
      time:       a.createdAt,
    }))

    res.json({ alerts: formatted, total: formatted.length })
  } catch (error) {
    console.error('Get alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

router.get('/mine', protect, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' })
      return
    }

    const alerts = await prisma.alert.findMany({
      where: {
        field: { farmerId: farmer.id },
      },
      include: {
        field: {
          select: {
            location: true,
            crop:     true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ alerts, total: alerts.length })
  } catch (error) {
    console.error('Get my alerts error:', error)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// ── Ownership helpers ─────────────────────────────────────────────────
// None of the write routes below checked who owned the field an alert hangs
// off, so any signed-in user could raise a critical alert on a stranger's farm
// or silently resolve alerts they had nothing to do with.
async function callerFarmerId(userId: string): Promise<string | null> {
  const farmer = await prisma.farmer.findUnique({
    where:  { userId },
    select: { id: true },
  })
  return farmer?.id ?? null
}

router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { fieldId, type, severity } = req.body

    if (!fieldId || !type || !severity) {
      res.status(400).json({ error: 'fieldId, type and severity are required' })
      return
    }

    const validSeverities = ['info', 'warning', 'critical']
    if (!validSeverities.includes(severity)) {
      res.status(400).json({ error: 'Severity must be info, warning or critical' })
      return
    }

    // An unknown fieldId used to fail as an opaque foreign-key 500.
    const field = await prisma.field.findUnique({
      where:  { id: String(fieldId) },
      select: { id: true, farmerId: true },
    })

    if (!field) {
      res.status(404).json({ error: 'Field not found' })
      return
    }

    const isAdmin = req.user!.role === 'admin'
    if (!isAdmin && (await callerFarmerId(req.user!.id)) !== field.farmerId) {
      res.status(403).json({ error: 'You do not have access to this field' })
      return
    }

    const alert = await prisma.alert.create({
      data: { fieldId: field.id, type, severity },
    })

    res.status(201).json({ message: 'Alert created', alert })
  } catch (error) {
    console.error('Create alert error:', error)
    res.status(500).json({ error: 'Failed to create alert' })
  }
})

/**
 * Shared guard for the resolve/unresolve routes. Returns the alert when the
 * caller owns the field it belongs to (or is an admin), otherwise writes the
 * response and returns null.
 */
async function loadOwnedAlert(req: AuthRequest, res: Response) {
  const alert = await prisma.alert.findUnique({
    where:   { id: String(req.params.id) },
    include: { field: { select: { farmerId: true } } },
  })

  if (!alert) {
    res.status(404).json({ error: 'Alert not found' })
    return null
  }

  const isAdmin = req.user!.role === 'admin'
  if (!isAdmin && (await callerFarmerId(req.user!.id)) !== alert.field.farmerId) {
    res.status(403).json({ error: 'You do not have access to this alert' })
    return null
  }

  return alert
}

router.patch('/:id/resolve', protect, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedAlert(req, res)
    if (!owned) return

    const alert = await prisma.alert.update({
      where: { id: owned.id },
      data: {
        resolved:   true,
        resolvedAt: new Date(),
      },
    })

    res.json({ message: 'Alert resolved', alert })
  } catch (error) {
    console.error('Resolve alert error:', error)
    res.status(500).json({ error: 'Failed to resolve alert' })
  }
})

router.patch('/:id/unresolve', protect, async (req: AuthRequest, res: Response) => {
  try {
    const owned = await loadOwnedAlert(req, res)
    if (!owned) return

    const alert = await prisma.alert.update({
      where: { id: owned.id },
      data: {
        resolved:   false,
        resolvedAt: null,
      },
    })

    res.json({ message: 'Alert unresolved', alert })
  } catch (error) {
    console.error('Unresolve alert error:', error)
    res.status(500).json({ error: 'Failed to unresolve alert' })
  }
})

export default router