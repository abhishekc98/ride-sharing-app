import 'dotenv/config'
import Redis from 'ioredis'
import Fastify from 'fastify'
import { initFCM, sendPush, sendToTopic } from './lib/fcm.js'
import pkg from 'pg'
const { Pool } = pkg

initFCM()

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Single Redis client for stream consumption (separate from pub/sub)
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

const GROUP_ID = 'notification-service'
const CONSUMER_ID = `notif-${process.pid}`
const STREAMS = ['ride.state_changed', 'payment.processed']

async function getUserFCMToken(userId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT fcm_token FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] }))
  return rows[0]?.fcm_token ?? null
}

async function handleRideStateChanged(event: any) {
  const { rideId, riderId, status } = event

  const notifications: Record<string, { userId: string; title: string; body: string }> = {
    driver_assigned: { userId: riderId, title: 'Driver Found!', body: 'Your driver is on the way' },
    driver_arrived: { userId: riderId, title: 'Driver Arrived', body: 'Your driver is waiting at pickup' },
    in_progress:    { userId: riderId, title: 'Ride Started',   body: 'Your ride has begun' },
    completed:      { userId: riderId, title: 'Ride Complete',  body: 'Thanks for riding with us!' },
    cancelled:      { userId: riderId, title: 'Ride Cancelled', body: 'Your ride has been cancelled' },
  }

  const notif = notifications[status]
  if (notif) {
    const token = await getUserFCMToken(notif.userId)
    if (token) await sendPush(token, notif.title, notif.body, { rideId, status })
  }

  if (status === 'sos') {
    await sendToTopic('admin-ops', 'SOS Alert', `Ride ${rideId} - emergency`, { rideId })
  }
}

async function handlePaymentProcessed(event: any) {
  const { riderId, amount, rideId } = event
  const token = await getUserFCMToken(riderId)
  if (token) await sendPush(token, 'Payment Confirmed', `Rs.${amount} paid for your ride`, { rideId })
}

async function ensureGroups() {
  for (const stream of STREAMS) {
    try {
      await (redis as any).xgroup('CREATE', stream, GROUP_ID, '$', 'MKSTREAM')
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) {
        console.warn(`[streams] xgroup CREATE ${stream}:`, err.message)
      }
    }
  }
}

async function dispatch(stream: string, id: string, fields: string[]) {
  try {
    const dataStr = fields[fields.indexOf('data') + 1]
    if (!dataStr) { await redis.xack(stream, GROUP_ID, id); return }
    const event = JSON.parse(dataStr)
    if (stream === 'ride.state_changed') await handleRideStateChanged(event)
    if (stream === 'payment.processed')  await handlePaymentProcessed(event)
    await redis.xack(stream, GROUP_ID, id)
  } catch (err) {
    console.error(`[streams] dispatch error ${stream} id=${id}:`, err)
  }
}

async function startConsumer() {
  await redis.connect()
  await ensureGroups()

  // Re-process any un-acked messages from previous runs
  for (const stream of STREAMS) {
    const pending = await (redis as any).xreadgroup(
      'GROUP', GROUP_ID, CONSUMER_ID, 'COUNT', 100, 'STREAMS', stream, '0'
    ).catch(() => null) as Array<[string, Array<[string, string[]]>]> | null
    if (pending) {
      for (const [, msgs] of pending) {
        for (const [id, fields] of msgs) await dispatch(stream, id, fields)
      }
    }
  }

  console.log(`[streams] Notification consumer started — streams: ${STREAMS.join(', ')}`)

  // Main consume loop
  while (true) {
    try {
      const results = await (redis as any).xreadgroup(
        'GROUP', GROUP_ID, CONSUMER_ID,
        'COUNT', 10, 'BLOCK', 5000,
        'STREAMS', ...STREAMS, ...STREAMS.map(() => '>')
      ) as Array<[string, Array<[string, string[]]>]> | null

      if (!results) continue
      for (const [stream, msgs] of results) {
        for (const [id, fields] of msgs) await dispatch(stream, id, fields)
      }
    } catch (err: any) {
      if (err.message?.includes('NOGROUP')) await ensureGroups()
      else {
        console.error('[streams] read error:', err.message)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }
}

// Health check
const app = Fastify({ logger: false })
app.get('/health', async () => ({ status: 'ok' }))
const PORT = Number(process.env.PORT ?? 3109)
await app.listen({ port: PORT, host: '0.0.0.0' })

startConsumer().catch(err => console.error('[streams] consumer failed:', err.message))

console.log(`Notification service running on port ${PORT}`)
