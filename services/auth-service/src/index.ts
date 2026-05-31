import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { initFirebase } from './lib/firebase.js'
import { authRoutes } from './routes/auth.js'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

initFirebase()

await app.register(authRoutes, { prefix: '/api/v1' })

app.setErrorHandler((error, req, reply) => {
  app.log.error(error)
  if (error.validation) {
    return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR', details: error.validation })
  }
  reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
})

const PORT = Number(process.env.PORT ?? 3101)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Auth service running on port ${PORT}`)
