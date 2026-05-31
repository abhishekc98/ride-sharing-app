import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { verifyFirebaseToken } from '../lib/firebase.js'
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt.js'
import {
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
} from '../lib/redis.js'
import { upsertUser } from '../lib/db.js'

const verifySchema = z.object({
  firebaseToken: z.string().min(1),
  role: z.enum(['rider', 'driver']),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/verify-firebase', async (req, reply) => {
    const body = verifySchema.parse(req.body)

    const { phone } = await verifyFirebaseToken(body.firebaseToken)
    const user = await upsertUser(phone, body.role)

    const jti = crypto.randomUUID()
    const accessToken = signAccessToken({ sub: user.id, role: user.role, phone: user.phone })
    const refreshToken = signRefreshToken({ sub: user.id, jti })

    await storeRefreshToken(user.id, jti)

    return reply.code(200).send({
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role,
          profileComplete: !!user.name,
        },
      },
    })
  })

  app.post('/auth/refresh', async (req, reply) => {
    const body = refreshSchema.parse(req.body)
    const payload = verifyRefreshToken(body.refreshToken)

    const valid = await isRefreshTokenValid(payload.sub, payload.jti)
    if (!valid) return reply.code(401).send({ error: 'Token revoked', code: 'TOKEN_REVOKED' })

    await revokeRefreshToken(payload.sub, payload.jti)

    const newJti = crypto.randomUUID()
    const db = (await import('../lib/db.js')).getDb()
    const { rows } = await db.query('SELECT id, phone, role FROM users WHERE id = $1', [
      payload.sub,
    ])
    if (!rows[0]) return reply.code(401).send({ error: 'User not found', code: 'NOT_FOUND' })

    const user = rows[0]
    const accessToken = signAccessToken({ sub: user.id, role: user.role, phone: user.phone })
    const newRefreshToken = signRefreshToken({ sub: user.id, jti: newJti })
    await storeRefreshToken(user.id, newJti)

    return reply.code(200).send({ data: { accessToken, refreshToken: newRefreshToken } })
  })

  app.post('/auth/logout', {
    preHandler: async (req, reply) => {
      const auth = req.headers.authorization
      if (!auth?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      }
    },
  }, async (req, reply) => {
    const body = refreshSchema.parse(req.body)
    try {
      const payload = verifyRefreshToken(body.refreshToken)
      await revokeRefreshToken(payload.sub, payload.jti)
    } catch {
      // Ignore invalid token on logout
    }
    return reply.code(200).send({ data: { message: 'Logged out' } })
  })

  app.get('/auth/health', async () => ({ status: 'ok' }))
}
