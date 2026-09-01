import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../db/index'

export type AuthRequest = Request & {
  user?: {
    id:    string
    email: string
    role:  string
  }
}

type TokenPayload = { id: string; email: string; role: string }

/**
 * Verifies a Bearer token and returns its payload, or null if it is missing
 * or invalid. `JWT_SECRET` is checked explicitly — casting it with
 * `as string` meant an unset secret produced confusing verify errors
 * instead of an obvious misconfiguration.
 */
function readToken(req: AuthRequest): TokenPayload | null {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  const secret = process.env.JWT_SECRET
  if (!secret) {
    console.error('JWT_SECRET is not configured — rejecting authenticated request')
    return null
  }

  try {
    // Pin the algorithm so a future switch to an asymmetric key cannot be
    // downgraded by an attacker-supplied `alg` header.
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as TokenPayload
  } catch {
    return null
  }
}

/**
 * Loads the caller from the database on every request.
 *
 * The token payload alone is not trustworthy: tokens live for days, so a
 * suspended account kept full access until its token expired, and an admin
 * demoted in the database still passed `adminOnly` (which reads
 * `req.user.role`). Reading role and status from the database makes both take
 * effect immediately.
 */
async function loadUser(payload: TokenPayload) {
  return prisma.user.findUnique({
    where:  { id: payload.id },
    select: { id: true, email: true, role: true, status: true },
  })
}

export async function protect(req: AuthRequest, res: Response, next: NextFunction) {
  const payload = readToken(req)

  if (!payload) {
    res.status(401).json({ error: 'Not authorized — please sign in again' })
    return
  }

  try {
    const user = await loadUser(payload)

    if (!user) {
      res.status(401).json({ error: 'Not authorized — please sign in again' })
      return
    }

    if (user.status === 'suspended') {
      res.status(403).json({
        error: 'Your account has been suspended. Please contact support.',
      })
      return
    }

    req.user = { id: user.id, email: user.email, role: user.role }
    next()
  } catch (err) {
    console.error('Auth lookup failed:', err)
    res.status(500).json({ error: 'Could not verify your session' })
  }
}

/**
 * For endpoints that are usable anonymously but return richer data to a
 * signed-in caller. Never rejects the request.
 */
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const payload = readToken(req)
  if (!payload) {
    next()
    return
  }

  try {
    const user = await loadUser(payload)
    if (user && user.status !== 'suspended') {
      req.user = { id: user.id, email: user.email, role: user.role }
    }
  } catch (err) {
    // Anonymous access is still valid here, so degrade rather than fail.
    console.error('Optional auth lookup failed:', err)
  }

  next()
}
