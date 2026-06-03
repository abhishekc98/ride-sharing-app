import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { matchRoutes } from './routes/match.js'

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })
await app.register(matchRoutes, { prefix: '/api/v1' })

const PORT = Number(process.env.PORT ?? 3106)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Matching service running on port ${PORT}`)
