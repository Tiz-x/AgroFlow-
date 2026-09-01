import { Router, Response } from 'express'
import prisma from '../db/index'
import { protect, AuthRequest } from '../middleware/auth'
import { adminOnly } from '../middleware/adminOnly'

const router = Router()

router.get('/', protect, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const fields = await prisma.field.findMany({
      include: {
        farmer: {
          include: {
            user: {
              select: {
                name:  true,
                email: true,
              },
            },
          },
        },
        alerts: {
          where:   { resolved: false },
          orderBy: { createdAt: 'desc' },
          take:    1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const formatted = fields.map((f: {
      id:             string
      farmerId:       string
      location:       string
      crop:           string
      area:           number
      ndvi:           number
      soilMoisture:   number
      lastIrrigation: Date | null
      status:         string
      createdAt:      Date
      alerts:         { id: string }[]
      farmer: {
        user: {
          name:  string
          email: string
        }
      }
    }) => ({
      id:             f.id,
      farmerId:       f.farmerId,
      farmerName:     f.farmer.user.name,
      location:       f.location,
      crop:           f.crop,
      area:           f.area,
      ndvi:           f.ndvi,
      soilMoisture:   f.soilMoisture,
      lastIrrigation: f.lastIrrigation,
      status:         f.status,
      activeAlerts:   f.alerts.length,
      createdAt:      f.createdAt,
    }))

    res.json({ fields: formatted, total: formatted.length })
  } catch (error) {
    console.error('Get fields error:', error)
    res.status(500).json({ error: 'Failed to fetch fields' })
  }
})

router.get('/mine', protect, async (req: AuthRequest, res: Response) => {
  try {
    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer profile not found' })
      return
    }

    const fields = await prisma.field.findMany({
      where:   { farmerId: farmer.id },
      include: { alerts: true },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ fields, total: fields.length })
  } catch (error) {
    console.error('Get my fields error:', error)
    res.status(500).json({ error: 'Failed to fetch fields' })
  }
})

router.get('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const field = await prisma.field.findUnique({
      where: { id: String(req.params.id) },
      include: {
        farmer: {
          include: {
            user: {
              select: {
                name:  true,
                email: true,
                phone: true,
              },
            },
          },
        },
        alerts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!field) {
      res.status(404).json({ error: 'Field not found' })
      return
    }

    // Any signed-in user could read any field by id, including the owning
    // farmer's email and phone number. Restrict to the owner and admins.
    const farmer = await prisma.farmer.findUnique({
      where:  { userId: req.user!.id },
      select: { id: true },
    })

    const isOwner = farmer?.id === field.farmerId
    const isAdmin = req.user!.role === 'admin'

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'You do not have access to this field' })
      return
    }

    res.json({ field })
  } catch (error) {
    console.error('Get field error:', error)
    res.status(500).json({ error: 'Failed to fetch field' })
  }
})

router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { location, crop, area } = req.body

    if (!location || !crop || !area) {
      res.status(400).json({ error: 'Location, crop and area are required' })
      return
    }

    const validCrops = ['Maize', 'Cassava', 'Tomato', 'Pepper']
    if (!validCrops.includes(crop)) {
      res.status(400).json({ error: 'Crop must be Maize, Cassava, Tomato or Pepper' })
      return
    }

    // `parseFloat` on a non-numeric string yields NaN, which Prisma rejects
    // with an opaque 500. A negative or zero area is meaningless too.
    const parsedArea = parseFloat(area)
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      res.status(400).json({ error: 'Area must be a number greater than zero' })
      return
    }

    const farmer = await prisma.farmer.findUnique({
      where: { userId: req.user!.id },
    })

    if (!farmer) {
      res.status(404).json({ error: 'Farmer profile not found' })
      return
    }

    const field = await prisma.field.create({
      data: {
        farmerId:     farmer.id,
        location,
        crop,
        area:         parsedArea,
        ndvi:         0,
        soilMoisture: 0,
      },
    })

    res.status(201).json({ message: 'Field created successfully', field })
  } catch (error) {
    console.error('Create field error:', error)
    res.status(500).json({ error: 'Failed to create field' })
  }
})

router.patch('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { ndvi, soilMoisture, lastIrrigation, status } = req.body
    const fieldId = String(req.params.id)

    // This route had no ownership check at all: any signed-in user could
    // rewrite any farmer's NDVI, soil moisture and status by guessing an id.
    const existing = await prisma.field.findUnique({
      where:  { id: fieldId },
      select: { id: true, farmerId: true },
    })

    if (!existing) {
      res.status(404).json({ error: 'Field not found' })
      return
    }

    const farmer = await prisma.farmer.findUnique({
      where:  { userId: req.user!.id },
      select: { id: true },
    })

    const isOwner = farmer?.id === existing.farmerId
    const isAdmin = req.user!.role === 'admin'

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'You do not have access to this field' })
      return
    }

    // Every numeric field was passed straight to parseFloat, so a bad value
    // became NaN and surfaced as a 500 instead of a clear validation error.
    const data: Record<string, unknown> = {}

    if (ndvi !== undefined) {
      const parsed = parseFloat(ndvi)
      if (!Number.isFinite(parsed) || parsed < -1 || parsed > 1) {
        res.status(400).json({ error: 'NDVI must be a number between -1 and 1' })
        return
      }
      data.ndvi = parsed
    }

    if (soilMoisture !== undefined) {
      const parsed = parseFloat(soilMoisture)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        res.status(400).json({ error: 'Soil moisture must be a number between 0 and 100' })
        return
      }
      data.soilMoisture = parsed
    }

    if (lastIrrigation !== undefined) {
      const parsed = new Date(lastIrrigation)
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Last irrigation must be a valid date' })
        return
      }
      data.lastIrrigation = parsed
    }

    if (status !== undefined) {
      if (!['active', 'suspended'].includes(status)) {
        res.status(400).json({ error: 'Status must be active or suspended' })
        return
      }
      data.status = status
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' })
      return
    }

    const field = await prisma.field.update({
      where: { id: fieldId },
      data,
    })

    res.json({ message: 'Field updated successfully', field })
  } catch (error) {
    console.error('Update field error:', error)
    res.status(500).json({ error: 'Failed to update field' })
  }
})

export default router