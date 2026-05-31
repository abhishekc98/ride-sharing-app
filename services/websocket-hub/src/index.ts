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

  // Auto-join user's personal room
  socket.join(`user:${user.sub}`)

  socket.on('join_ride', ({ rideId }: { rideId: string }) => {
    socket.join(`ride:${rideId}`)
  })

  socket.on('leave_ride', ({ rideId }: { rideId: string }) => {
    socket.leave(`ride:${rideId}`)
  })

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${user.sub}`)
  })
})

// Subscribe to Redis pub/sub for location updates
const locationSub = createRedisClient()
await locationSub.connect()

// Subscribe to all driver location channels using pattern
await locationSub.psubscribe('driver:*:location', (message, channel) => {
  const driverId = channel.split(':')[1]
  const data = JSON.parse(message)
  // Broadcast to ride room (rider tracking) and admin ops
  io.to(`driver_tracking:${driverId}`).emit('driver_location', data)
  io.to('admin:ops').emit('driver_location', data)
})

// Subscribe to ride state changes
await locationSub.subscribe('ride:state', (message) => {
  const data = JSON.parse(message)
  io.to(`ride:${data.rideId}`).emit('ride_state', data)
  io.to(`user:${data.riderId}`).emit('ride_state', data)
})

// Subscribe to ride requests (for drivers)
await locationSub.subscribe('ride:request', (message) => {
  const data = JSON.parse(message)
  io.to(`user:${data.driverId}`).emit('ride_request', data)
})

// Subscribe to ride request cancellations
await locationSub.subscribe('ride:request_cancelled', (message) => {
  const data = JSON.parse(message)
  io.to(`user:${data.driverId}`).emit('ride_request_cancelled', data)
})

const PORT = Number(process.env.PORT ?? 3200)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket hub running on port ${PORT}`)
})
