import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { locationRoutes } from './routes/location.js'

const app = Fastify({ logger: true })
await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(rateLimit, { max: 500, timeWindow: '1 minute' })
await app.register(locationRoutes, { prefix: '/api/v1' })

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: 'ERROR' })
})

const PORT = Number(process.env.PORT ?? 3104)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Location service running on port ${PORT}`)
