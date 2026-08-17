import { Redis } from 'ioredis'

let client: Redis | null = null

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  }
  return client
}

export async function storeRefreshToken(userId: string, jti: string, ttlSeconds = 2592000) {
  await getRedis().setex(`refresh:${userId}:${jti}`, ttlSeconds, '1')
}

export async function revokeRefreshToken(userId: string, jti: string) {
  await getRedis().del(`refresh:${userId}:${jti}`)
}

export async function isRefreshTokenValid(userId: string, jti: string): Promise<boolean> {
  const val = await getRedis().get(`refresh:${userId}:${jti}`)
  return val === '1'
}

export async function revokeAllUserTokens(userId: string) {
  const keys = await getRedis().keys(`refresh:${userId}:*`)
  if (keys.length > 0) await getRedis().del(...keys)
}
