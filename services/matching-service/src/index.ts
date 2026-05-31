import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { z } from 'zod'
import { getNearbyOnlineDrivers, publishRideRequest, publishRideRequestCancelled } from './lib/redis.js'

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })

const matchSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropLat: z.number(),
  dropLng: z.number(),
  vehicleType: z.string(),
  fareEstimate: z.number(),
})

const MATCH_TIMEOUT_MS = 30_000
const EXPAND_RADIUS_AFTER_MS = 60_000

app.post('/api/v1/match', async (req, reply) => {
  const body = matchSchema.parse(req.body)

  reply.code(202).send({ data: { message: 'Matching started' } })

  matchWithRetry(body, 3).catch(console.error)
})

async function matchWithRetry(body: any, radius: number, attempt = 1) {
  const drivers = await getNearbyOnlineDrivers(body.pickupLat, body.pickupLng, radius)

  if (drivers.length === 0) {
    if (attempt < 3) {
      await sleep(20_000)
      return matchWithRetry(body, radius + 3, attempt + 1)
    }
    console.log(`No drivers found for ride ${body.rideId} after ${attempt} attempts`)
    return
  }

  // Score drivers: higher = better
  // score = (1/distance) * 0.5 + acceptance_rate * 0.3 + (rating/5) * 0.2
  const scored = drivers
    .map((d) => ({
      ...d,
      score:
        (1 / Math.max(d.distanceKm, 0.1)) * 0.5 +
        (parseFloat(d.state.acceptance_rate ?? '100') / 100) * 0.3 +
        (parseFloat(d.state.rating ?? '5') / 5) * 0.2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  // Fan out to top 3 simultaneously
  const requestPayload = {
    rideId: body.rideId,
    riderId: body.riderId,
    pickupAddress: body.pickupAddress ?? '',
    dropAddress: body.dropAddress ?? '',
    pickupLat: body.pickupLat,
    pickupLng: body.pickupLng,
    dropLat: body.dropLat,
    dropLng: body.dropLng,
    fareEstimate: body.fareEstimate,
    vehicleType: body.vehicleType,
    distanceKm: scored[0].distanceKm,
    timeoutSeconds: 30,
  }

  await Promise.all(scored.map((d) => publishRideRequest(d.driverId, requestPayload)))
  console.log(`Sent ride request to ${scored.length} drivers for ride ${body.rideId}`)
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

app.get('/api/v1/match/health', async () => ({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3106)
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Matching service running on port ${PORT}`)
