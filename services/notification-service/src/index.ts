import 'dotenv/config'
import Fastify from 'fastify'
import { startConsumer } from './lib/consumer.js'

const app = Fastify({ logger: false })
app.get('/health', async () => ({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3109)
await app.listen({ port: PORT, host: '0.0.0.0' })

startConsumer().catch(err => console.error('[consumer] failed:', err.message))

console.log(`Notification service running on port ${PORT}`)
