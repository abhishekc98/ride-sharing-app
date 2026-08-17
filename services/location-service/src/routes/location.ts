import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import {
  updateDriverLocation,
  setDriverOnline,
  setDriverOffline,
  getNearbyDrivers,
  getDriverState,
} from '../lib/redis.js'
import { getDb } from '../lib/db.js'

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().optional(),
  speed: z.number().optional(),
  city: z.string().optional(),
})

const pingBuffer: Map<string, { lat: number; lng: number; heading?: number; speed?: number; count: number }> = new Map()
const FLUSH_EVERY = 5

async function requireDriver(req: any, reply: any) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET!) as any
    if (payload.role !== 'driver')
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
    req.user = payload
  } catch {
    return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}

export async function locationRoutes(app: FastifyInstance) {
  app.post('/location/ping', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    const body = pingSchema.parse(req.body)
    const driverId = user.sub

    const existing = pingBuffer.get(driverId)
    const next = {
      lat: body.lat,
      lng: body.lng,
      heading: body.heading,
      speed: body.speed,
      count: (existing?.count ?? 0) + 1,
    }
    pingBuffer.set(driverId, next)

    if (next.count >= FLUSH_EVERY) {
      pingBuffer.delete(driverId)
      await updateDriverLocation(driverId, body.lat, body.lng, body.heading, body.speed, body.city)
    } else {
      // Still publish for real-time tracking even if not flushing to geo
      const { getRedis } = await import('../lib/redis.js')
      await getRedis().publish(
        `driver:${driverId}:location`,
        JSON.stringify({ driverId, lat: body.lat, lng: body.lng, heading: body.heading, speed: body.speed, timestamp: Date.now() })
      )
    }

    return reply.code(200).send({ data: { ok: true } })
  })

  app.post('/location/online', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    const body = pingSchema.parse(req.body)

    const { rows: [driver] } = await getDb().query('SELECT kyc_status FROM drivers WHERE id = $1', [user.sub])
    if (driver?.kyc_status !== 'approved')
      return reply.code(403).send({
        error: 'Complete KYC verification before going online',
        code: 'KYC_NOT_APPROVED',
        kycStatus: driver?.kyc_status ?? 'pending',
      })

    await setDriverOnline(user.sub, body.lat, body.lng, body.city)
    return { data: { status: 'online' } }
  })

  app.post('/location/offline', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    await setDriverOffline(user.sub)
    return { data: { status: 'offline' } }
  })

  app.get('/location/nearby', async (req, reply) => {
    const { lat, lng, radius = '3', city } = req.query as Record<string, string>
    if (!lat || !lng) return reply.code(400).send({ error: 'lat and lng required', code: 'MISSING_PARAMS' })
    const drivers = await getNearbyDrivers(Number(lat), Number(lng), Number(radius), city ?? 'default')
    return { data: drivers }
  })

  app.get('/location/driver/:driverId', async (req) => {
    const { driverId } = req.params as { driverId: string }
    const state = await getDriverState(driverId)
    return { data: state }
  })

  app.get('/location/health', async () => ({ status: 'ok' }))
}
