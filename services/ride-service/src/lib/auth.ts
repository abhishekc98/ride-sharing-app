import jwt from 'jsonwebtoken'
import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
  try {
    ;(req as any).user = jwt.verify(auth.slice(7), process.env.JWT_ACCESS_SECRET!)
  } catch {
    return reply.code(401).send({ error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}
