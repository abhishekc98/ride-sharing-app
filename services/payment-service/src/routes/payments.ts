import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { getDb } from '../lib/db.js'
import { createOrder } from '../lib/razorpay.js'
import { publishEvent } from '../lib/kafka.js'

async function requireAuth(req: any, reply: any) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  try { req.user = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET!) }
  catch { return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' }) }
}

const chargeSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string(),
  amount: z.number().positive(),
})

export async function paymentRoutes(app: FastifyInstance) {
  // Internal: charge after ride completion
  app.post('/payments/charge', async (req, reply) => {
    // Internal service call — validate with internal secret
    const internalSecret = req.headers['x-internal-secret']
    if (internalSecret !== process.env.INTERNAL_SERVICE_SECRET && process.env.NODE_ENV === 'production')
      return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })

    const body = chargeSchema.parse(req.body)
    const db = getDb()

    // Check idempotency
    const existing = await db.query('SELECT id FROM payments WHERE idempotency_key = $1', [`ride:${body.rideId}`])
    if (existing.rows[0]) return { data: { message: 'Already charged', paymentId: existing.rows[0].id } }

    // Check wallet balance
    const { rows: [user] } = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [body.riderId])
    const method = (user?.wallet_balance ?? 0) >= body.amount ? 'wallet' : 'razorpay'

    let gatewayRef = null

    if (method === 'wallet') {
      // Deduct from wallet
      await db.query('BEGIN')
      try {
        await db.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [body.amount, body.riderId])
        const balRes = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [body.riderId])
        await db.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
           VALUES ($1,'debit',$2,$3,'ride_payment',$4,'Ride fare')`,
          [body.riderId, body.amount, balRes.rows[0].wallet_balance, body.rideId]
        )
        await db.query('COMMIT')
      } catch (err) {
        await db.query('ROLLBACK')
        throw err
      }
    } else {
      // Create Razorpay order
      try {
        const order = await createOrder(body.amount, body.rideId)
        gatewayRef = (order as any).id
      } catch (err) {
        console.error('Razorpay order failed:', err)
      }
    }

    // Record payment
    const { rows: [payment] } = await db.query(
      `INSERT INTO payments (ride_id, user_id, amount, method, gateway_ref, idempotency_key, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [body.rideId, body.riderId, body.amount, method, gatewayRef, `ride:${body.rideId}`, 'captured']
    )

    // Update ride final fare
    await db.query('UPDATE rides SET fare_final = $1, payment_status = $2, payment_method = $3 WHERE id = $4',
      [body.amount, 'paid', method, body.rideId])

    // Credit driver earnings
    const driverEarning = body.amount * 0.8 // 80% to driver
    await db.query('BEGIN')
    try {
      await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [driverEarning, body.driverId])
      const driverBal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [body.driverId])
      await db.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
         VALUES ($1,'credit',$2,$3,'ride_payment',$4,'Ride earnings')`,
        [body.driverId, driverEarning, driverBal.rows[0].wallet_balance, body.rideId]
      )
      await db.query('COMMIT')
    } catch (err) {
      await db.query('ROLLBACK')
    }

    await publishEvent('payment.processed', payment.id, {
      paymentId: payment.id, rideId: body.rideId, riderId: body.riderId,
      driverId: body.driverId, amount: body.amount, method,
    })

    return { data: { paymentId: payment.id, method, amount: body.amount } }
  })

  // Get payment for a ride
  app.get('/payments/ride/:rideId', { preHandler: requireAuth }, async (req) => {
    const { rideId } = req.params as { rideId: string }
    const { rows } = await getDb().query('SELECT * FROM payments WHERE ride_id = $1', [rideId])
    return { data: rows[0] ?? null }
  })

  app.get('/payments/health', async () => ({ status: 'ok' }))
}
