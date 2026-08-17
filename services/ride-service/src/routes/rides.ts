import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { requireAuth } from '../lib/auth.js'
import { getDb } from '../lib/db.js'
import {
  acquireRideLock, releaseRideLock,
  claimDriver, releaseDriver,
  publishRideState, publishRideRequest, publishRideRequestCancelled,
  setDriverAcceptanceRate, popRideCandidates,
} from '../lib/redis.js'
import { publishEvent } from '../lib/kafka.js'

// Flat fee charged when a rider cancels after the driver has already
// reached the pickup point and waited — compensates the driver for a
// wasted trip. No fee for cancelling earlier (driver_assigned/en_route),
// same grace period real ride-hailing apps give riders.
const CANCELLATION_FEE = 20

const bookSchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string(),
  dropLat: z.number(),
  dropLng: z.number(),
  dropAddress: z.string(),
  vehicleType: z.enum(['bike', 'auto', 'cab']),
  promoCode: z.string().optional(),
  paymentPreference: z.enum(['wallet', 'card', 'cash']).default('wallet'),
})

async function requireAdmin(req: any, reply: any) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
}

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

  // Validate a promo code against a fare amount
  app.get('/rides/promo/validate', { preHandler: requireAuth }, async (req, reply) => {
    const { code, fareAmount } = req.query as Record<string, string>
    try {
      const res = await axios.post(`${process.env.PRICING_SERVICE_URL}/api/v1/pricing/promo/validate`, {
        code, fareAmount: Number(fareAmount),
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

    let promoDiscount = 0
    if (body.promoCode) {
      try {
        const res = await axios.post(`${process.env.PRICING_SERVICE_URL}/api/v1/pricing/promo/validate`, {
          code: body.promoCode, fareAmount: fareEstimate,
        })
        if (res.data.data.valid) {
          promoDiscount = res.data.data.discount
          fareEstimate = Math.max(0, fareEstimate - promoDiscount)
        }
      } catch {}
    }

    const { rows } = await db.query(
      `INSERT INTO rides (rider_id, status, vehicle_type,
        pickup_address, pickup_lat, pickup_lng,
        drop_address, drop_lat, drop_lng,
        fare_estimate, surge_multiplier, promo_code, promo_discount, payment_preference)
       VALUES ($1,'searching',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [user.sub, body.vehicleType, body.pickupAddress, body.pickupLat, body.pickupLng,
       body.dropAddress, body.dropLat, body.dropLng, fareEstimate, surgeMultiplier,
       body.promoCode ?? null, promoDiscount, body.paymentPreference]
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
       WHERE r.id = $1 AND (r.rider_id = $2 OR r.driver_id = $2 OR $3 = 'admin')`,
      [id, user.sub, user.role]
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

  // Admin: all rides, optionally filtered by status
  app.get('/admin/rides', { preHandler: requireAdmin }, async (req) => {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const db = getDb()
    const { rows } = status
      ? await db.query(
          `SELECT r.*, ru.name as rider_name, ru.phone as rider_phone, du.name as driver_name
           FROM rides r LEFT JOIN users ru ON ru.id = r.rider_id LEFT JOIN users du ON du.id = r.driver_id
           WHERE r.status = $1 ORDER BY r.requested_at DESC LIMIT $2 OFFSET $3`,
          [status, limit, offset]
        )
      : await db.query(
          `SELECT r.*, ru.name as rider_name, ru.phone as rider_phone, du.name as driver_name
           FROM rides r LEFT JOIN users ru ON ru.id = r.rider_id LEFT JOIN users du ON du.id = r.driver_id
           ORDER BY r.requested_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        )
    return { data: rows }
  })

  // Admin: platform-wide stats for the analytics dashboard
  app.get('/admin/stats', { preHandler: requireAdmin }, async () => {
    const db = getDb()
    const { rows: [rideStats] } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE true) as total_rides,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_rides,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_rides,
        COALESCE(SUM(fare_final) FILTER (WHERE status = 'completed'), 0) as total_revenue,
        COALESCE(AVG(fare_final) FILTER (WHERE status = 'completed'), 0) as avg_fare
      FROM rides
    `)
    const { rows: [driverStats] } = await db.query(`SELECT COUNT(*) as active_drivers FROM drivers WHERE status = 'online'`)
    return {
      data: {
        totalRides: Number(rideStats.total_rides),
        completedRides: Number(rideStats.completed_rides),
        cancelledRides: Number(rideStats.cancelled_rides),
        totalRevenue: Number(rideStats.total_revenue),
        avgFare: Number(rideStats.avg_fare),
        activeDrivers: Number(driverStats.active_drivers),
      },
    }
  })

  // Cancel ride
  app.post('/rides/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const user = (req as any).user
    const { reason } = (req.body as any) ?? {}
    const db = getDb()

    // Same distributed lock as the driver-action loop below — without it,
    // two concurrent cancel calls (retry, double-tap) both read the ride as
    // still cancellable before either commits, and both run the fee-charge
    // block independently, double-charging the rider and double-crediting
    // the driver.
    const locked = await acquireRideLock(id)
    if (!locked) return reply.code(409).send({ error: 'Ride is being updated', code: 'CONFLICT' })

    try {
      const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [id])
      if (!rows[0]) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' })
      const ride = rows[0]

      if (ride.rider_id !== user.sub && ride.driver_id !== user.sub)
        return reply.code(403).send({ error: 'Not authorized to cancel this ride', code: 'FORBIDDEN' })

      if (!['requested', 'searching', 'driver_assigned', 'en_route', 'driver_arrived'].includes(ride.status))
        return reply.code(400).send({ error: 'Cannot cancel in this state', code: 'INVALID_STATE' })

      const cancelledBy = ride.rider_id === user.sub ? 'rider' : 'driver'

      // Rider bailing after the driver already waited at pickup — charge the
      // fee if the wallet covers it; best-effort otherwise (no debt tracking
      // in this MVP, so a rider with an empty wallet just doesn't get charged).
      let fee = 0
      if (cancelledBy === 'rider' && ride.status === 'driver_arrived' && ride.driver_id) {
        const { rows: [rider] } = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [ride.rider_id])
        if (Number(rider?.wallet_balance ?? 0) >= CANCELLATION_FEE) {
          fee = CANCELLATION_FEE
          await db.query('BEGIN')
          try {
            await db.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [fee, ride.rider_id])
            const riderBal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [ride.rider_id])
            await db.query(
              `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
               VALUES ($1,'debit',$2,$3,'ride_payment',$4,'Cancellation fee')`,
              [ride.rider_id, fee, riderBal.rows[0].wallet_balance, id]
            )
            await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [fee, ride.driver_id])
            const driverBal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [ride.driver_id])
            await db.query(
              `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
               VALUES ($1,'credit',$2,$3,'ride_payment',$4,'Cancellation compensation')`,
              [ride.driver_id, fee, driverBal.rows[0].wallet_balance, id]
            )
            await db.query('COMMIT')
          } catch (err) {
            await db.query('ROLLBACK')
            throw err
          }
        }
      }

      await db.query(
        `UPDATE rides SET status='cancelled', cancelled_by=$1, cancel_reason=$2, cancelled_at=NOW(), cancellation_fee=$3 WHERE id=$4`,
        [cancelledBy, reason, fee, id]
      )

      // If a driver was assigned, put them back online so they can accept other rides
      if (ride.driver_id) {
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
      await publishEvent('ride.state_changed', id, { rideId: id, status: 'cancelled', cancellationFee: fee })
      return { data: { message: 'Ride cancelled', cancellationFee: fee } }
    } finally {
      await releaseRideLock(id)
    }
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

          // Cancel the pending ride request for every OTHER driver who was
          // fanned out to for this ride (matching-service records the candidate
          // set it sent to) — not the accepting driver, whose own request is moot.
          const candidates = await popRideCandidates(id)
          await Promise.all(
            candidates
              .filter((driverId) => driverId !== user.sub)
              .map((driverId) => publishRideRequestCancelled(driverId, id))
          )

          const { rows: [{ acceptance_rate: acceptedRate }] } = await db.query(
            `UPDATE drivers SET acceptance_rate = ROUND((acceptance_rate * 0.9 + 100 * 0.1)::numeric, 2)
             WHERE id = $1 RETURNING acceptance_rate`,
            [user.sub]
          )
          await setDriverAcceptanceRate(user.sub, Number(acceptedRate))

          await publishRideState({
            rideId: id, riderId: ride.rider_id, driverId: user.sub,
            status: 'driver_assigned',
          })
          await publishEvent('ride.state_changed', id, { rideId: id, status: 'driver_assigned', driverId: user.sub })

        } else if (action === 'decline') {
          await publishRideRequestCancelled(user.sub, id)

          const { rows: [{ acceptance_rate: declinedRate }] } = await db.query(
            `UPDATE drivers SET acceptance_rate = ROUND((acceptance_rate * 0.9)::numeric, 2)
             WHERE id = $1 RETURNING acceptance_rate`,
            [user.sub]
          )
          await setDriverAcceptanceRate(user.sub, Number(declinedRate))

          return { data: { message: 'Declined' } }

        } else if (action === 'end') {
          // Without this, a duplicate/retried /end request — landing after
          // the first has already completed the ride but the lock had
          // already been released around a fire-and-forget payment call —
          // would recompute a *different* fare (computeFinalFare depends on
          // elapsed time) and trigger a second charge. Held inside the same
          // lock as the rest of this handler, and completeRide() below is
          // now awaited before the lock releases, so there's no gap left
          // for a duplicate request to land in.
          if (ride.status !== 'in_progress')
            return reply.code(409).send({ error: 'Ride already ended', code: 'ALREADY_COMPLETED' })

          const fareFinal = await computeFinalFare(ride)
          await db.query(
            `UPDATE rides SET status='completed', ended_at=NOW(), fare_final=$1 WHERE id=$2`,
            [fareFinal, id]
          )
          await publishRideState({ rideId: id, riderId: ride.rider_id, driverId: ride.driver_id, status: 'completed' })
          await publishEvent('ride.state_changed', id, { rideId: id, status: 'completed', fareFinal })

          // Restore driver to online at the drop location so they can accept new rides
          await releaseDriver(
            ride.driver_id ?? user.sub,
            parseFloat(ride.drop_lat),
            parseFloat(ride.drop_lng)
          )
          // Awaited (not fire-and-forget) so the ride lock stays held for
          // the duration of the payment call — see the guard above.
          await completeRide({ ...ride, fare_final: fareFinal }, user.sub)

        } else {
          const timestamps: Record<string, string> = { arrived: '', start: 'started_at=NOW(), ' }
          await db.query(
            `UPDATE rides SET ${timestamps[action] || ''}status='${nextStatus}' WHERE id=$1`,
            [id]
          )
          await publishRideState({ rideId: id, riderId: ride.rider_id, driverId: ride.driver_id, status: nextStatus })
          await publishEvent('ride.state_changed', id, { rideId: id, status: nextStatus })
        }

        return { data: { status: nextStatus } }
      } finally {
        await releaseRideLock(id)
      }
    })
  }

  // Internal: matching-service calls this when either (a) matchWithRetry
  // exhausts all 3 attempts with no drivers found, or (b) requests were sent
  // to drivers but none of them accepted within the no-response window.
  // Without this the ride sat in 'searching' forever with no auto-cancel and
  // no rider notification, in either case.
  app.post('/rides/:id/no-drivers-found', async (req, reply) => {
    const internalSecret = req.headers['x-internal-secret']
    if (internalSecret !== process.env.INTERNAL_SERVICE_SECRET && process.env.NODE_ENV === 'production')
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })

    const { id } = req.params as { id: string }
    const { reason } = (req.body as { reason?: string } | undefined) ?? {}
    const db = getDb()
    const { rows } = await db.query('SELECT * FROM rides WHERE id = $1', [id])
    const ride = rows[0]
    if (!ride) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' })

    // Race guard: the ride may have been accepted or cancelled by the rider
    // in between matching giving up and this callback arriving.
    if (ride.status !== 'searching')
      return { data: { message: 'Ride already progressed, ignoring' } }

    await db.query(
      `UPDATE rides SET status='cancelled', cancelled_by='system',
        cancel_reason=$2, cancelled_at=NOW() WHERE id=$1`,
      [id, reason ?? 'No drivers available nearby']
    )
    await publishRideState({ rideId: id, riderId: ride.rider_id, driverId: null, status: 'cancelled' })
    await publishEvent('ride.state_changed', id, { rideId: id, status: 'cancelled', reason: 'no_drivers_found' })
    return { data: { message: 'Ride auto-cancelled — no drivers found' } }
  })

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
    await axios.post(`${process.env.MATCHING_SERVICE_URL ?? 'http://localhost:3000'}/api/v1/match`, {
      rideId: ride.id,
      riderId: ride.rider_id,
      pickupLat: Number(ride.pickup_lat),
      pickupLng: Number(ride.pickup_lng),
      dropLat: Number(ride.drop_lat),
      dropLng: Number(ride.drop_lng),
      vehicleType: ride.vehicle_type,
      fareEstimate: Number(ride.fare_estimate),
    })
  } catch (err) {
    console.error('Matching trigger failed:', err)
  }
}

// Recompute the fare from what actually happened on the trip — real elapsed
// time instead of the pre-ride guess — rather than just charging whatever
// was quoted at booking. Surge stays pinned to what was locked in at
// booking (ride.surge_multiplier) so a surge window opening/closing
// mid-ride can't move the fare after the fact. The promo discount quoted at
// booking carries over unchanged (as an absolute amount, not recomputed).
async function computeFinalFare(ride: any): Promise<number> {
  const startedAt = ride.started_at ? new Date(ride.started_at).getTime() : null
  const actualDurationMinutes = startedAt ? Math.max(1, (Date.now() - startedAt) / 60000) : undefined

  try {
    const res = await axios.get(`${process.env.PRICING_SERVICE_URL}/api/v1/pricing/estimate`, {
      params: {
        pickupLat: ride.pickup_lat, pickupLng: ride.pickup_lng,
        dropLat: ride.drop_lat, dropLng: ride.drop_lng, vehicleType: ride.vehicle_type,
        actualDurationMinutes, surgeMultiplier: Number(ride.surge_multiplier ?? 1),
      },
    })
    return Math.max(0, Math.round(res.data.data.total) - Number(ride.promo_discount ?? 0))
  } catch (err) {
    console.error('Fare recompute failed, falling back to estimate:', err)
    return Number(ride.fare_estimate)
  }
}

async function completeRide(ride: any, driverId: string) {
  const headers = { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? '' }
  try {
    if (ride.payment_preference === 'cash') {
      await axios.post(`${process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3000'}/api/v1/payments/cash-confirm`, {
        rideId: ride.id, riderId: ride.rider_id, driverId, amount: Number(ride.fare_final ?? ride.fare_estimate),
      }, { headers })
    } else {
      await axios.post(`${process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3000'}/api/v1/payments/charge`, {
        rideId: ride.id, riderId: ride.rider_id, driverId,
        amount: Number(ride.fare_final ?? ride.fare_estimate),
        forceRazorpay: ride.payment_preference === 'card',
      }, { headers })
    }
  } catch (err) {
    console.error('Payment trigger failed:', err)
  }
}
