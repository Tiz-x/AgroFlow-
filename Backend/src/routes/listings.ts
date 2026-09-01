import { Router, Response } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import prisma from '../db/index'
import { protect, optionalAuth, AuthRequest } from '../middleware/auth'
import {
  sendMatchEmailToBuyer,
  sendMatchEmailToSeller,
  sendWaitlistEmail,
  sendRequestEmailToSeller,
} from '../services/emailService'
import {
  notifyNewListing,
  notifyNewRequest,
  notifyNewListingToAdmins,
  notifyNewOrderToAdmins
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
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Only image files are allowed'))
  },
})

// ── Cloudinary Upload Helper ──────────────────────────────────────────
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'agroflow/listings',
        public_id: publicId,
        transformation: [{ quality: 'auto', fetch_format: 'auto', width: 1200, crop: 'limit' }],
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result!.secure_url)
      }
    )
    stream.end(buffer)
  })
}

const AKURE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Oba-Ile':      { lat: 7.2986, lng: 5.1413 },
  'Ijapo Estate': { lat: 7.2558, lng: 5.1947 },
  'Oke-Aro':      { lat: 7.2621, lng: 5.1823 },
  'Arakale':      { lat: 7.2533, lng: 5.1942 },
  'Isolo':        { lat: 7.2467, lng: 5.2011 },
  'Oda':          { lat: 7.2389, lng: 5.2134 },
  'Oke-Ogba':     { lat: 7.2701, lng: 5.1756 },
  'Ijomu':        { lat: 7.2612, lng: 5.1889 },
  'Ayedun':       { lat: 7.2445, lng: 5.2089 },
  'Alagbaka':     { lat: 7.2578, lng: 5.1934 },
}

function haversineDistance(loc1: string, loc2: string): number {
  const c1 = AKURE_COORDS[loc1]
  const c2 = AKURE_COORDS[loc2]
  if (!c1 || !c2) return 10

  const R = 6371
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.lat * Math.PI) / 180) *
      Math.cos((c2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

// Helper to safely get param as string
const getParam = (param: string | string[] | undefined): string => {
  return Array.isArray(param) ? param[0] : param || ''
}

// Derive a listing's status from what is left of it.
function listingStatusFor(remainingQty: number, totalQty: number) {
  if (remainingQty <= 0) return 'sold' as const
  if (remainingQty < totalQty) return 'partial' as const
  return 'available' as const
}

// Thrown inside a transaction to roll it back when a race is lost.
class AcceptConflict extends Error {
  constructor(public reason: 'already_handled' | 'out_of_stock') {
    super(reason)
    this.name = 'AcceptConflict'
  }
}

// ── HELPER: Create order from match ──────────────────────────────────
async function createOrderFromMatch(matchId: string, buyerId: string, sellerId: string) {
  const order = await prisma.order.create({
    data: {
      matchId,
      buyerId,
      sellerId,
      status: 'placed',
      statusHistory: [
        {
          status: 'placed',
          timestamp: new Date().toISOString(),
          note: 'Order placed'
        }
      ],
      notes: 'Order automatically created from match'
    }
  })

  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        buyer:  { include: { user: true } },
        seller: { include: { user: true } },
      },
    })

    if (match) {
      await notifyNewOrderToAdmins(
        match.cropType,
        match.quantity,
        match.buyer.user.name,
        match.seller.user.name,
        order.id
      )
    }
  } catch (notifyError) {
    console.error('Failed to send admin order notification:', notifyError)
  }

  return order
}

// Helper to ensure seller profile exists
async function ensureSellerProfile(userId: string) {
  let seller = await prisma.seller.findUnique({
    where: { userId },
    include: { user: true },
  })
  
  if (!seller) {
    seller = await prisma.seller.create({
      data: { userId },
      include: { user: true },
    })
  }
  
  return seller
}

// Helper to ensure buyer profile exists
async function ensureBuyerProfile(userId: string) {
  let buyer = await prisma.buyer.findUnique({
    where: { userId },
    include: { user: true },
  })
  
  if (!buyer) {
    buyer = await prisma.buyer.create({
      data: { userId },
      include: { user: true },
    })
  }
  
  return buyer
}

// ── GET ALL LISTINGS ──────────────────────────────────────────────────
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { crop, location } = req.query

    const listings = await prisma.listing.findMany({
      where: {
        status: { not: 'sold' },
        ...(crop && typeof crop === 'string' && { cropType: crop as any }),
        ...(location && typeof location === 'string' && { location }),
      },
      include: {
        seller: { include: { user: { select: { name: true, email: true, phone: true } } } },
        _count: { select: { requests: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const userLocation = (req.query.userLocation as string) || 'Ijapo Estate'
    const isSignedIn = Boolean(req.user)

    const result = listings.map((l: any) => ({
      id:           l.id,
      sellerId:     l.sellerId,
      sellerName:   l.seller.user.name,
      sellerEmail:  isSignedIn ? l.seller.user.email : null,
      sellerPhone:  isSignedIn ? l.seller.user.phone : null,
      cropType:     l.cropType,
      quantity:     l.quantity,
      remainingQty: l.remainingQty,
      location:     l.location,
      description:  l.description,
      photoUrls:    l.photoUrls || [],  // ── FIXED: Multiple photos
      status:       l.status,
      createdAt:    l.createdAt,
      distance:     haversineDistance(l.location, userLocation),
      requestCount: l._count.requests,
      coordinates:  AKURE_COORDS[l.location] || null,
    }))

    res.json({ listings: result, total: result.length })
  } catch (error) {
    console.error('Get listings error:', error)
    res.status(500).json({ error: 'Failed to fetch listings' })
  }
})

// ── POST A LISTING (seller) ──────────────────────────────────────────
const CROP_TYPES = ['Maize', 'Cassava', 'Tomato', 'Pepper'] as const

router.post('/', protect, upload.array('photos', 4), async (req: AuthRequest, res: Response) => {
  try {
    const { cropType, quantity, location, description } = req.body
    const files = req.files as Express.Multer.File[] | undefined

    if (!cropType || !quantity || !location || !description) {
      res.status(400).json({ error: 'cropType, quantity, location and description are required' })
      return
    }

    if (!CROP_TYPES.includes(cropType)) {
      res.status(400).json({ error: `cropType must be one of: ${CROP_TYPES.join(', ')}` })
      return
    }

    const parsedQty = Number(quantity)
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      res.status(400).json({ error: 'Quantity must be a whole number of kilograms greater than zero' })
      return
    }

    if (!files || files.length < 3) {
      res.status(400).json({ error: 'Please upload at least 3 photos of your produce' })
      return
    }

    const seller = await ensureSellerProfile(req.user!.id)

    if (seller.verificationStatus !== 'verified') {
      res.status(403).json({
        error: 'Your seller account must be verified before you can post a listing',
      })
      return
    }

    // ── Upload all photos to Cloudinary ──────────────────────────────────
    const photoUrls = await Promise.all(
      files.map((file, i) =>
        uploadToCloudinary(file.buffer, `listing_${req.user!.id}_${Date.now()}_${i}`)
      )
    )

    const listing = await prisma.listing.create({
      data: {
        sellerId:     seller.id,
        cropType:     cropType as any,
        quantity:     parsedQty,
        remainingQty: parsedQty,
        location,
        description,
        photoUrls,
        status:       'available',
      },
    })

    // ── AUTO-MATCH: check waitlist for matching demands ──
    const matchingDemands = await prisma.demand.findMany({
      where: {
        cropType: cropType as any,
        status:   'pending',
        quantity: { lte: parsedQty },
      },
      include: {
        buyer: { include: { user: true } },
      },
    })

    for (const demand of matchingDemands) {
      const distance = haversineDistance(demand.location, location)
      if (distance > 15) continue

      const match = await prisma.match.create({
        data: {
          listingId:      listing.id,
          demandId:       demand.id,
          cropType:       cropType as any,
          buyerId:        demand.buyerId,
          sellerId:       seller.id,
          quantity:       demand.quantity,
          buyerLocation:  demand.location,
          sellerLocation: location,
          distance,
          status:         'pending',
        },
      })

      await prisma.demand.update({
        where: { id: demand.id },
        data:  { status: 'matched' },
      })

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          remainingQty: { decrement: demand.quantity },
          status: listingStatusFor(parsedQty - demand.quantity, parsedQty),
        },
      })

      try {
        await sendMatchEmailToBuyer({
          buyerName:      demand.buyer.user.name,
          buyerEmail:     demand.buyer.user.email,
          sellerName:     seller.user.name,
          sellerEmail:    seller.user.email,
          sellerPhone:    seller.user.phone || undefined,
          cropType,
          quantity:       demand.quantity,
          sellerLocation: location,
          buyerLocation:  demand.location,
          distance,
          matchId:        match.id,
        })

        await sendMatchEmailToSeller({
          sellerName:     seller.user.name,
          sellerEmail:    seller.user.email,
          buyerName:      demand.buyer.user.name,
          buyerEmail:     demand.buyer.user.email,
          cropType,
          quantity:       demand.quantity,
          buyerLocation:  demand.location,
          sellerLocation: location,
          distance,
          matchId:        match.id,
        })
      } catch (emailError) {
        console.error('Failed to send auto-match emails:', emailError)
      }

      break
    }

    // ── NOTIFY BUYERS ABOUT NEW LISTING ──────────────────────────────────
    try {
      const interestedBuyers = await prisma.buyer.findMany({
        where: {
          userId: { not: req.user!.id },
          demands: {
            some: {
              cropType: listing.cropType as any,
              status: 'pending'
            }
          }
        },
        select: { userId: true }
      })

      const buyerUserIds = [...new Set(interestedBuyers.map(b => b.userId))]

      if (buyerUserIds.length > 0) {
        await notifyNewListing(buyerUserIds, listing.cropType, listing.location)
      }
    } catch (notifyError) {
      console.error('Failed to send buyer notifications:', notifyError)
    }

    // ── NOTIFY ADMINS ABOUT NEW LISTING ──────────────────────────────────
    try {
      await notifyNewListingToAdmins(
        listing.cropType,
        listing.location,
        seller.user.name,
        listing.id
      )
      console.log('🔔 Admin notification sent for new listing')
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError)
    }

    res.status(201).json({
      message: 'Listing posted successfully',
      listing: {
        id:          listing.id,
        cropType:    listing.cropType,
        quantity:    listing.quantity,
        location:    listing.location,
        photoUrls:   listing.photoUrls,
        coordinates: AKURE_COORDS[location] || null,
      },
    })
  } catch (error) {
    console.error('Post listing error:', error)
    res.status(500).json({ error: 'Failed to post listing' })
  }
})

// ── POST A DEMAND (buyer) ──────────────────────────────────────────
router.post('/demand', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { cropType, quantity, location } = req.body

    if (!cropType || !quantity || !location) {
      res.status(400).json({ error: 'cropType, quantity and location are required' })
      return
    }

    if (!CROP_TYPES.includes(cropType)) {
      res.status(400).json({ error: `cropType must be one of: ${CROP_TYPES.join(', ')}` })
      return
    }

    const wantedQty = Number(quantity)
    if (!Number.isInteger(wantedQty) || wantedQty <= 0) {
      res.status(400).json({ error: 'Quantity must be a whole number of kilograms greater than zero' })
      return
    }

    const buyer = await ensureBuyerProfile(req.user!.id)

    const availableListings = await prisma.listing.findMany({
      where: {
        cropType:     cropType as any,
        status:       { not: 'sold' },
        remainingQty: { gte: wantedQty },
        seller:       { userId: { not: req.user!.id } },
      },
      include: {
        seller: { include: { user: true } },
      },
    })

    const nearbyListings = availableListings
      .map((l: any) => ({ ...l, distance: haversineDistance(l.location, location) }))
      .filter((l: any) => l.distance <= 15)
      .sort((a: any, b: any) => a.distance - b.distance)

    let bestListing: any = null

    for (const candidate of nearbyListings) {
      const claim = await prisma.listing.updateMany({
        where: { id: candidate.id, remainingQty: { gte: wantedQty } },
        data:  { remainingQty: { decrement: wantedQty } },
      })

      if (claim.count > 0) {
        bestListing = candidate
        break
      }
    }

    if (bestListing) {
      const fresh = await prisma.listing.findUnique({
        where:  { id: bestListing.id },
        select: { quantity: true, remainingQty: true },
      })

      if (fresh) {
        await prisma.listing.update({
          where: { id: bestListing.id },
          data:  { status: listingStatusFor(fresh.remainingQty, fresh.quantity) },
        })
      }

      const match = await prisma.match.create({
        data: {
          listingId:      bestListing.id,
          cropType:       cropType as any,
          buyerId:        buyer.id,
          sellerId:       bestListing.sellerId,
          quantity:       wantedQty,
          buyerLocation:  location,
          sellerLocation: bestListing.location,
          distance:       bestListing.distance,
          status:         'confirmed',
        },
      })

      try {
        await createOrderFromMatch(match.id, buyer.id, bestListing.sellerId)
      } catch (orderError) {
        console.error('Failed to create order from auto-match:', orderError)
      }

      try {
        await sendMatchEmailToBuyer({
          buyerName:      buyer.user.name,
          buyerEmail:     buyer.user.email,
          sellerName:     bestListing.seller.user.name,
          sellerEmail:    bestListing.seller.user.email,
          sellerPhone:    bestListing.seller.user.phone || undefined,
          cropType,
          quantity:       wantedQty,
          sellerLocation: bestListing.location,
          buyerLocation:  location,
          distance:       bestListing.distance,
          matchId:        match.id,
        })

        await sendMatchEmailToSeller({
          sellerName:     bestListing.seller.user.name,
          sellerEmail:    bestListing.seller.user.email,
          buyerName:      buyer.user.name,
          buyerEmail:     buyer.user.email,
          cropType,
          quantity:       wantedQty,
          buyerLocation:  location,
          sellerLocation: bestListing.location,
          distance:       bestListing.distance,
          matchId:        match.id,
        })
      } catch (emailError) {
        console.error('Failed to send demand match emails:', emailError)
      }

      res.json({
        matched: true,
        match: {
          id:             match.id,
          cropType,
          quantity:       wantedQty,
          sellerName:     bestListing.seller.user.name,
          sellerLocation: bestListing.location,
          buyerLocation:  location,
          distance:       bestListing.distance,
          status:         match.status,
        },
      })
    } else {
      const demand = await prisma.demand.create({
        data: {
          buyerId:  buyer.id,
          cropType: cropType as any,
          quantity: wantedQty,
          location,
          status:   'pending',
        },
      })

      try {
        await sendWaitlistEmail({
          buyerName:  buyer.user.name,
          buyerEmail: buyer.user.email,
          cropType,
          quantity:   wantedQty,
          location,
        })
      } catch (emailError) {
        console.error('Failed to send waitlist email:', emailError)
      }

      res.json({
        matched: false,
        demand: {
          id:       demand.id,
          cropType,
          quantity: wantedQty,
          location,
          status:   'pending',
        },
      })
    }
  } catch (error) {
    console.error('Post demand error:', error)
    res.status(500).json({ error: 'Failed to post demand' })
  }
})

// ── REQUEST TO BUY (manual, buyer clicks on a listing) ────────────
router.post('/:listingId/request', protect, async (req: AuthRequest, res: Response) => {
  try {
    const listingId = getParam(req.params.listingId)
    const { quantity, message, buyerLocation } = req.body

    const requestedQty = Number(quantity)
    if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
      res.status(400).json({ error: 'Enter a whole number of kilograms greater than zero' })
      return
    }

    const buyer = await ensureBuyerProfile(req.user!.id)

    const listing = await prisma.listing.findUnique({
      where:   { id: listingId },
      include: {
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              }
            }
          }
        }
      },
    })

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' })
      return
    }

    if (listing.seller.user.id === req.user!.id) {
      res.status(400).json({ error: 'You cannot request to buy your own listing' })
      return
    }

    if (listing.remainingQty <= 0) {
      res.status(409).json({ error: 'This listing is sold out' })
      return
    }

    if (requestedQty > listing.remainingQty) {
      res.status(400).json({ error: `Only ${listing.remainingQty}kg available` })
      return
    }

    const duplicate = await prisma.listingRequest.findFirst({
      where: { listingId, buyerId: buyer.id, status: 'pending' },
      select: { id: true },
    })

    if (duplicate) {
      res.status(409).json({
        error: 'You already have a pending request on this listing. Wait for the seller to respond.',
      })
      return
    }

    const request = await prisma.listingRequest.create({
      data: {
        listingId:      listingId,
        buyerId:        buyer.id,
        requestedQty:   requestedQty,
        message:        typeof message === 'string' ? message.trim().slice(0, 500) : '',
        buyerLocation:  typeof buyerLocation === 'string' ? buyerLocation.trim() : '',
        status:         'pending',
      },
    })

    try {
      await sendRequestEmailToSeller({
        sellerName:  listing.seller.user.name,
        sellerEmail: listing.seller.user.email,
        buyerName:   buyer.user.name,
        buyerEmail:  buyer.user.email,
        cropType:    listing.cropType,
        quantity:    requestedQty,
        message:     typeof message === 'string' && message.trim() ? message.trim() : undefined,
      })
    } catch (emailError) {
      console.error('Failed to email seller about new request:', emailError)
    }

    try {
      if (listing.seller?.user?.id) {
        await notifyNewRequest(
          listing.seller.user.id,
          listing.cropType,
          requestedQty
        )
      }
    } catch (notifyError) {
      console.error('Failed to send new request notification:', notifyError)
    }

    res.status(201).json({
      message: 'Request sent successfully',
      request: {
        id:           request.id,
        listingId,
        requestedQty: requestedQty,
        status:       'pending',
      },
    })
  } catch (error) {
    console.error('Request to buy error:', error)
    res.status(500).json({ error: 'Failed to send request' })
  }
})

// ── ACCEPT A REQUEST (seller) ──────────────────────────────────────
router.patch('/requests/:requestId/accept', protect, async (req: AuthRequest, res: Response) => {
  try {
    const requestId = getParam(req.params.requestId)
    const { buyerLocation } = req.body

    const request = await prisma.listingRequest.findUnique({
      where:   { id: requestId },
      include: {
        listing: { include: { seller: { include: { user: true } } } },
        buyer:   { include: { user: true } },
      },
    })

    if (!request) {
      res.status(404).json({ error: 'Request not found' })
      return
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.user!.id },
    })

    if (!seller || request.listing.sellerId !== seller.id) {
      res.status(403).json({ error: 'You can only respond to requests on your own listings' })
      return
    }

    if (request.status !== 'pending') {
      res.status(400).json({ error: `This request was already ${request.status}` })
      return
    }

    let claimed: { quantity: number; remainingQty: number }

    try {
      claimed = await prisma.$transaction(async (tx) => {
        const accepted = await tx.listingRequest.updateMany({
          where: { id: requestId, status: 'pending' },
          data:  { status: 'accepted' },
        })

        if (accepted.count === 0) {
          throw new AcceptConflict('already_handled')
        }

        const stock = await tx.listing.updateMany({
          where: { id: request.listingId, remainingQty: { gte: request.requestedQty } },
          data:  { remainingQty: { decrement: request.requestedQty } },
        })

        if (stock.count === 0) {
          throw new AcceptConflict('out_of_stock')
        }

        const fresh = await tx.listing.findUnique({
          where:  { id: request.listingId },
          select: { quantity: true, remainingQty: true },
        })

        if (!fresh) {
          throw new AcceptConflict('out_of_stock')
        }

        await tx.listing.update({
          where: { id: request.listingId },
          data:  { status: listingStatusFor(fresh.remainingQty, fresh.quantity) },
        })

        return fresh
      })
    } catch (claimError) {
      if (claimError instanceof AcceptConflict) {
        res.status(409).json({
          error:
            claimError.reason === 'already_handled'
              ? 'This request has already been handled'
              : 'There is no longer enough stock on this listing to accept this request',
        })
        return
      }
      throw claimError
    }

    const distance = haversineDistance(
      buyerLocation || request.buyerLocation || 'Ijapo Estate',
      request.listing.location
    )

    const match = await prisma.match.create({
      data: {
        listingId:      request.listingId,
        requestId:      request.id,
        cropType:       request.listing.cropType,
        buyerId:        request.buyerId,
        sellerId:       request.listing.sellerId,
        quantity:       request.requestedQty,
        buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
        sellerLocation: request.listing.location,
        distance,
        status:         'confirmed',
      },
    })

    let orderCreated = true

    try {
      await createOrderFromMatch(match.id, request.buyerId, request.listing.sellerId)
    } catch (orderError) {
      orderCreated = false
      console.error('Failed to create order from match:', orderError)
    }

    try {
      await sendMatchEmailToBuyer({
        buyerName:      request.buyer.user.name,
        buyerEmail:     request.buyer.user.email,
        sellerName:     request.listing.seller.user.name,
        sellerEmail:    request.listing.seller.user.email,
        sellerPhone:    request.listing.seller.user.phone || undefined,
        cropType:       request.listing.cropType,
        quantity:       request.requestedQty,
        sellerLocation: request.listing.location,
        buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
        distance,
        matchId:        match.id,
      })

      await sendMatchEmailToSeller({
        sellerName:     request.listing.seller.user.name,
        sellerEmail:    request.listing.seller.user.email,
        buyerName:      request.buyer.user.name,
        buyerEmail:     request.buyer.user.email,
        cropType:       request.listing.cropType,
        quantity:       request.requestedQty,
        buyerLocation:  buyerLocation || request.buyerLocation || 'Ijapo Estate',
        sellerLocation: request.listing.location,
        distance,
        matchId:        match.id,
      })
    } catch (emailError) {
      console.error('Failed to send match emails:', emailError)
    }

    res.json({
      message: orderCreated
        ? 'Request accepted. Match confirmed and order created.'
        : 'Request accepted and match confirmed, but the order could not be created — please check your orders.',
      orderCreated,
      match: {
        id:       match.id,
        cropType: match.cropType,
        quantity: match.quantity,
        distance: match.distance,
        status:   match.status,
      },
      listing: {
        id:           request.listingId,
        quantity:     claimed.quantity,
        remainingQty: claimed.remainingQty,
        status:       listingStatusFor(claimed.remainingQty, claimed.quantity),
      },
    })
  } catch (error) {
    console.error('Accept request error:', error)
    res.status(500).json({ error: 'Failed to accept request' })
  }
})

// ── DECLINE A REQUEST (seller) ──────────────────────────────────────
router.patch('/requests/:requestId/decline', protect, async (req: AuthRequest, res: Response) => {
  try {
    const requestId = getParam(req.params.requestId)

    const request = await prisma.listingRequest.findUnique({
      where:   { id: requestId },
      include: { listing: { select: { sellerId: true } } },
    })

    if (!request) {
      res.status(404).json({ error: 'Request not found' })
      return
    }

    const seller = await prisma.seller.findUnique({
      where: { userId: req.user!.id },
    })

    if (!seller || request.listing.sellerId !== seller.id) {
      res.status(403).json({ error: 'You can only respond to requests on your own listings' })
      return
    }

    if (request.status !== 'pending') {
      res.status(400).json({ error: `This request was already ${request.status}` })
      return
    }

    await prisma.listingRequest.update({
      where: { id: requestId },
      data:  { status: 'rejected' },
    })

    res.json({ message: 'Request declined' })
  } catch (error) {
    console.error('Decline request error:', error)
    res.status(500).json({ error: 'Failed to decline request' })
  }
})

// ── GET MY LISTINGS (seller) ──────────────────────────────────────
router.get('/my/listings', protect, async (req: AuthRequest, res: Response) => {
  try {
    const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } })
    if (!seller) {
      res.json({ listings: [] })
      return
    }

    const listings = await prisma.listing.findMany({
      where:   { sellerId: seller.id },
      include: {
        requests: {
          include: { buyer: { include: { user: { select: { name: true, email: true, phone: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ listings })
  } catch (error) {
    console.error('Get my listings error:', error)
    res.status(500).json({ error: 'Failed to fetch listings' })
  }
})

// ── GET MY MATCHES ──────────────────────────────────────────────────
router.get('/my/matches', protect, async (req: AuthRequest, res: Response) => {
  try {
    const buyer  = await prisma.buyer.findUnique({ where: { userId: req.user!.id } })
    const seller = await prisma.seller.findUnique({ where: { userId: req.user!.id } })

    const matches = await prisma.match.findMany({
      where: {
        OR: [
          ...(buyer  ? [{ buyerId:  buyer.id  }] : []),
          ...(seller ? [{ sellerId: seller.id }] : []),
        ],
      },
      include: {
        buyer:  { include: { user: { select: { name: true, email: true, phone: true } } } },
        seller: { include: { user: { select: { name: true, email: true, phone: true } } } },
        order:  true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ matches })
  } catch (error) {
    console.error('Get matches error:', error)
    res.status(500).json({ error: 'Failed to fetch matches' })
  }
})

// ── GET MY WAITLIST ──────────────────────────────────────────────────
router.get('/my/waitlist', protect, async (req: AuthRequest, res: Response) => {
  try {
    const buyer = await prisma.buyer.findUnique({ where: { userId: req.user!.id } })
    if (!buyer) {
      res.json({ demands: [] })
      return
    }

    const demands = await prisma.demand.findMany({
      where:   { buyerId: buyer.id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ demands })
  } catch (error) {
    console.error('Get waitlist error:', error)
    res.status(500).json({ error: 'Failed to fetch waitlist' })
  }
})

// ── AI RECOMMENDATIONS ENDPOINT ──────────────────────────────────────
router.get('/ai-recommendations', protect, async (req: AuthRequest, res: Response) => {
  try {
    const buyer = await prisma.buyer.findUnique({
      where: { userId: req.user!.id },
      include: { 
        user: true,
        demands: {
          orderBy: { createdAt: 'desc' }
        },
        requests: {
          where: { status: 'accepted' },
          include: { listing: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    })
    
    if (!buyer) {
      res.json({ matches: [], userInfo: null })
      return
    }
    
    const pastPurchases = buyer.requests || []
    const pastDemands = buyer.demands || []
    
    const isNewUser = pastPurchases.length === 0 && pastDemands.length === 0
    
    let preferredCrops: string[] = []
    let preferredLocation = buyer.preferredLocation || buyer.user.location || ''
    let avgQuantity = 0
    let purchaseFrequency = 'occasional'
    
    if (!isNewUser) {
      const purchasedCrops = pastPurchases.map(p => p.listing?.cropType).filter(Boolean)
      const demandedCrops = pastDemands.map(d => d.cropType)
      
      const allCrops = [...purchasedCrops, ...demandedCrops]
      const cropCount: Record<string, number> = {}
      allCrops.forEach(crop => {
        if (crop) cropCount[crop] = (cropCount[crop] || 0) + 1
      })
      preferredCrops = Object.entries(cropCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([crop]) => crop)
      
      const quantities = pastPurchases.map(p => p.requestedQty)
      if (quantities.length > 0) {
        avgQuantity = quantities.reduce((a, b) => a + b, 0) / quantities.length
      }
      
      if (pastPurchases.length > 10) purchaseFrequency = 'frequent'
      else if (pastPurchases.length > 3) purchaseFrequency = 'regular'
      else purchaseFrequency = 'occasional'
    }
    
    const listings = await prisma.listing.findMany({
      where: {
        status: { not: 'sold' },
        remainingQty: { gt: 0 },
      },
      include: {
        seller: { include: { user: true } },
      },
    })
    
    const matches = listings.map(listing => {
      const distance = haversineDistance(preferredLocation || buyer.user.location || 'Ijapo Estate', listing.location)
      let score = 0
      const reasons: string[] = []
      
      if (isNewUser) {
        if (distance <= 3) {
          score += 50
          reasons.push(`Very close to you (${distance}km)`)
        } else if (distance <= 7) {
          score += 35
          reasons.push(`Nearby location (${distance}km)`)
        } else if (distance <= 12) {
          score += 20
          reasons.push(`Within Akure (${distance}km)`)
        } else if (distance <= 15) {
          score += 10
          reasons.push(`Acceptable distance (${distance}km)`)
        }
        
        const popularCrops = ['Maize', 'Cassava', 'Tomato']
        if (popularCrops.includes(listing.cropType)) {
          score += 30
          reasons.push(`Popular crop in your area`)
        } else {
          score += 10
          reasons.push(`${listing.cropType} available`)
        }
        
        if (listing.remainingQty >= 500) {
          score += 20
          reasons.push(`Ample quantity available (${listing.remainingQty}kg)`)
        } else if (listing.remainingQty >= 100) {
          score += 15
          reasons.push(`Good quantity available (${listing.remainingQty}kg)`)
        } else if (listing.remainingQty >= 50) {
          score += 10
          reasons.push(`Moderate quantity available`)
        } else {
          score += 5
          reasons.push(`Limited quantity available`)
        }
      } else {
        if (preferredCrops.includes(listing.cropType)) {
          score += 40
          reasons.push(`You've bought ${listing.cropType} before`)
        } else {
          score += 15
          reasons.push(`Try something new: ${listing.cropType}`)
        }
        
        const maxDistance = buyer.maxDistance || 15
        if (distance <= maxDistance * 0.3) {
          score += 25
          reasons.push(`Very close to your preferred location (${distance}km)`)
        } else if (distance <= maxDistance * 0.6) {
          score += 18
          reasons.push(`Within your preferred distance (${distance}km)`)
        } else if (distance <= maxDistance) {
          score += 10
          reasons.push(`Acceptable distance (${distance}km)`)
        } else {
          reasons.push(`Slightly farther than your preference`)
        }
        
        if (avgQuantity > 0) {
          const quantityRatio = Math.min(listing.remainingQty / avgQuantity, 2)
          if (quantityRatio >= 1) {
            score += 20
            reasons.push(`Meets your typical purchase quantity (${Math.round(avgQuantity)}kg)`)
          } else if (quantityRatio >= 0.6) {
            score += 12
            reasons.push(`Close to your usual purchase size`)
          } else if (quantityRatio >= 0.3) {
            score += 6
            reasons.push(`Smaller portion available`)
          }
        } else {
          score += 15
          reasons.push(`Good quantity available`)
        }
        
        if (buyer.preferredLocation && buyer.preferredLocation === listing.location) {
          score += 10
          reasons.push(`Matches your preferred location`)
        }
        
        score += 5
        reasons.push(`Verified seller on AgroFlow+`)
      }
      
      return {
        listingId: listing.id,
        sellerId: listing.sellerId,
        sellerName: listing.seller.user.name,
        cropType: listing.cropType,
        quantity: listing.remainingQty,
        location: listing.location,
        distance: Math.round(distance * 10) / 10,
        score: Math.min(Math.round(score), 100),
        reasons: reasons.slice(0, 3),
        photoUrls: listing.photoUrls || [],  // ── FIXED: Multiple photos
      }
    })
    
    const topMatches = matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
    
    res.json({ 
      matches: topMatches,
      userInfo: {
        isNewUser,
        preferredCrops: preferredCrops.length > 0 ? preferredCrops : null,
        preferredLocation: preferredLocation || null,
        totalPurchases: pastPurchases.length,
        purchaseFrequency,
        avgQuantity: avgQuantity > 0 ? Math.round(avgQuantity) : null
      }
    })
  } catch (error) {
    console.error('AI recommendations error:', error)
    res.status(500).json({ error: 'Failed to get recommendations' })
  }
})

// ── DELETE A LISTING (seller only) ──────────────────────────────────
router.delete('/:listingId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const listingId = getParam(req.params.listingId)
    
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      include: { seller: true }
    })
    
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' })
      return
    }
    
    const seller = await prisma.seller.findUnique({
      where: { userId: req.user!.id }
    })
    
    if (!seller || listing.sellerId !== seller.id) {
      res.status(403).json({ error: 'You can only delete your own listings' })
      return
    }

    const orderCount = await prisma.order.count({
      where: { match: { listingId } },
    })

    if (orderCount > 0) {
      res.status(409).json({
        error:
          orderCount === 1
            ? 'This listing has an order against it and cannot be deleted. Cancel or complete the order first.'
            : `This listing has ${orderCount} orders against it and cannot be deleted. Cancel or complete them first.`,
      })
      return
    }

    await prisma.listing.delete({
      where: { id: listingId }
    })
    
    res.json({ message: 'Listing deleted successfully' })
  } catch (error) {
    console.error('Delete listing error:', error)
    res.status(500).json({ error: 'Failed to delete listing' })
  }
})

export { haversineDistance, AKURE_COORDS }
export default router