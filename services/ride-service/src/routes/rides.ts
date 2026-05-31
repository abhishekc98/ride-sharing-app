import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { requireAuth } from '../lib/auth.js'
import { getDb } from '../lib/db.js'
import {
  acquireRideLock, releaseRideLock,
  claimDriver, releaseDriver,
  publishRideState, publishRideRequest, publishRideRequestCancelled,
} from '../lib/redis.js'
import { publishEvent } from '../lib/kafka.js'

const bookSchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string(),
  dropLat: z.number(),
  dropLng: z.number(),
  dropAddress: z.string(),
  vehicleType: z.enum(['bike', 'auto', 'cab']),
  promoCode: z.string().optional(),
})

export async function rideRoutes(app: FastifyInstance) {
  // Get fare estimate
  app.get('/rides/estimate', { preHandler: requireAuth }, async (req, reply) => {
    const { pickupLat, pickupLng, dropLat, dropLng, vehicleType } = req.query as Record<string, string>
    try {
      const res = await axios.get(`${process.env.PRICING_SERVICE_URL}/api/v1/pricing/estimate`, {
        params: { pickupLat, pickupLng, dropLat, dropLng, vehicleType },
      })
      return { data: res.data.data }
    } catch {
      return reply.code(502).send({ error: 'Pricing service unavailable', code: 'PRICING_ERROR' })
    }
  })

  // Book a ride
  app.post('/rides', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = bookSchema.parse(req.body)
    const db = getDb()

    let fareEstimate = 100, surgeMultiplier = 1
    try {
      const res = await axios.get(`${process.env.PRICING_SERVICE_URL}/api/v1/pricing/estimate`, {
        params: {
          pickupLat: body.pickupLat, pickupLng: body.pickupLng,
          dropLat: body.dropLat, dropLng: body.dropLng, vehicleType: body.vehicleType,
        },
      })
      fareEstimate = res.data.data.total
      surgeMultiplier = res.data.data.surgeMultiplier
    } catch {}

    const { rows } = await db.query(
      `INSERT INTO rides (rider_id, status, vehicle_type,
        pickup_address, pickup_lat, pickup_lng,
        drop_address, drop_lat, drop_lng,
        fare_estimate, surge_multiplier, promo_code)
       VALUES ($1,'searching',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [user.sub, body.vehicleType, body.pickupAddress, body.pickupLat, body.pickupLng,
       body.dropAddress, body.dropLat, body.dropLng, fareEstimate, surgeMultiplier, body.promoCode ?? null]
    )
    const ride = rows[0]

    triggerMatching(ride).catch(console.error)

    await publishEvent('ride.state_changed', ride.id, {
      rideId: ride.id, riderId: user.sub, status: 'searching', vehicleType: body.vehicleType,
    })

    return reply.code(201).send({ data: ride })
  })

  // Get ride by ID
  app.get('/rides/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = (req as any).user
    const { rows } = await getDb().query(
      `SELECT r.*, u.name as driver_name, u.phone as driver_phone, dr.rating as driver_rating,
              v.type as vehicle_type_v, v.make, v.model, v.color, v.plate_no
       FROM rides r
       LEFT JOIN users u ON u.id = r.driver_id
       LEFT JOIN drivers dr ON dr.id = r.driver_id
       LEFT JOIN vehicles v ON v.driver_id = r.driver_id
       WHERE r.id = $1 AND (r.rider_id = $2 OR r.driver_id = $2)`,
      [id, user.sub]
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Ride not found', code: 'NOT_FOUND' })
    return { data: rows[0] }
  })

  // Ride history for rider
  app.get('/rides/history', { preHandler: requireAuth }, async (req) => {
    const user = (req as any).user
    const { page = '1', limit = '20' } = req.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const { rows } = await getDb().query(
      `SELECT * FROM rides WHERE rider_id = $1 ORDER BY requested_at DESC LIMIT $2 OFFSET $3`,
      [user.sub, limit, offset]
    )
    return { data: rows }
  })

  // Cancel ride
  app.post('/rides/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = (req as any).user
    const { reason } = (req.body as any) ?? {}
    const db = getDb()

    const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [id])
    if (!rows[0]) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' })
    const ride = rows[0]

    if (!['requested', 'searching', 'driver_assigned', 'en_route'].includes(ride.status))
      return reply.code(400).send({ error: 'Cannot cancel in this state', code: 'INVALID_STATE' })

    const cancelledBy = ride.rider_id === user.sub ? 'rider' : 'driver'
    await db.query(
      `UPDATE rides SET status='cancelled', cancelled_by=$1, cancel_reason=$2, cancelled_at=NOW() WHERE id=$3`,
      [cancelledBy, reason, id]
    )

    // If a driver was assigned, put them back online so they can accept other rides
    if (ride.driver_id) {
      const driverState = await db.query(
        'SELECT pickup_lat, pickup_lng FROM rides WHERE id = $1', [id]
      )
      // Restore driver to online at their last known position
      const { rows: [driverPos] } = await db.query(
        `SELECT (hstore(d.state))-> 'lat' as lat, (hstore(d.state))->'lng' as lng
         FROM drivers d WHERE d.id = $1`, [ride.driver_id]
      ).catch(() => ({ rows: [{ lat: ride.pickup_lat, lng: ride.pickup_lng }] }))
      await releaseDriver(
        ride.driver_id,
        parseFloat(driverPos?.lat ?? ride.pickup_lat),
        parseFloat(driverPos?.lng ?? ride.pickup_lng)
      )
    }

    await publishRideState({ rideId: id, riderId: ride.rider_id, driverId: ride.driver_id, status: 'cancelled' })
    await publishEvent('ride.state_changed', id, { rideId: id, status: 'cancelled' })
    return { data: { message: 'Ride cancelled' } }
  })

  // Driver actions
  for (const [action, nextStatus] of [
    ['accept', 'driver_assigned'],
    ['arrived', 'driver_arrived'],
    ['start', 'in_progress'],
    ['end', 'completed'],
    ['decline', 'searching'],
  ] as const) {
    app.post(`/rides/:id/${action}`, { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string }
      const user = (req as any).user
      const db = getDb()

      const locked = await acquireRideLock(id)
      if (!locked) return reply.code(409).send({ error: 'Ride is being updated', code: 'CONFLICT' })

      try {
        const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [id])
        if (!rows[0]) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' })
        const ride = rows[0]

        if (action === 'accept') {
          if (ride.status !== 'searching')
            return reply.code(409).send({ error: 'Ride already taken', code: 'ALREADY_TAKEN' })

          // FIX: Atomically claim the driver in Redis BEFORE updating DB.
          // This removes the driver from the geo index and marks them on_ride,
          // so any concurrent GEORADIUS query for another rider will NOT see
          // this driver as available — preventing double-assignment.
          await claimDriver(user.sub)

          await db.query(
            `UPDATE rides SET status='driver_assigned', driver_id=$1, assigned_at=NOW() WHERE id=$2`,
            [user.sub, id]
          )

          // Cancel any other pending ride requests sent to this driver
          // (they may have received requests from multiple concurrent riders)
          await publishRideRequestCancelled(user.sub, id)

          await publishRideState({
            rideId: id, riderId: ride.rider_id, driverId: user.sub,
            status: 'driver_assigned',
          })
          await publishEvent('ride.state_changed', id, { rideId: id, status: 'driver_assigned', driverId: user.sub })

        } else if (action === 'decline') {
          await publishRideRequestCancelled(user.sub, id)
          return { data: { message: 'Declined' } }

        } else {
          const timestamps: Record<string, string> = {
            arrived: '', start: 'started_at=NOW(),', end: 'ended_at=NOW(),',
          }
          await db.query(
            `UPDATE rides SET status='${nextStatus}', ${timestamps[action] || ''} updated_at=NOW() WHERE id=$1`,
            [id]
          )
          await publishRideState({ rideId: id, riderId: ride.rider_id, driverId: ride.driver_id, status: nextStatus })
          await publishEvent('ride.state_changed', id, { rideId: id, status: nextStatus })

          if (action === 'end') {
            // Restore driver to online at the drop location so they can accept new rides
            await releaseDriver(
              ride.driver_id ?? user.sub,
              parseFloat(ride.drop_lat),
              parseFloat(ride.drop_lng)
            )
            completeRide(ride, user.sub).catch(console.error)
          }
        }

        return { data: { status: nextStatus } }
      } finally {
        await releaseRideLock(id)
      }
    })
  }

  // SOS
  app.post('/rides/:id/sos', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string }
    await publishEvent('ride.sos', id, { rideId: id, timestamp: new Date().toISOString() })
    return { data: { message: 'SOS sent' } }
  })

  app.get('/rides/health', async () => ({ status: 'ok' }))
}

async function triggerMatching(ride: any) {
  try {
    await axios.post(`${process.env.MATCHING_SERVICE_URL ?? 'http://localhost:3106'}/api/v1/match`, {
      rideId: ride.id,
      riderId: ride.rider_id,
      pickupLat: ride.pickup_lat,
      pickupLng: ride.pickup_lng,
      dropLat: ride.drop_lat,
      dropLng: ride.drop_lng,
      vehicleType: ride.vehicle_type,
      fareEstimate: ride.fare_estimate,
    })
  } catch (err) {
    console.error('Matching trigger failed:', err)
  }
}

async function completeRide(ride: any, driverId: string) {
  try {
    await axios.post(`${process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3108'}/api/v1/payments/charge`, {
      rideId: ride.id, riderId: ride.rider_id, driverId,
      amount: ride.fare_final ?? ride.fare_estimate,
    })
  } catch (err) {
    console.error('Payment trigger failed:', err)
  }
}
