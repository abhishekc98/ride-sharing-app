import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { paymentRoutes } from './routes/payments.js'

const app = Fastify({ logger: true })
await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(paymentRoutes, { prefix: '/api/v1' })

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: 'ERROR' })
})

const PORT = Number(process.env.PORT ?? 3108)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Payment service running on port ${PORT}`)
