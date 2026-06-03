import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ratingRoutes } from './routes/ratings.js'

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })
await app.register(ratingRoutes, { prefix: '/api/v1' })

const PORT = Number(process.env.PORT ?? 3110)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Rating service running on port ${PORT}`)
