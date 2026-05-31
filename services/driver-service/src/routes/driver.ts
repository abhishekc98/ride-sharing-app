import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireDriver, requireAuth } from '../lib/auth.js'
import { getDb } from '../lib/db.js'
import { uploadDocument } from '../lib/cloudinary.js'

const vehicleSchema = z.object({
  type: z.enum(['bike', 'auto', 'cab']),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(2000).max(2030),
  plateNo: z.string().min(4),
  color: z.string().min(1),
})

export async function driverRoutes(app: FastifyInstance) {
  // Get own driver profile
  app.get('/drivers/me', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    const db = getDb()
    const { rows } = await db.query(
      `SELECT d.*, v.type as vehicle_type, v.make, v.model, v.year, v.plate_no, v.color,
              u.name, u.phone, u.profile_photo_url, u.wallet_balance
       FROM drivers d
       LEFT JOIN vehicles v ON v.id = d.vehicle_id
       LEFT JOIN users u ON u.id = d.id
       WHERE d.id = $1`,
      [user.sub]
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Driver not found', code: 'NOT_FOUND' })
    return { data: rows[0] }
  })

  // Register as driver (first time)
  app.post('/drivers/register', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const db = getDb()
    await db.query(
      `INSERT INTO drivers (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [user.sub]
    )
    await db.query(`UPDATE users SET role = 'driver' WHERE id = $1`, [user.sub])
    return reply.code(201).send({ data: { message: 'Driver registered' } })
  })

  // Add vehicle
  app.post('/drivers/me/vehicle', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    const body = vehicleSchema.parse(req.body)
    const db = getDb()
    const { rows } = await db.query(
      `INSERT INTO vehicles (driver_id, type, make, model, year, plate_no, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user.sub, body.type, body.make, body.model, body.year, body.plateNo, body.color]
    )
    await db.query('UPDATE drivers SET vehicle_id = $1 WHERE id = $2', [rows[0].id, user.sub])
    return reply.code(201).send({ data: rows[0] })
  })

  // Upload KYC document
  app.post('/drivers/me/kyc/upload', { preHandler: requireDriver }, async (req, reply) => {
    const user = (req as any).user
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file', code: 'NO_FILE' })

    const docType = (req.query as any).type as string
    if (!['selfie', 'license', 'rc', 'insurance'].includes(docType))
      return reply.code(400).send({ error: 'Invalid doc type', code: 'INVALID_DOC_TYPE' })

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const url = await uploadDocument(buffer, user.sub, docType)
    const db = getDb()
    await db.query(
      `UPDATE drivers SET kyc_docs = kyc_docs || $1::jsonb, kyc_status = 'submitted' WHERE id = $2`,
      [JSON.stringify({ [`${docType}Url`]: url }), user.sub]
    )
    return { data: { url, docType } }
  })

  // Driver earnings
  app.get('/drivers/me/earnings', { preHandler: requireDriver }, async (req) => {
    const user = (req as any).user
    const db = getDb()
    const { rows } = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN amount END), 0) as today,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('week', NOW()) THEN amount END), 0) as this_week,
        COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN amount END), 0) as this_month,
        COALESCE(SUM(amount), 0) as total
       FROM wallet_transactions
       WHERE user_id = $1 AND type = 'credit' AND reason = 'ride_payment'`,
      [user.sub]
    )
    const driver = await db.query('SELECT pending_payout FROM drivers WHERE id = $1', [user.sub])
    return { data: { ...rows[0], pendingPayout: driver.rows[0]?.pending_payout ?? 0 } }
  })

  // Trip history for driver
  app.get('/drivers/me/rides', { preHandler: requireDriver }, async (req) => {
    const user = (req as any).user
    const { page = '1', limit = '20' } = req.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const db = getDb()
    const { rows } = await db.query(
      `SELECT r.*, u.name as rider_name FROM rides r
       LEFT JOIN users u ON u.id = r.rider_id
       WHERE r.driver_id = $1 ORDER BY r.requested_at DESC
       LIMIT $2 OFFSET $3`,
      [user.sub, limit, offset]
    )
    return { data: rows }
  })

  app.get('/drivers/health', async () => ({ status: 'ok' }))
}
