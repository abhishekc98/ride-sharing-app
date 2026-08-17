import { Redis } from 'ioredis'

let client: Redis | null = null
export const getRedis = () => {
  if (!client) client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 3 })
  return client
}

export async function getNearbyOnlineDrivers(
  lat: number, lng: number, radiusKm: number, city = 'default'
): Promise<Array<{ driverId: string; distanceKm: number; state: Record<string, string> }>> {
  const redis = getRedis()

  const results = await (redis as any).georadius(
    `drivers:geo:${city}`, lng, lat, radiusKm, 'km', 'ASC', 'WITHDIST', 'COUNT', 20
  ) as [string, string][]

  const drivers = await Promise.all(
    results.map(async ([driverId, dist]) => {
      const state = await redis.hgetall(`driver:${driverId}:state`)
      return { driverId, distanceKm: parseFloat(dist), state }
    })
  )

  // Double-check state hash: GEORADIUS result and state hash must BOTH say online.
  // claimDriver() removes from geo AND sets state to on_ride atomically, but there
  // is a tiny window between the two pipeline commands. Checking both closes it.
  return drivers.filter((d) => d.state.status === 'online')
}

export async function publishRideRequest(driverId: string, data: object) {
  await getRedis().publish('ride:request', JSON.stringify({ ...data, driverId }))
}

export async function publishRideRequestCancelled(driverId: string, rideId: string) {
  await getRedis().publish('ride:request_cancelled', JSON.stringify({ driverId, rideId }))
}

// Record which drivers a ride's request was fanned out to, so ride-service can
// tell the losers to stop waiting the instant one of them accepts, instead of
// leaving their modal to time out client-side after 30s.
export async function storeRideCandidates(rideId: string, driverIds: string[]) {
  if (driverIds.length === 0) return
  const redis = getRedis()
  const key = `ride:${rideId}:candidates`
  await redis.sadd(key, ...driverIds)
  await redis.expire(key, 45) // outlives the 30s client timeout, then self-cleans
}
