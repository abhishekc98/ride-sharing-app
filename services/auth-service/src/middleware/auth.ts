import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyAccessToken } from '../lib/jwt.js'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  }
  try {
    const payload = verifyAccessToken(auth.slice(7))
    ;(req as any).user = payload
  } catch {
    return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}
