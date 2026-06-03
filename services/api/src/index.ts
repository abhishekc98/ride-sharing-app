import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'

// ── Import routes from each service folder (folders stay intact) ─────────────
import { authRoutes }     from '../../auth-service/src/routes/auth.js'
import { userRoutes }     from '../../user-service/src/routes/users.js'
import { driverRoutes }   from '../../driver-service/src/routes/driver.js'
import { locationRoutes } from '../../location-service/src/routes/location.js'
import { rideRoutes }     from '../../ride-service/src/routes/rides.js'
import { matchRoutes }    from '../../matching-service/src/routes/match.js'
import { paymentRoutes }  from '../../payment-service/src/routes/payments.js'
import { ratingRoutes }   from '../../rating-service/src/routes/ratings.js'
import { startConsumer }  from '../../notification-service/src/lib/consumer.js'

// ── Firebase init (used by auth-service) ─────────────────────────────────────
import { initFirebase } from '../../auth-service/src/lib/firebase.js'
initFirebase()

const PORT = Number(process.env.PORT ?? 3000)

// ── Self-pointing env vars ────────────────────────────────────────────────────
// ride-service calls matching + payment via HTTP internally.
// In this merged server they are on the same Fastify instance,
// so we point those calls back to localhost:PORT — no network hop.
process.env.MATCHING_SERVICE_URL = `http://localhost:${PORT}`
process.env.PAYMENT_SERVICE_URL  = `http://localhost:${PORT}`
// PRICING_SERVICE_URL stays pointing to the separate Python service on Render

// ── Server ───────────────────────────────────────────────────────────────────
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

await app.register(helmet)
await app.register(cors, { origin: true })
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

// ── Register all service routes under /api/v1 ────────────────────────────────
// Same prefixes as before — PWAs need zero changes
await app.register(authRoutes,     { prefix: '/api/v1' })
await app.register(userRoutes,     { prefix: '/api/v1' })
await app.register(driverRoutes,   { prefix: '/api/v1' })
await app.register(locationRoutes, { prefix: '/api/v1' })
await app.register(rideRoutes,     { prefix: '/api/v1' })
await app.register(matchRoutes,    { prefix: '/api/v1' })
await app.register(paymentRoutes,  { prefix: '/api/v1' })
await app.register(ratingRoutes,   { prefix: '/api/v1' })

// Root health check
app.get('/health', async () => ({
  status: 'ok',
  services: [
    'auth', 'user', 'driver', 'location',
    'ride', 'matching', 'payment', 'rating', 'notification'
  ]
}))

// ── Start notification consumer as background task ───────────────────────────
// Runs in the same Node.js process alongside the HTTP server
startConsumer().catch(err => {
  console.error('[consumer] failed to start:', err.message)
})

// ── Listen ───────────────────────────────────────────────────────────────────
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`
╔═══════════════════════════════════════════╗
║  RideApp API (merged)  :${PORT}              ║
║  Services: auth, user, driver, location   ║
║           ride, match, payment, rating    ║
║           notification (background)       ║
╚═══════════════════════════════════════════╝
`)
