import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { driverRoutes } from './routes/driver.js'

const app = Fastify({ logger: true })
await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
await app.register(driverRoutes, { prefix: '/api/v1' })

app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: 'ERROR' })
})

const PORT = Number(process.env.PORT ?? 3103)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Driver service running on port ${PORT}`)
