'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'
import { useDriverSocket } from '@/hooks/useDriverSocket'
import { useGPSPing, SIMULATE_GPS, SIM_DEFAULT_SEED } from '@/hooks/useGPSPing'
import { RideRequestModal } from '@/components/ride/RideRequestModal'

const DriverMap = dynamic(() => import('@/components/map/DriverMap'), { ssr: false })

export default function DriverHomePage() {
  const router = useRouter()
  const { user, _hasHydrated, isOnline, setOnline, currentRide, setRideStatus } = useDriverStore()
  const [earnings, setEarnings] = useState<any>(null)
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)

  useDriverSocket()
  // useGPSPing owns position AND the route to the current leg together (see
  // its own comments) — that's what keeps the drawn line and the moving
  // marker in sync, and what makes the simulator walk actual roads instead
  // of a straight line through buildings.
  const { position: livePosition, route } = useGPSPing()
  // useGPSPing only tracks while online (no point pinging otherwise) — pos
  // is the idle/pre-online seed so the map and "Go Online" have something to
  // work with before that; livePosition takes over the instant it's online.
  const displayPos = livePosition ?? pos

  const [kycReady, setKycReady] = useState(false)

  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) { router.replace('/login'); return }
    api.get('/api/v1/drivers/me')
      .then((r) => {
        if (r.data.data.kyc_status === 'approved') setKycReady(true)
        else router.replace('/onboarding')
      })
      .catch(() => router.replace('/onboarding'))
  }, [user, _hasHydrated])

  // These two must stay above the `!_hasHydrated` early return below — every
  // hook in a component has to run on every render regardless of any
  // conditional return in between, or React loses track of hook order across
  // the first render (before hydration) vs. later ones (after), which is
  // exactly what was throwing "Rendered more hooks than during the previous
  // render" and breaking the GPS simulator along with it.
  useEffect(() => {
    // Simulated GPS ignores real position entirely (see useGPSPing) — seeding
    // "Go Online" from the browser's real location here would put the driver
    // wherever the laptop actually is, outside matching radius of whatever
    // pickup gets picked in the rider app during local testing.
    if (SIMULATE_GPS) {
      setPos(SIM_DEFAULT_SEED)
      return
    }
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos(SIM_DEFAULT_SEED)
    )
  }, [])

  useEffect(() => {
    api.get('/api/v1/drivers/me/earnings').then((r) => setEarnings(r.data.data)).catch(() => {})
  }, [])

  if (!_hasHydrated || !kycReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-900">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const toggleOnline = async () => {
    if (!displayPos) return alert('Waiting for GPS...')
    try {
      if (isOnline) {
        await api.post('/api/v1/location/offline')
        setOnline(false)
      } else {
        await api.post('/api/v1/location/online', { lat: displayPos.lat, lng: displayPos.lng })
        setOnline(true)
      }
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed')
    }
  }

  const updateRideStatus = async (action: string) => {
    if (!currentRide) return
    try {
      await api.post(`/api/v1/rides/${currentRide.id}/${action}`)
      const statusMap: Record<string, string> = {
        arrived: 'driver_arrived', start: 'in_progress', end: 'completed',
      }
      setRideStatus(statusMap[action] ?? action)
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Action failed')
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-100">
      <DriverMap
        center={displayPos ? [displayPos.lat, displayPos.lng] : undefined}
        driverPos={displayPos ? [displayPos.lat, displayPos.lng] : undefined}
        pickupPos={currentRide?.pickupLat != null ? [currentRide.pickupLat, currentRide.pickupLng!] : undefined}
        dropPos={currentRide?.dropLat != null ? [currentRide.dropLat, currentRide.dropLng!] : undefined}
        route={route ?? undefined}
        className="absolute inset-0 h-full w-full z-0"
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
        <div className="bg-white rounded-2xl px-4 py-2 shadow">
          <span className="text-orange-500 font-bold">🛵 Driver</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/earnings')}
            className="bg-white rounded-2xl px-3 py-2 shadow text-sm font-medium">
            💰 ₹{earnings?.today?.toFixed(0) ?? '0'}
          </button>
          <button onClick={() => router.push('/rides')}
            className="w-10 h-10 bg-white rounded-full shadow flex items-center justify-center">
            📋
          </button>
        </div>
      </div>

      {/* Online/Offline toggle */}
      {!currentRide && (
        <div className="absolute bottom-8 left-6 right-6 z-10">
          <button onClick={toggleOnline}
            className={`w-full rounded-2xl py-5 font-bold text-xl shadow-xl active:scale-95 transition-all ${
              isOnline ? 'bg-green-500 text-white' : 'bg-gray-800 text-white'
            }`}>
            {isOnline ? '🟢 You are Online' : '⚫ Go Online'}
          </button>
          {isOnline && (
            <p className="text-center text-sm text-white mt-2 bg-black/30 rounded-xl py-1">
              Waiting for ride requests...
            </p>
          )}
        </div>
      )}

      {/* Active ride actions */}
      {currentRide && (
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 z-10 shadow-2xl">
          <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-4" />
          <p className="text-center text-gray-500 text-sm mb-4 font-medium">
            Status: <span className="text-orange-500 font-bold">{currentRide.status?.replace(/_/g, ' ')}</span>
          </p>
          <div className="flex gap-3">
            {currentRide.status === 'driver_assigned' || currentRide.status === 'en_route' ? (
              <button onClick={() => updateRideStatus('arrived')}
                className="flex-1 bg-blue-500 text-white rounded-2xl py-4 font-bold">
                ✓ I've Arrived
              </button>
            ) : currentRide.status === 'driver_arrived' ? (
              <button onClick={() => updateRideStatus('start')}
                className="flex-1 bg-orange-500 text-white rounded-2xl py-4 font-bold">
                ▶ Start Ride
              </button>
            ) : currentRide.status === 'in_progress' ? (
              <button onClick={() => updateRideStatus('end')}
                className="flex-1 bg-green-500 text-white rounded-2xl py-4 font-bold">
                ■ End Ride
              </button>
            ) : null}
          </div>
        </div>
      )}

      <RideRequestModal />
    </div>
  )
}
