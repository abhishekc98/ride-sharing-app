import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getNearbyOnlineDrivers, publishRideRequest } from '../lib/redis.js'

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

export async function matchRoutes(app: FastifyInstance) {
  app.post('/match', async (req, reply) => {
    const body = matchSchema.parse(req.body)
    reply.code(202).send({ data: { message: 'Matching started' } })
    matchWithRetry(body, 3).catch(console.error)
  })

  app.get('/match/health', async () => ({ status: 'ok' }))
}

export async function matchWithRetry(body: any, radius: number, attempt = 1): Promise<void> {
  const drivers = await getNearbyOnlineDrivers(body.pickupLat, body.pickupLng, radius)

  if (drivers.length === 0) {
    if (attempt < 3) {
      await sleep(20_000)
      return matchWithRetry(body, radius + 3, attempt + 1)
    }
    console.log(`No drivers found for ride ${body.rideId} after ${attempt} attempts`)
    return
  }

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
