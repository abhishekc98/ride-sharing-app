import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../lib/auth.js'
import { getDb } from '../lib/db.js'

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  profilePhotoUrl: z.string().url().optional(),
})

const addressSchema = z.object({
  label: z.string().min(1).max(50),
  address: z.string().min(5),
  lat: z.number(),
  lng: z.number(),
})

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const db = getDb()
    const { rows } = await db.query(
      'SELECT id, phone, name, email, profile_photo_url, wallet_balance, role, referral_code, created_at FROM users WHERE id = $1',
      [user.sub]
    )
    if (!rows[0]) return reply.code(404).send({ error: 'User not found', code: 'NOT_FOUND' })
    return { data: rows[0] }
  })

  app.put('/users/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = updateSchema.parse(req.body)
    const db = getDb()

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if (body.name) { sets.push(`name = $${i++}`); vals.push(body.name) }
    if (body.email) { sets.push(`email = $${i++}`); vals.push(body.email) }
    if (body.profilePhotoUrl) { sets.push(`profile_photo_url = $${i++}`); vals.push(body.profilePhotoUrl) }
    sets.push(`profile_complete = true, updated_at = NOW()`)
    vals.push(user.sub)

    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, phone, name, email, profile_photo_url, wallet_balance, role`,
      vals
    )
    return { data: rows[0] }
  })

  app.get('/users/me/addresses', { preHandler: requireAuth }, async (req) => {
    const user = (req as any).user
    const { rows } = await getDb().query(
      'SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY created_at DESC',
      [user.sub]
    )
    return { data: rows }
  })

  app.post('/users/me/addresses', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = addressSchema.parse(req.body)
    const { rows } = await getDb().query(
      'INSERT INTO saved_addresses (user_id, label, address, lat, lng) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [user.sub, body.label, body.address, body.lat, body.lng]
    )
    return reply.code(201).send({ data: rows[0] })
  })

  app.delete('/users/me/addresses/:id', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const { id } = req.params as { id: string }
    await getDb().query('DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2', [id, user.sub])
    return reply.code(204).send()
  })

  app.get('/users/me/wallet', { preHandler: requireAuth }, async (req) => {
    const user = (req as any).user
    const db = getDb()
    const [balRes, txRes] = await Promise.all([
      db.query('SELECT wallet_balance FROM users WHERE id = $1', [user.sub]),
      db.query(
        'SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [user.sub]
      ),
    ])
    return { data: { balance: balRes.rows[0]?.wallet_balance ?? 0, transactions: txRes.rows } }
  })

  app.get('/users/health', async () => ({ status: 'ok' }))
}
