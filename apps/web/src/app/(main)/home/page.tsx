'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/stores/authStore'
import { useRideStore } from '@/stores/rideStore'
import { useSocket } from '@/hooks/useSocket'
import { useGeolocation } from '@/hooks/useGeolocation'
import { api } from '@/lib/api'
import { BookingSheet } from '@/components/ride/BookingSheet'
import { DriverCard } from '@/components/ride/DriverCard'

const RiderMap = dynamic(() => import('@/components/map/RiderMap'), { ssr: false })

export default function HomePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { status, driver, pickup, drop, reset } = useRideStore()
  const { position } = useGeolocation()
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([])
  const [showBooking, setShowBooking] = useState(false)

  useSocket()

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user])

  // Fetch nearby drivers periodically
  useEffect(() => {
    if (!position) return
    const fetch = () =>
      api.get('/api/v1/location/nearby', {
        params: { lat: position.lat, lng: position.lng, radius: 3 },
      }).then((r) => setNearbyDrivers(r.data.data)).catch(() => {})
    fetch()
    const id = setInterval(fetch, 15000)
    return () => clearInterval(id)
  }, [position])

  const isRideActive = ['searching', 'driver_assigned', 'en_route', 'driver_arrived', 'in_progress'].includes(status)

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gray-100">
      {/* Map */}
      <RiderMap
        center={position ? [position.lat, position.lng] : undefined}
        drivers={nearbyDrivers.map((d) => ({ driverId: d.driverId, lat: d.lat ?? position?.lat ?? 12.97, lng: d.lng ?? position?.lng ?? 77.59, distanceKm: d.distanceKm }))}
        pickupMarker={pickup ? [pickup.lat, pickup.lng] : undefined}
        dropMarker={drop ? [drop.lat, drop.lng] : undefined}
        driverLivePos={driver?.lat && driver?.lng ? [driver.lat, driver.lng] : undefined}
        className="absolute inset-0 h-full w-full"
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
        <div className="bg-white rounded-2xl px-4 py-2 shadow">
          <span className="text-orange-500 font-bold text-lg">🛵 RideApp</span>
        </div>
        <button onClick={() => router.push('/profile')}
          className="w-10 h-10 bg-white rounded-full shadow flex items-center justify-center text-lg">
          👤
        </button>
      </div>

      {/* Book button (idle state) */}
      {!isRideActive && status === 'idle' && (
        <button
          onClick={() => setShowBooking(true)}
          className="absolute bottom-8 left-6 right-6 bg-orange-500 text-white rounded-2xl py-4 font-bold text-lg shadow-xl z-10 active:scale-95 transition-transform">
          Where to?
        </button>
      )}

      {/* Booking sheet */}
      {showBooking && !isRideActive && (
        <BookingSheet onBooked={(rideId) => {
          setShowBooking(false)
          const { setRide } = useRideStore.getState()
          setRide(rideId, 'searching')
          router.push(`/ride/${rideId}`)
        }} />
      )}

      {/* Driver card (active ride) */}
      {isRideActive && <DriverCard />}

      {/* Completed */}
      {status === 'completed' && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 mx-6 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2">Ride Complete!</h2>
            <p className="text-gray-500 mb-6">Hope you had a great ride</p>
            <button
              onClick={() => { reset(); router.push('/history') }}
              className="w-full bg-orange-500 text-white rounded-2xl py-4 font-bold">
              View Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
