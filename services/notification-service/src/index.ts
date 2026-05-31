import 'dotenv/config'
import { Kafka } from 'kafkajs'
import Fastify from 'fastify'
import { initFCM, sendPush, sendToTopic } from './lib/fcm.js'
import pkg from 'pg'
const { Pool } = pkg

initFCM()

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  ssl: process.env.KAFKA_SSL === 'true',
  sasl: process.env.KAFKA_USERNAME
    ? { mechanism: 'scram-sha-256', username: process.env.KAFKA_USERNAME, password: process.env.KAFKA_PASSWORD! }
    : undefined,
})

const consumer = kafka.consumer({ groupId: 'notification-service' })

async function getUserFCMToken(userId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT fcm_token FROM users WHERE id = $1', [userId]).catch(() => ({ rows: [] }))
  return rows[0]?.fcm_token ?? null
}

async function handleRideStateChanged(event: any) {
  const { rideId, riderId, driverId, status } = event

  const notifications: Record<string, { userId: string; title: string; body: string }> = {
    driver_assigned: { userId: riderId, title: 'Driver Found!', body: 'Your driver is on the way' },
    driver_arrived: { userId: riderId, title: 'Driver Arrived', body: 'Your driver is waiting at pickup' },
    in_progress: { userId: riderId, title: 'Ride Started', body: 'Your ride has begun' },
    completed: { userId: riderId, title: 'Ride Complete', body: 'Thanks for riding with us!' },
    cancelled: { userId: riderId, title: 'Ride Cancelled', body: 'Your ride has been cancelled' },
  }

  const notif = notifications[status]
  if (notif) {
    const token = await getUserFCMToken(notif.userId)
    if (token) await sendPush(token, notif.title, notif.body, { rideId, status })
  }

  // Notify admin on SOS
  if (status === 'sos') {
    await sendToTopic('admin-ops', '🆘 SOS Alert', `Ride ${rideId} - emergency`, { rideId })
  }
}

async function handlePaymentProcessed(event: any) {
  const { riderId, amount, rideId } = event
  const token = await getUserFCMToken(riderId)
  if (token) await sendPush(token, 'Payment Confirmed', `₹${amount} paid for your ride`, { rideId })
}

async function startKafkaConsumer() {
  await consumer.connect()
  await consumer.subscribe({ topics: ['ride.state_changed', 'payment.processed'], fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return
      try {
        const event = JSON.parse(message.value.toString())
        if (topic === 'ride.state_changed') await handleRideStateChanged(event)
        if (topic === 'payment.processed') await handlePaymentProcessed(event)
      } catch (err) {
        console.error(`Error processing ${topic}:`, err)
      }
    },
  })
  console.log('Notification Kafka consumer running')
}

// Health check HTTP server
const app = Fastify({ logger: false })
app.get('/health', async () => ({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 3109)
await app.listen({ port: PORT, host: '0.0.0.0' })

// Start Kafka consumer (non-blocking, retry on failure)
startKafkaConsumer().catch((err) => {
  console.error('Kafka consumer failed (continuing without):', err.message)
})

console.log(`Notification service running on port ${PORT}`)
