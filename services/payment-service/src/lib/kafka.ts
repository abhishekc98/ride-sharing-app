// Replaced Kafka with Redis Streams via Upstash Redis.
// API is identical — callers use publishEvent() unchanged.
import { Redis } from 'ioredis'

let client: Redis | null = null

function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
  return client
}

export async function publishEvent(stream: string, key: string, data: object): Promise<void> {
  try {
    await getRedis().xadd(stream, '*', 'key', key, 'data', JSON.stringify(data))
  } catch (err) {
    console.error(`[streams] publish error on ${stream}:`, err)
  }
}
