'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'
import { useDriverSocket } from '@/hooks/useDriverSocket'
import { useGPSPing } from '@/hooks/useGPSPing'
import { RideRequestModal } from '@/components/ride/RideRequestModal'

const DriverMap = dynamic(() => import('@/components/map/DriverMap'), { ssr: false })

export default function DriverHomePage() {
  const router = useRouter()
  const { user, isOnline, setOnline, currentRide, setRideStatus } = useDriverStore()
  const [earnings, setEarnings] = useState<any>(null)
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)

  useDriverSocket()
  useGPSPing()

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPos({ lat: 12.9716, lng: 77.5946 })
    )
  }, [])

  useEffect(() => {
    api.get('/api/v1/drivers/me/earnings').then((r) => setEarnings(r.data.data)).catch(() => {})
  }, [])

  const toggleOnline = async () => {
    if (!pos) return alert('Waiting for GPS...')
    try {
      if (isOnline) {
        await api.post('/api/v1/location/offline')
        setOnline(false)
      } else {
        await api.post('/api/v1/location/online', { lat: pos.lat, lng: pos.lng })
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
        center={pos ? [pos.lat, pos.lng] : undefined}
        driverPos={pos ? [pos.lat, pos.lng] : undefined}
        className="absolute inset-0 h-full w-full"
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
