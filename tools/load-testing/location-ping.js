/**
 * k6 Load Test — GPS Location Ping Stress Test
 * Run: k6 run tools/load-testing/location-ping.js
 * Simulates: 10 concurrent drivers pinging GPS every 3s
 */
import http from 'k6/http'
import { sleep, check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3104'

export const options = {
  vus: 10,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<500'],  // GPS pings must be fast
    http_req_failed: ['rate<0.01'],
  },
}

function getDriverToken() {
  const res = http.post(
    `${__ENV.AUTH_URL || 'http://localhost:3101'}/api/v1/auth/verify-firebase`,
    JSON.stringify({ firebaseToken: `dev_token_+91900000000${__VU}`, role: 'driver' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  return res.json('data.accessToken')
}

export function setup() {
  return { tokens: Array.from({ length: 10 }, (_, i) => getDriverToken()) }
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length]
  if (!token) return

  // Simulate driver moving around Bangalore
  const lat = 12.9716 + (Math.random() - 0.5) * 0.05
  const lng = 77.5946 + (Math.random() - 0.5) * 0.05

  const res = http.post(
    `${BASE_URL}/api/v1/location/ping`,
    JSON.stringify({ lat, lng, heading: Math.random() * 360, speed: 15 + Math.random() * 20 }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  )

  check(res, { 'ping 200': (r) => r.status === 200 })
  sleep(3) // Ping every 3s
}
