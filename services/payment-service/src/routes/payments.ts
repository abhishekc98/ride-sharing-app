import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { getDb } from '../lib/db.js'
import { createOrder, verifyWebhookSignature, verifyPaymentSignature, issueRefund } from '../lib/razorpay.js'
import { publishEvent } from '../lib/kafka.js'

async function requireAuth(req: any, reply: any) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  try { req.user = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET!) }
  catch { return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' }) }
}

async function requireAdmin(req: any, reply: any) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
}

async function requireDriverAuth(req: any, reply: any) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.user?.role !== 'driver') return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
}

const chargeSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string(),
  amount: z.number().positive(),
  forceRazorpay: z.boolean().optional(),
})

const cashConfirmSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string(),
  amount: z.number().positive(),
})

function checkInternal(req: any, reply: any) {
  const internalSecret = req.headers['x-internal-secret']
  if (internalSecret !== process.env.INTERNAL_SERVICE_SECRET && process.env.NODE_ENV === 'production')
    return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })
}

// Shared by the wallet path (confirmed synchronously below) and the Razorpay
// webhook handler (confirmed only once payment.captured actually arrives).
async function creditDriverPayout(db: ReturnType<typeof getDb>, driverId: string, rideId: string, amount: number) {
  const driverEarning = amount * 0.8 // 80% to driver
  await db.query('BEGIN')
  try {
    await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [driverEarning, driverId])
    const driverBal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [driverId])
    await db.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
       VALUES ($1,'credit',$2,$3,'ride_payment',$4,'Ride earnings')`,
      [driverId, driverEarning, driverBal.rows[0].wallet_balance, rideId]
    )
    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    throw err
  }
}

// The one place a captured payment (wallet-immediate, checkout-verified, or
// webhook-confirmed) turns into ride/wallet state. Kept in one place so the
// three callers below can't drift on what "captured" actually does.
async function settleCaptured(db: ReturnType<typeof getDb>, payment: any) {
  // Conditional on the row still being 'pending' — /payments/verify (client)
  // and the Razorpay webhook can both arrive for the same payment while it's
  // pending (the webhook doesn't wait on the client, and vice versa). Each
  // call site checks payment.status before calling this function, but that
  // check is against a stale read; without this guard both callers pass it
  // and creditDriverPayout below runs twice, double-paying the driver.
  const { rowCount } = await db.query(`UPDATE payments SET status = 'captured' WHERE id = $1 AND status = 'pending'`, [payment.id])
  if (rowCount === 0) return // a concurrent caller already settled this payment

  if (payment.purpose === 'wallet_topup') {
    await db.query('BEGIN')
    try {
      await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [payment.amount, payment.user_id])
      const bal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [payment.user_id])
      await db.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
         VALUES ($1,'credit',$2,$3,'wallet_topup',$4,'Wallet top-up')`,
        [payment.user_id, payment.amount, bal.rows[0].wallet_balance, payment.id]
      )
      await db.query('COMMIT')
    } catch (err) {
      await db.query('ROLLBACK')
      throw err
    }
    await publishEvent('payment.processed', payment.id, {
      paymentId: payment.id, riderId: payment.user_id, amount: Number(payment.amount),
      method: 'razorpay', purpose: 'wallet_topup',
    })
    return
  }

  const { rows: [ride] } = await db.query('SELECT driver_id FROM rides WHERE id = $1', [payment.ride_id])
  await db.query(`UPDATE rides SET payment_status = 'paid', payment_method = 'razorpay' WHERE id = $1`, [payment.ride_id])
  if (ride?.driver_id) await creditDriverPayout(db, ride.driver_id, payment.ride_id, Number(payment.amount))

  await publishEvent('payment.processed', payment.id, {
    paymentId: payment.id, rideId: payment.ride_id, riderId: payment.user_id,
    driverId: ride?.driver_id, amount: Number(payment.amount), method: 'razorpay', purpose: 'ride_fare',
  })
}

export async function paymentRoutes(app: FastifyInstance) {
  // Preserve the raw request body alongside the parsed JSON — Razorpay's
  // webhook signature is computed over the exact raw bytes, and re-serializing
  // the parsed object would not reliably reproduce them. Scoped to this plugin's
  // encapsulation context only (Fastify's per-register() boundary), so it does
  // not affect JSON parsing anywhere else in the merged API process.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body as string
    try {
      done(null, (body as string).length ? JSON.parse(body as string) : {})
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  // Internal: charge after ride completion
  app.post('/payments/charge', async (req, reply) => {
    const guard = checkInternal(req, reply); if (guard) return guard

    const body = chargeSchema.parse(req.body)
    const db = getDb()

    // Claim the idempotency key FIRST, before any money moves. Previously
    // this was a SELECT-then-INSERT check — two concurrent /charge calls
    // for the same ride (a genuine risk: ride-service now awaits this call
    // while still holding the ride's lock, but retries or overlapping
    // requests from elsewhere could still land here) would both pass the
    // SELECT, both debit the wallet, and only the *second* INSERT would
    // fail on the unique constraint — after the money had already moved
    // twice. Claiming the row via INSERT ... ON CONFLICT DO NOTHING makes
    // the idempotency key itself the atomic gate: a losing concurrent
    // request bails out here, before touching any balance.
    const claim = await db.query(
      `INSERT INTO payments (ride_id, user_id, amount, method, gateway_ref, idempotency_key, status, purpose)
       VALUES ($1,$2,$3,'pending',NULL,$4,'pending','ride_fare')
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [body.rideId, body.riderId, body.amount, `ride:${body.rideId}`]
    )
    if (claim.rowCount === 0) {
      const { rows: [existing] } = await db.query('SELECT id FROM payments WHERE idempotency_key = $1', [`ride:${body.rideId}`])
      return { data: { message: 'Already charged', paymentId: existing?.id } }
    }
    const paymentId = claim.rows[0].id

    // Try the wallet — unless the rider explicitly asked to pay by card, in
    // which case always go to Razorpay even if the wallet could cover it.
    // The debit is conditional on the balance *at the moment of the
    // update*, not an earlier read, so it can't race with anything else
    // touching this rider's balance (another charge, a refund, ...).
    let method: 'wallet' | 'razorpay' = 'razorpay'
    if (!body.forceRazorpay) {
      await db.query('BEGIN')
      try {
        const debit = await db.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance',
          [body.amount, body.riderId]
        )
        if (debit.rowCount! > 0) {
          await db.query(
            `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
             VALUES ($1,'debit',$2,$3,'ride_payment',$4,'Ride fare')`,
            [body.riderId, body.amount, debit.rows[0].wallet_balance, body.rideId]
          )
          await db.query('COMMIT')
          method = 'wallet'
        } else {
          await db.query('ROLLBACK')
        }
      } catch (err) {
        await db.query('ROLLBACK')
        throw err
      }
    }

    if (method === 'wallet') {
      await db.query(`UPDATE payments SET method = 'wallet', status = 'captured' WHERE id = $1`, [paymentId])
      await db.query('UPDATE rides SET payment_status = $1, payment_method = $2 WHERE id = $3',
        ['paid', 'wallet', body.rideId])
      await creditDriverPayout(db, body.driverId, body.rideId, body.amount)

      await publishEvent('payment.processed', paymentId, {
        paymentId, rideId: body.rideId, riderId: body.riderId,
        driverId: body.driverId, amount: body.amount, method: 'wallet', purpose: 'ride_fare',
      })

      return { data: { paymentId, method: 'wallet', amount: body.amount, status: 'captured' } }
    }

    // Razorpay: create the order, but do NOT mark the ride paid or credit the
    // driver yet — we haven't actually been paid, only asked Razorpay to
    // collect payment. The payment row stays 'pending' until either the
    // client confirms Checkout via /payments/verify, or the
    // /payments/webhook/razorpay route receives and verifies a
    // payment.captured event.
    let gatewayRef: string
    try {
      const order = await createOrder(body.amount, body.rideId)
      gatewayRef = (order as any).id
    } catch (err) {
      console.error('Razorpay order failed:', err)
      // Mark the claimed row failed rather than leaving it stuck 'pending'
      // forever with no gateway_ref and no way to retry (idempotency_key
      // is already taken).
      await db.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [paymentId])
      return reply.code(502).send({ error: 'Payment gateway unavailable', code: 'GATEWAY_ERROR' })
    }

    await db.query(`UPDATE payments SET method = 'razorpay', gateway_ref = $1 WHERE id = $2`, [gatewayRef, paymentId])
    await db.query('UPDATE rides SET payment_method = $1 WHERE id = $2', ['razorpay', body.rideId])

    return {
      data: {
        paymentId, method: 'razorpay', amount: body.amount, status: 'pending',
        orderId: gatewayRef, keyId: process.env.RAZORPAY_KEY_ID,
      },
    }
  })

  // Internal: confirm a cash ride — no gateway or wallet movement, the rider
  // paid the driver directly. Recorded for history/receipts only. The driver
  // does NOT get an in-app wallet credit here — they're already holding the
  // cash, crediting the wallet too would double-pay them.
  app.post('/payments/cash-confirm', async (req, reply) => {
    const guard = checkInternal(req, reply); if (guard) return guard

    const body = cashConfirmSchema.parse(req.body)
    const db = getDb()

    // Same INSERT-first idempotency claim as /payments/charge — a
    // SELECT-then-INSERT check here could record the same cash ride twice
    // under a race, which wouldn't move real money but would still corrupt
    // ride/payment history with a duplicate row.
    const { rows: [payment] } = await db.query(
      `INSERT INTO payments (ride_id, user_id, amount, method, gateway_ref, idempotency_key, status, purpose)
       VALUES ($1,$2,$3,'cash',NULL,$4,'captured','ride_fare')
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [body.rideId, body.riderId, body.amount, `ride:${body.rideId}`]
    )
    if (!payment) {
      const { rows: [existing] } = await db.query('SELECT id FROM payments WHERE idempotency_key = $1', [`ride:${body.rideId}`])
      return { data: { message: 'Already recorded', paymentId: existing?.id } }
    }
    await db.query(`UPDATE rides SET payment_status = 'paid', payment_method = 'cash' WHERE id = $1`, [body.rideId])

    await publishEvent('payment.processed', payment.id, {
      paymentId: payment.id, rideId: body.rideId, riderId: body.riderId,
      driverId: body.driverId, amount: body.amount, method: 'cash', purpose: 'ride_fare',
    })

    return { data: { paymentId: payment.id, method: 'cash', amount: body.amount, status: 'captured' } }
  })

  // Rider tops up their wallet — creates a Razorpay order the client mounts
  // Checkout against directly (there's no ride in the loop here).
  app.post('/payments/wallet/topup', { preHandler: requireAuth }, async (req, reply) => {
    const { amount } = z.object({ amount: z.number().min(10).max(50000) }).parse(req.body)
    const db = getDb()
    const userId = (req as any).user.sub

    let gatewayRef: string | null = null
    try {
      const order = await createOrder(amount, `topup:${userId}:${Date.now()}`)
      gatewayRef = (order as any).id
    } catch (err) {
      console.error('Razorpay order failed:', err)
      return reply.code(502).send({ error: 'Payment gateway unavailable', code: 'GATEWAY_ERROR' })
    }

    const { rows: [payment] } = await db.query(
      `INSERT INTO payments (ride_id, user_id, amount, method, gateway_ref, idempotency_key, status, purpose)
       VALUES (NULL,$1,$2,'razorpay',$3,$4,'pending','wallet_topup') RETURNING id`,
      [userId, amount, gatewayRef, `topup:${crypto.randomUUID()}`]
    )

    return { data: { paymentId: payment.id, orderId: gatewayRef, amount, keyId: process.env.RAZORPAY_KEY_ID } }
  })

  // Client-side confirmation after Razorpay Checkout closes successfully.
  // Works for both a ride-fare payment and a wallet top-up — both flow
  // through the same order/payment/signature shape.
  app.post('/payments/verify', { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({
      razorpay_order_id: z.string(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string(),
    }).parse(req.body)
    const db = getDb()
    const userId = (req as any).user.sub

    const { rows: [payment] } = await db.query('SELECT * FROM payments WHERE gateway_ref = $1', [body.razorpay_order_id])
    if (!payment) return reply.code(404).send({ error: 'Payment not found', code: 'NOT_FOUND' })
    if (payment.user_id !== userId) return reply.code(403).send({ error: 'Forbidden', code: 'FORBIDDEN' })

    if (payment.status === 'captured')
      return { data: { paymentId: payment.id, status: 'captured', message: 'Already confirmed' } }

    const valid = verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)
    if (!valid) return reply.code(400).send({ error: 'Invalid payment signature', code: 'INVALID_SIGNATURE' })

    await db.query('UPDATE payments SET gateway_payment_id = $1 WHERE id = $2', [body.razorpay_payment_id, payment.id])
    await settleCaptured(db, payment)

    return { data: { paymentId: payment.id, status: 'captured' } }
  })

  // Razorpay calls this once the payment actually settles. Kept as the
  // source of truth for server-to-server confirmation (client could close
  // the tab before /payments/verify fires) — in production, with a public
  // webhook URL, this is what guarantees the payment isn't lost.
  app.post('/payments/webhook/razorpay', async (req, reply) => {
    const signature = req.headers['x-razorpay-signature'] as string | undefined
    const rawBody = (req as any).rawBody as string
    if (!verifyWebhookSignature(rawBody, signature))
      return reply.code(400).send({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' })

    const event = req.body as any
    const entity = event?.payload?.payment?.entity
    const orderId: string | undefined = entity?.order_id
    if (!orderId) return reply.code(200).send({ data: { message: 'Ignored — no order id' } })

    const db = getDb()
    const { rows: [payment] } = await db.query('SELECT * FROM payments WHERE gateway_ref = $1', [orderId])
    if (!payment) return reply.code(200).send({ data: { message: 'Ignored — unknown order' } })
    if (payment.status !== 'pending') return { data: { message: 'Already processed' } } // idempotent — Razorpay retries webhooks

    if (event.event === 'payment.captured') {
      if (entity?.id) await db.query('UPDATE payments SET gateway_payment_id = $1 WHERE id = $2', [entity.id, payment.id])
      await settleCaptured(db, payment)
    } else if (event.event === 'payment.failed') {
      await db.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [payment.id])
      if (payment.ride_id) await db.query(`UPDATE rides SET payment_status = 'failed' WHERE id = $1`, [payment.ride_id])
      await publishEvent('payment.failed', payment.id, { paymentId: payment.id, rideId: payment.ride_id })
    }

    return { data: { message: 'ok' } }
  })

  // Admin: refund a captured payment. Razorpay payments go back through the
  // gateway; wallet payments are credited back in-app. Cash never touched
  // the platform's money, so there's nothing here to reverse. Driver
  // earnings already paid out are intentionally NOT clawed back — that's a
  // cost the platform eats, same as most ride-hailing apps at this stage.
  app.post('/payments/:id/refund', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const db = getDb()
    const { rows: [payment] } = await db.query('SELECT * FROM payments WHERE id = $1', [id])
    if (!payment) return reply.code(404).send({ error: 'Payment not found', code: 'NOT_FOUND' })
    if (payment.status !== 'captured')
      return reply.code(400).send({ error: 'Only captured payments can be refunded', code: 'INVALID_STATE' })

    if (payment.method === 'cash')
      return reply.code(400).send({ error: 'Cash payments are settled in person — no in-app refund', code: 'CASH_NOT_REFUNDABLE' })

    if (payment.method === 'razorpay') {
      if (!payment.gateway_payment_id)
        return reply.code(400).send({ error: 'No gateway payment reference on file', code: 'MISSING_GATEWAY_REF' })
      try {
        await issueRefund(payment.gateway_payment_id, Number(payment.amount))
      } catch (err) {
        console.error('Razorpay refund failed:', err)
        return reply.code(502).send({ error: 'Refund failed at gateway', code: 'GATEWAY_ERROR' })
      }
    } else if (payment.method === 'wallet') {
      await db.query('BEGIN')
      try {
        await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [payment.amount, payment.user_id])
        const bal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [payment.user_id])
        await db.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
           VALUES ($1,'credit',$2,$3,'refund',$4,'Ride fare refunded')`,
          [payment.user_id, payment.amount, bal.rows[0].wallet_balance, payment.id]
        )
        await db.query('COMMIT')
      } catch (err) {
        await db.query('ROLLBACK')
        throw err
      }
    }

    await db.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [id])
    if (payment.ride_id) await db.query(`UPDATE rides SET payment_status = 'refunded' WHERE id = $1`, [payment.ride_id])
    await publishEvent('payment.refunded', payment.id, { paymentId: payment.id, rideId: payment.ride_id, amount: Number(payment.amount) })

    return { data: { paymentId: payment.id, status: 'refunded' } }
  })

  // Driver requests a payout — MVP has no bank-transfer integration, so this
  // moves the amount out of the driver's spendable wallet immediately (so it
  // can't also be spent in-app) and queues it for an ops admin to settle by
  // hand once the real bank transfer happens outside the platform.
  app.post('/payments/payout/withdraw', { preHandler: requireDriverAuth }, async (req, reply) => {
    const driverId = (req as any).user.sub
    const db = getDb()
    const { rows: [user] } = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [driverId])
    const balance = Number(user?.wallet_balance ?? 0)

    const { amount } = z.object({ amount: z.number().positive().optional() }).parse(req.body ?? {})
    const payoutAmount = amount ?? balance
    if (payoutAmount <= 0) return reply.code(400).send({ error: 'Nothing to withdraw', code: 'EMPTY_BALANCE' })

    await db.query('BEGIN')
    try {
      // Conditional on the CURRENT balance at commit time, not the `balance`
      // read above — two concurrent withdraw requests (double-tap, retry)
      // both reading that same pre-debit value would otherwise both pass a
      // stale check and both debit, taking the wallet negative with no DB
      // constraint to stop it. This UPDATE only succeeds if the balance
      // still covers it right now; the second racer's UPDATE re-evaluates
      // against the first's already-committed debit and correctly fails.
      const debit = await db.query(
        'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance',
        [payoutAmount, driverId]
      )
      if (debit.rowCount === 0) {
        await db.query('ROLLBACK')
        return reply.code(400).send({ error: 'Amount exceeds wallet balance', code: 'INSUFFICIENT_BALANCE' })
      }
      await db.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, description)
         VALUES ($1,'debit',$2,$3,'payout_requested','Withdrawal to bank requested')`,
        [driverId, payoutAmount, debit.rows[0].wallet_balance]
      )
      const { rows: [payout] } = await db.query(
        `INSERT INTO payout_requests (driver_id, amount) VALUES ($1,$2) RETURNING *`,
        [driverId, payoutAmount]
      )
      await db.query('UPDATE drivers SET pending_payout = pending_payout + $1 WHERE id = $2', [payoutAmount, driverId])
      await db.query('COMMIT')
      return reply.code(201).send({ data: payout })
    } catch (err) {
      await db.query('ROLLBACK')
      throw err
    }
  })

  // Admin: queue of payout requests waiting on a manual bank transfer.
  app.get('/payments/payout/pending', { preHandler: requireAdmin }, async () => {
    const { rows } = await getDb().query(
      `SELECT p.*, u.name as driver_name, u.phone as driver_phone
       FROM payout_requests p JOIN users u ON u.id = p.driver_id
       WHERE p.status = 'requested' ORDER BY p.requested_at ASC`
    )
    return { data: rows }
  })

  // Admin: mark a payout as settled (bank transfer done out-of-band) or
  // rejected (money goes back into the driver's wallet).
  app.post('/payments/payout/:id/settle', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status, note } = z.object({ status: z.enum(['settled', 'rejected']), note: z.string().optional() }).parse(req.body)
    const db = getDb()

    const { rows: [payout] } = await db.query('SELECT * FROM payout_requests WHERE id = $1', [id])
    if (!payout) return reply.code(404).send({ error: 'Payout request not found', code: 'NOT_FOUND' })
    if (payout.status !== 'requested') return reply.code(400).send({ error: 'Already resolved', code: 'INVALID_STATE' })

    await db.query('BEGIN')
    try {
      await db.query(
        `UPDATE payout_requests SET status = $1, note = $2, settled_at = NOW() WHERE id = $3`,
        [status, note ?? null, id]
      )
      await db.query('UPDATE drivers SET pending_payout = pending_payout - $1 WHERE id = $2', [payout.amount, payout.driver_id])
      if (status === 'rejected') {
        await db.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [payout.amount, payout.driver_id])
        const bal = await db.query('SELECT wallet_balance FROM users WHERE id = $1', [payout.driver_id])
        await db.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, reason, ref_id, description)
           VALUES ($1,'credit',$2,$3,'payout_rejected',$4,'Payout request rejected')`,
          [payout.driver_id, payout.amount, bal.rows[0].wallet_balance, id]
        )
      }
      await db.query('COMMIT')
    } catch (err) {
      await db.query('ROLLBACK')
      throw err
    }

    return { data: { id, status } }
  })

  // Get payment for a ride
  app.get('/payments/ride/:rideId', { preHandler: requireAuth }, async (req) => {
    const { rideId } = req.params as { rideId: string }
    const { rows } = await getDb().query('SELECT * FROM payments WHERE ride_id = $1', [rideId])
    return { data: rows[0] ?? null }
  })

  app.get('/payments/health', async () => ({ status: 'ok' }))
}
