import Redis from 'ioredis'

let client: Redis | null = null

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    client.on('error', (err) => console.error('Redis error:', err.message))
  }
  return client
}

const GEO_KEY = (city = 'default') => `drivers:geo:${city}`
const STATE_KEY = (driverId: string) => `driver:${driverId}:state`
const LOCATION_CHANNEL = (driverId: string) => `driver:${driverId}:location`

export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number,
  heading?: number,
  speed?: number,
  city = 'default'
) {
  const redis = getRedis()
  const pipeline = redis.pipeline()
  pipeline.geoadd(GEO_KEY(city), lng, lat, driverId)
  pipeline.hset(STATE_KEY(driverId), {
    lat: lat.toString(),
    lng: lng.toString(),
    heading: (heading ?? 0).toString(),
    speed: (speed ?? 0).toString(),
    last_seen: Date.now().toString(),
  })
  pipeline.publish(
    LOCATION_CHANNEL(driverId),
    JSON.stringify({ driverId, lat, lng, heading, speed, timestamp: Date.now() })
  )
  await pipeline.exec()
}

export async function setDriverOnline(driverId: string, lat: number, lng: number, city = 'default') {
  const redis = getRedis()
  await Promise.all([
    redis.geoadd(GEO_KEY(city), lng, lat, driverId),
    redis.hset(STATE_KEY(driverId), { status: 'online', lat, lng, last_seen: Date.now() }),
    redis.publish(`drivers:availability`, JSON.stringify({ driverId, status: 'online' })),
  ])
}

export async function setDriverOffline(driverId: string, city = 'default') {
  const redis = getRedis()
  await Promise.all([
    redis.zrem(GEO_KEY(city), driverId),
    redis.hset(STATE_KEY(driverId), { status: 'offline' }),
    redis.publish(`drivers:availability`, JSON.stringify({ driverId, status: 'offline' })),
  ])
}

export async function getNearbyDrivers(
  lat: number,
  lng: number,
  radiusKm: number,
  city = 'default'
): Promise<Array<{ driverId: string; distanceKm: number }>> {
  const redis = getRedis()
  const results = await (redis as any).georadius(
    GEO_KEY(city),
    lng,
    lat,
    radiusKm,
    'km',
    'ASC',
    'WITHCOORD',
    'WITHDIST',
    'COUNT',
    20
  )
  return (results as any[]).map((r: any) => ({
    driverId: r[0],
    distanceKm: parseFloat(r[1]),
  }))
}

export async function getDriverState(driverId: string) {
  return getRedis().hgetall(STATE_KEY(driverId))
}
