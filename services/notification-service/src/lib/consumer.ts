import Redis from 'ioredis'
import { initFCM, sendPush, sendToTopic } from './fcm.js'
import pkg from 'pg'
const { Pool } = pkg

const GROUP_ID = 'notification-service'
const STREAMS = ['ride.state_changed', 'payment.processed']

let redis: Redis | null = null
let db: pkg.Pool | null = null

function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3, lazyConnect: true,
  })
  return redis
}

function getDb() {
  if (!db) db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })
  return db
}

async function getUserFCMToken(userId: string): Promise<string | null> {
  const { rows } = await getDb().query('SELECT fcm_token FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] }))
  return rows[0]?.fcm_token ?? null
}

async function handleRideStateChanged(event: any) {
  const { rideId, riderId, status } = event
  const notifications: Record<string, { userId: string; title: string; body: string }> = {
    driver_assigned: { userId: riderId, title: 'Driver Found!', body: 'Your driver is on the way' },
    driver_arrived:  { userId: riderId, title: 'Driver Arrived', body: 'Your driver is waiting at pickup' },
    in_progress:     { userId: riderId, title: 'Ride Started', body: 'Your ride has begun' },
    completed:       { userId: riderId, title: 'Ride Complete', body: 'Thanks for riding with us!' },
    cancelled:       { userId: riderId, title: 'Ride Cancelled', body: 'Your ride has been cancelled' },
  }
  const notif = notifications[status]
  if (notif) {
    const token = await getUserFCMToken(notif.userId)
    if (token) await sendPush(token, notif.title, notif.body, { rideId, status })
  }
  if (status === 'sos') await sendToTopic('admin-ops', 'SOS Alert', `Ride ${rideId}`, { rideId })
}

async function handlePaymentProcessed(event: any) {
  const { riderId, amount, rideId } = event
  const token = await getUserFCMToken(riderId)
  if (token) await sendPush(token, 'Payment Confirmed', `Rs.${amount} paid for your ride`, { rideId })
}

async function ensureGroups(r: Redis) {
  for (const stream of STREAMS) {
    try {
      await (r as any).xgroup('CREATE', stream, GROUP_ID, '$', 'MKSTREAM')
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) console.warn(`[consumer] xgroup ${stream}:`, err.message)
    }
  }
}

async function dispatch(stream: string, id: string, fields: string[], r: Redis) {
  try {
    const dataStr = fields[fields.indexOf('data') + 1]
    if (!dataStr) { await r.xack(stream, GROUP_ID, id); return }
    const event = JSON.parse(dataStr)
    if (stream === 'ride.state_changed') await handleRideStateChanged(event)
    if (stream === 'payment.processed')  await handlePaymentProcessed(event)
    await r.xack(stream, GROUP_ID, id)
  } catch (err) {
    console.error(`[consumer] dispatch error ${stream} id=${id}:`, err)
  }
}

export async function startConsumer(): Promise<void> {
  initFCM()
  const r = getRedis()
  await r.connect()
  await ensureGroups(r)

  const consumerId = `notif-${process.pid}`

  // Re-process unacknowledged messages
  for (const stream of STREAMS) {
    const pending = await (r as any).xreadgroup(
      'GROUP', GROUP_ID, consumerId, 'COUNT', 100, 'STREAMS', stream, '0'
    ).catch(() => null) as Array<[string, Array<[string, string[]]>]> | null
    if (pending) {
      for (const [, msgs] of pending) {
        for (const [id, fields] of msgs) await dispatch(stream, id, fields, r)
      }
    }
  }

  console.log(`[consumer] Listening on streams: ${STREAMS.join(', ')}`)

  while (true) {
    try {
      const results = await (r as any).xreadgroup(
        'GROUP', GROUP_ID, consumerId,
        'COUNT', 10, 'BLOCK', 5000,
        'STREAMS', ...STREAMS, ...STREAMS.map(() => '>')
      ) as Array<[string, Array<[string, string[]]>]> | null

      if (!results) continue
      for (const [stream, msgs] of results) {
        for (const [id, fields] of msgs) await dispatch(stream, id, fields, r)
      }
    } catch (err: any) {
      if (err.message?.includes('NOGROUP')) await ensureGroups(r)
      else {
        console.error('[consumer] read error:', err.message)
        await new Promise(res => setTimeout(res, 2000))
      }
    }
  }
}
