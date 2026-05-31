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
export async function publishRideState(data: object) {
  await getRedis().publish('ride:state', JSON.stringify(data))
}
export async function publishRideRequest(driverId: string, data: object) {
  await getRedis().publish('ride:request', JSON.stringify({ ...data, driverId }))
}
export async function publishRideRequestCancelled(driverId: string, rideId: string) {
  await getRedis().publish('ride:request_cancelled', JSON.stringify({ driverId, rideId }))
}
