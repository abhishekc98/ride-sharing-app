import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { rideRoutes } from './routes/rides.js'

const app = Fastify({ logger: true })
await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(rideRoutes, { prefix: '/api/v1' })

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  if (error.name === 'ZodError') return reply.code(400).send({ error: 'Validation error', code: 'VALIDATION_ERROR' })
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: 'ERROR' })
})

const PORT = Number(process.env.PORT ?? 3105)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Ride service running on port ${PORT}`)
