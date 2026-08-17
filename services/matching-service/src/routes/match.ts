import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getNearbyOnlineDrivers, publishRideRequest, storeRideCandidates } from '../lib/redis.js'

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
    await notifyNoDriversFound(body.rideId, 'No drivers available nearby').catch((err) =>
      console.error(`Failed to notify ride-service of no-drivers-found for ${body.rideId}:`, err)
    )
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
  await storeRideCandidates(body.rideId, scored.map((d) => d.driverId))
  console.log(`Sent ride request to ${scored.length} drivers for ride ${body.rideId}`)

  // Requests were sent, but nothing guarantees any driver responds — a driver
  // ignoring the request just lets RideRequestModal's 30s countdown expire
  // client-side, which never tells the server. Without this the ride sits in
  // 'searching' forever. 35s gives the 30s client countdown room to resolve
  // (accept/decline) first; the no-drivers-found handler already race-guards
  // on ride.status !== 'searching', so an accept in flight wins cleanly.
  setTimeout(() => {
    notifyNoDriversFound(body.rideId, 'Drivers were notified but none responded in time').catch((err) =>
      console.error(`no-response check failed for ride ${body.rideId}:`, err)
    )
  }, NO_RESPONSE_TIMEOUT_MS)
}

const NO_RESPONSE_TIMEOUT_MS = 35_000

async function notifyNoDriversFound(rideId: string, reason: string) {
  const url = `${process.env.RIDE_SERVICE_URL ?? 'http://localhost:3000'}/api/v1/rides/${rideId}/no-drivers-found`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(`ride-service responded ${res.status}`)
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
