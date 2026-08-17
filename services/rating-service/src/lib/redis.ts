import { Redis } from 'ioredis'

let client: Redis | null = null
export const getRedis = () => {
  if (!client) client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 3 })
  return client
}

// Keep the matching-score formula's rating term fed with live data — otherwise
// it always reads the Redis hash's fallback default instead of the real score.
export async function setDriverRating(driverId: string, rating: number) {
  await getRedis().hset(`driver:${driverId}:state`, 'rating', rating.toString())
}
