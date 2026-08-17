import 'dotenv/config'
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import jwt from 'jsonwebtoken'
import { createRedisClient } from './lib/redis.js'

const expressApp = express()
expressApp.get('/health', (_req, res) => res.json({ status: 'ok' }))

const httpServer = http.createServer(expressApp)

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 10000,
})

const pubClient = createRedisClient()
const subClient = createRedisClient()

await pubClient.connect()
await subClient.connect()

io.adapter(createAdapter(pubClient, subClient))

// JWT auth middleware for Socket.io
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token ?? socket.handshake.query.token
    if (!token) return next(new Error('No token'))
    const payload = jwt.verify(token as string, process.env.JWT_ACCESS_SECRET!) as any
    socket.data.user = payload
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

io.on('connection', (socket) => {
  const user = socket.data.user
  console.log(`Connected: ${user.sub} (${user.role})`)

  socket.join(`user:${user.sub}`)

  socket.on('join_ride', ({ rideId }: { rideId: string }) => {
    socket.join(`ride:${rideId}`)
  })

  socket.on('leave_ride', ({ rideId }: { rideId: string }) => {
    socket.leave(`ride:${rideId}`)
  })

  // driver_location is published to driver_tracking:{driverId} (see below) —
  // a rider has to explicitly join that room for their assigned driver, same
  // as join_ride, or the broadcast has nobody listening. Without this, a
  // rider's live driver marker never moved: the event fired, nothing was
  // subscribed to receive it.
  socket.on('track_driver', ({ driverId }: { driverId: string }) => {
    socket.join(`driver_tracking:${driverId}`)
  })

  socket.on('untrack_driver', ({ driverId }: { driverId: string }) => {
    socket.leave(`driver_tracking:${driverId}`)
  })

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${user.sub}`)
  })
})

// Separate Redis client for subscriptions
// ioredis v5: use event listeners, not callbacks in subscribe/psubscribe
const locationSub = createRedisClient()
await locationSub.connect()

// Pattern subscription for GPS location events
locationSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
  try {
    const parts = channel.split(':')
    const driverId = parts[1]
    const data = JSON.parse(message)
    io.to(`driver_tracking:${driverId}`).emit('driver_location', data)
    io.to('admin:ops').emit('driver_location', data)
  } catch {}
})

// Channel subscriptions for ride state events
locationSub.on('message', (channel: string, message: string) => {
  try {
    const data = JSON.parse(message)
    if (channel === 'ride:state') {
      io.to(`ride:${data.rideId}`).emit('ride_state', data)
      if (data.riderId) io.to(`user:${data.riderId}`).emit('ride_state', data)
      // The driver never joins ride:{rideId} (only the rider does, via
      // join_ride) and, before this line, ride:state never reached
      // user:{driverId} either — so a rider-initiated cancel (or any other
      // rider-side state change) had no path to the driver's socket at all.
      // The driver's own action-driven transitions (arrived/start/end)
      // "worked" anyway because those update local state straight from the
      // REST response, never depending on this event — which is exactly
      // what masked this gap until a rider cancel needed to reach the driver.
      if (data.driverId) io.to(`user:${data.driverId}`).emit('ride_state', data)
    }
    if (channel === 'ride:request') {
      io.to(`user:${data.driverId}`).emit('ride_request', data)
    }
    if (channel === 'ride:request_cancelled') {
      io.to(`user:${data.driverId}`).emit('ride_request_cancelled', data)
    }
  } catch {}
})

await locationSub.psubscribe('driver:*:location')
await locationSub.subscribe('ride:state', 'ride:request', 'ride:request_cancelled')

const PORT = Number(process.env.PORT ?? 3200)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket hub running on port ${PORT}`)
})
