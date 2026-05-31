import Redis from 'ioredis'

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
