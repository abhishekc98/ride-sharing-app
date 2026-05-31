import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import pkg from 'pg'
const { Pool } = pkg

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
})

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })

async function requireAuth(req: any, reply: any) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  try { req.user = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET!) }
  catch { return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' }) }
}

const rateSchema = z.object({
  rideId: z.string(),
  toUserId: z.string(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

app.post('/api/v1/ratings', { preHandler: requireAuth }, async (req, reply) => {
  const user = (req as any).user
  const body = rateSchema.parse(req.body)

  // Verify ride exists and is completed
  const { rows: [ride] } = await db.query(
    'SELECT * FROM rides WHERE id = $1 AND status = $2 AND (rider_id = $3 OR driver_id = $3)',
    [body.rideId, 'completed', user.sub]
  )
  if (!ride) return reply.code(404).send({ error: 'Ride not found or not completed', code: 'NOT_FOUND' })

  // Check rating window (24h)
  const rideEnd = new Date(ride.ended_at)
  if (Date.now() - rideEnd.getTime() > 86400000)
    return reply.code(400).send({ error: 'Rating window has expired', code: 'WINDOW_EXPIRED' })

  const role = ride.rider_id === user.sub ? 'rider' : 'driver'

  const { rows: [rating] } = await db.query(
    `INSERT INTO ratings (ride_id, from_user_id, to_user_id, role, score, comment)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ride_id, from_user_id) DO UPDATE SET score=$5, comment=$6
     RETURNING *`,
    [body.rideId, user.sub, body.toUserId, role, body.score, body.comment ?? null]
  )

  // Update driver rating average
  if (role === 'rider') {
    await db.query(
      `UPDATE drivers SET rating = (
        SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE to_user_id = $1 AND role = 'rider'
      ) WHERE id = $1`,
      [body.toUserId]
    )
  }

  return reply.code(201).send({ data: rating })
})

app.get('/api/v1/ratings/ride/:rideId', { preHandler: requireAuth }, async (req) => {
  const { rideId } = req.params as { rideId: string }
  const { rows } = await db.query('SELECT * FROM ratings WHERE ride_id = $1', [rideId])
  return { data: rows }
})

app.get('/api/v1/ratings/health', async () => ({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3110)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Rating service running on port ${PORT}`)
