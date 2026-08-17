import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import pkg from 'pg'
import { setDriverRating } from '../lib/redis.js'
const { Pool } = pkg

let pool: pkg.Pool | null = null
const getDb = () => {
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
  })
  return pool
}

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

export async function ratingRoutes(app: FastifyInstance) {
  app.post('/ratings', { preHandler: requireAuth }, async (req, reply) => {
    const user = (req as any).user
    const body = rateSchema.parse(req.body)
    const db = getDb()

    const { rows: [ride] } = await db.query(
      'SELECT * FROM rides WHERE id = $1 AND status = $2 AND (rider_id = $3 OR driver_id = $3)',
      [body.rideId, 'completed', user.sub]
    )
    if (!ride) return reply.code(404).send({ error: 'Ride not found or not completed', code: 'NOT_FOUND' })

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

    if (role === 'rider') {
      const { rows: [{ rating }] } = await db.query(
        `UPDATE drivers SET rating = (
          SELECT ROUND(AVG(score)::numeric, 2) FROM ratings WHERE to_user_id = $1 AND role = 'rider'
        ) WHERE id = $1 RETURNING rating`,
        [body.toUserId]
      )
      await setDriverRating(body.toUserId, Number(rating))
    }

    return reply.code(201).send({ data: rating })
  })

  app.get('/ratings/ride/:rideId', { preHandler: requireAuth }, async (req) => {
    const { rideId } = req.params as { rideId: string }
    const { rows } = await getDb().query('SELECT * FROM ratings WHERE ride_id = $1', [rideId])
    return { data: rows }
  })

  app.get('/ratings/health', async () => ({ status: 'ok' }))
}
