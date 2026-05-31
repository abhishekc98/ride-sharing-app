/**
 * k6 Load Test — Ride-Sharing App
 * Run: k6 run tools/load-testing/ride-flow.js
 * Simulates: concurrent riders booking + drivers accepting
 */
import http from 'k6/http'
import { sleep, check } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3100'

// Custom metrics
const rideBookings = new Counter('ride_bookings')
const bookingErrors = new Rate('booking_error_rate')
const bookingLatency = new Trend('booking_latency_ms')

export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Warm up: 5 concurrent riders
    { duration: '1m', target: 20 },   // Ramp to 20 riders
    { duration: '2m', target: 20 },   // Hold at 20 riders
    { duration: '30s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],       // 95% requests under 2s
    booking_error_rate: ['rate<0.05'],       // Less than 5% errors
    booking_latency_ms: ['p(95)<1500'],      // Booking under 1.5s
  },
}

// Dev tokens (bypass Firebase OTP in test)
const DEV_PHONE = '+919999999999'

function getAuthToken(role = 'rider') {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/verify-firebase`,
    JSON.stringify({ firebaseToken: `dev_token_${DEV_PHONE}`, role }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  return res.json('data.accessToken')
}

export default function () {
  const token = getAuthToken('rider')
  if (!token) return

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  // 1. Get fare estimate
  const estimateRes = http.get(
    `${BASE_URL}/api/v1/rides/estimate?pickupLat=12.9716&pickupLng=77.5946&dropLat=12.9352&dropLng=77.6245&vehicleType=bike`,
    { headers }
  )
  check(estimateRes, { 'estimate 200': (r) => r.status === 200 })

  sleep(1)

  // 2. Book a ride
  const start = Date.now()
  const bookRes = http.post(
    `${BASE_URL}/api/v1/rides`,
    JSON.stringify({
      pickupLat: 12.9716, pickupLng: 77.5946, pickupAddress: 'MG Road, Bangalore',
      dropLat: 12.9352, dropLng: 77.6245, dropAddress: 'Koramangala, Bangalore',
      vehicleType: 'bike',
    }),
    { headers }
  )

  const latency = Date.now() - start
  bookingLatency.add(latency)

  const ok = check(bookRes, { 'booking 201': (r) => r.status === 201 })
  rideBookings.add(1)
  bookingErrors.add(!ok)

  sleep(2)
}
