const API = 'http://localhost:3000/api/v1'
const log = (...a) => console.log(...a)

async function req(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

async function login(phone, role) {
  const r = await req('POST', '/auth/verify-firebase', { firebaseToken: `dev_token_${phone}`, role })
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r)}`)
  return r.data.data
}

try {
  // 1. Rider login
  const rider = await login('+919000000011', 'rider')
  log('Rider login OK, id:', rider.user.id)
  const rTok = rider.accessToken

  // 2. Driver login + register + vehicle + online
  const driver = await login('+919000000012', 'driver')
  log('Driver login OK, id:', driver.user.id)
  const dTok = driver.accessToken

  log('Driver register:', JSON.stringify(await req('POST', '/drivers/register', {}, dTok)))
  log('Vehicle add:', JSON.stringify((await req('POST', '/drivers/me/vehicle', {
    type: 'bike', make: 'Honda', model: 'Activa', year: 2022, plateNo: 'KA01XY9999', color: 'Red'
  }, dTok)).status))

  const pickup = { lat: 12.9716, lng: 77.5946 }
  const drop = { lat: 12.9352, lng: 77.6245 }

  await req('POST', '/location/online', { lat: pickup.lat + 0.001, lng: pickup.lng + 0.001 }, dTok)
  log('Driver online')

  // 3. Fare estimate
  const est = await req('GET', `/rides/estimate?pickupLat=${pickup.lat}&pickupLng=${pickup.lng}&dropLat=${drop.lat}&dropLng=${drop.lng}&vehicleType=bike`, undefined, rTok)
  log('Fare estimate:', est.status, JSON.stringify(est.data))

  // 4. Book ride
  const ride = await req('POST', '/rides', {
    pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: 'MG Road, Bangalore',
    dropLat: drop.lat, dropLng: drop.lng, dropAddress: 'Koramangala, Bangalore',
    vehicleType: 'bike',
  }, rTok)
  log('Ride booked:', ride.status, ride.data?.data?.id, 'fare_estimate=', ride.data?.data?.fare_estimate)
  const rideId = ride.data?.data?.id
  if (!rideId) throw new Error('no ride id')

  await new Promise(r => setTimeout(r, 1500))

  // 5. Driver accepts, arrives, starts, ends
  log('accept:', JSON.stringify(await req('POST', `/rides/${rideId}/accept`, {}, dTok)))
  log('arrived:', JSON.stringify(await req('POST', `/rides/${rideId}/arrived`, {}, dTok)))
  log('start:', JSON.stringify(await req('POST', `/rides/${rideId}/start`, {}, dTok)))
  log('end:', JSON.stringify(await req('POST', `/rides/${rideId}/end`, {}, dTok)))

  // wait for async payment charge
  await new Promise(r => setTimeout(r, 1500))

  // 6. Check payment record
  const payment = await req('GET', `/payments/ride/${rideId}`, undefined, rTok)
  log('Payment record:', JSON.stringify(payment.data))

  // 7. Rate the driver
  const rating = await req('POST', '/ratings', { rideId, toUserId: driver.user.id, score: 5, comment: 'Great ride!' }, rTok)
  log('Rating:', rating.status, JSON.stringify(rating.data))

  // 8. Ride history shows completed ride with final fare
  const history = await req('GET', '/rides/history', undefined, rTok)
  const completed = history.data?.data?.find(r => r.id === rideId)
  log('History entry:', JSON.stringify({ status: completed?.status, fare_final: completed?.fare_final, payment_status: completed?.payment_status }))

  // 9. Admin login + dashboard data
  const admin = await login('+919000000099', 'admin')
  log('Admin login OK, id:', admin.user.id, 'role:', admin.user.role)
  const aTok = admin.accessToken
  const adminHistory = await req('GET', '/rides/history?limit=5', undefined, aTok)
  log('Admin rides/history:', adminHistory.status, JSON.stringify(adminHistory.data))

  log('\n=== FULL E2E TEST COMPLETE ===')
} catch (e) {
  console.error('E2E TEST FAILED:', e.message)
  process.exit(1)
}
