import Redis from 'ioredis'
let client: Redis | null = null
export const getRedis = () => {
  if (!client) client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 3 })
  return client
}

export async function acquireRideLock(rideId: string): Promise<boolean> {
  const res = await getRedis().set(`ride:${rideId}:lock`, '1', 'EX', 60, 'NX')
  return res === 'OK'
}
export async function releaseRideLock(rideId: string) {
  await getRedis().del(`ride:${rideId}:lock`)
}

// Atomically mark driver as on_ride and remove from geo index.
// Called immediately on accept to prevent the same driver being matched
// to a second concurrent ride request from another rider.
export async function claimDriver(driverId: string, city = 'default') {
  await getRedis()
    .pipeline()
    .hset(`driver:${driverId}:state`, 'status', 'on_ride')
    .zrem(`drivers:geo:${city}`, driverId)
    .publish('drivers:availability', JSON.stringify({ driverId, status: 'on_ride' }))
    .exec()
}

// Restore driver to online after ride ends or is cancelled.
export async function releaseDriver(driverId: string, lat: number, lng: number, city = 'default') {
  await getRedis()
    .pipeline()
    .hset(`driver:${driverId}:state`, 'status', 'online')
    .geoadd(`drivers:geo:${city}`, lng, lat, driverId)
    .publish('drivers:availability', JSON.stringify({ driverId, status: 'online' }))
    .exec()
}

export async function publishRideState(data: object) {
  await getRedis().publish('ride:state', JSON.stringify(data))
}
export async function publishRideRequest(driverId: string, data: object) {
  await getRedis().publish('ride:request', JSON.stringify({ ...data, driverId }))
}
export async function publishRideRequestCancelled(driverId: string, rideId: string) {
  await getRedis().publish('ride:request_cancelled', JSON.stringify({ driverId, rideId }))
}
