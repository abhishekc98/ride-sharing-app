'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/stores/authStore'
import { useRideStore } from '@/stores/rideStore'
import { useSocket } from '@/hooks/useSocket'
import { useGeolocation } from '@/hooks/useGeolocation'
import { api } from '@/lib/api'
import { getRoute, reverseGeocode } from '@/lib/osrm'
import { BookingSheet } from '@/components/ride/BookingSheet'
import { RideConfirmBar } from '@/components/ride/RideConfirmBar'
import { DriverCard } from '@/components/ride/DriverCard'

const RiderMap = dynamic(() => import('@/components/map/RiderMap'), { ssr: false })

export default function HomePage() {
  const router = useRouter()
  const { user, _hasHydrated } = useAuthStore()
  const { status, driver, pickup, drop, setPickup, setDrop } = useRideStore()
  const { position } = useGeolocation()
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([])
  const [showBooking, setShowBooking] = useState(false)
  const [route, setRoute] = useState<[number, number][] | null>(null)
  const [driverRoute, setDriverRoute] = useState<[number, number][] | null>(null)
  const driverRouteFetchRef = useRef(0)
  const [gpsLoading, setGpsLoading] = useState(false)

  useSocket()

  // Auth guard after hydration
  useEffect(() => {
    if (!_hasHydrated) return
    if (!user) router.replace('/login')
  }, [user, _hasHydrated])

  // Resume an in-progress ride after a hard refresh — unlike driverStore,
  // rideStore isn't persisted to localStorage (a stale cached ride status
  // would be actively wrong if it changed while the tab was closed), so this
  // asks the server for the truth instead. Skips the fetch entirely if a
  // ride is already tracked locally (e.g. remounting via client-side nav,
  // not a real reload).
  useEffect(() => {
    if (!user || useRideStore.getState().rideId) return
    api.get('/api/v1/rides/history', { params: { limit: 1 } })
      .then((r) => {
        const latest = r.data.data?.[0]
        const active = latest && ['searching', 'driver_assigned', 'en_route', 'driver_arrived', 'in_progress'].includes(latest.status)
        if (!active) return
        return api.get(`/api/v1/rides/${latest.id}`).then((r2) => {
          const ride = r2.data.data
          const store = useRideStore.getState()
          store.setRide(ride.id, ride.status)
          store.setPickup({ address: ride.pickup_address, lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) })
          store.setDrop({ address: ride.drop_address, lat: Number(ride.drop_lat), lng: Number(ride.drop_lng) })
          if (ride.driver_id) {
            store.setDriver({
              id: ride.driver_id,
              name: ride.driver_name ?? '',
              phone: ride.driver_phone ?? '',
              rating: Number(ride.driver_rating ?? 5),
              vehicle: {
                type: ride.vehicle_type_v ?? ride.vehicle_type,
                make: ride.make ?? '', model: ride.model ?? '', color: ride.color ?? '', plateNo: ride.plate_no ?? '',
              },
            })
          }
        })
      })
      .catch(() => {})
  }, [user])

  // Auto-set pickup from GPS on first load
  useEffect(() => {
    if (!position || pickup || gpsLoading) return
    setGpsLoading(true)
    reverseGeocode(position.lat, position.lng)
      .then(address => setPickup({ lat: position.lat, lng: position.lng, address }))
      .catch(() => setPickup({ lat: position.lat, lng: position.lng, address: 'Current Location' }))
      .finally(() => setGpsLoading(false))
  }, [position?.lat, position?.lng])

  // Fetch OSRM route whenever pickup/drop changes
  useEffect(() => {
    if (!pickup || !drop) { setRoute(null); return }
    getRoute({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng })
      .then(r => setRoute(r.polyline as [number, number][]))
      .catch(() => setRoute(null))
  }, [pickup?.lat, pickup?.lng, drop?.lat, drop?.lng])

  // The driver's incoming route — their live position → pickup. Only while
  // they're actually en route to pickup (once arrived/in_progress there's
  // nothing left to show them coming from). Throttled to at most once per 5s
  // rather than every ~2s position tick, since this hits the same public
  // OSRM endpoint the trip route already does.
  useEffect(() => {
    const wantsRoute = ['driver_assigned', 'en_route'].includes(status) && driver?.lat != null && driver?.lng != null && pickup
    if (!wantsRoute) { setDriverRoute(null); return }
    if (Date.now() - driverRouteFetchRef.current < 5000) return
    driverRouteFetchRef.current = Date.now()
    getRoute({ lat: driver!.lat!, lng: driver!.lng! }, { lat: pickup!.lat, lng: pickup!.lng })
      .then((r) => setDriverRoute(r.polyline as [number, number][]))
      .catch(() => {})
  }, [status, driver?.lat, driver?.lng, pickup?.lat, pickup?.lng])

  // Poll nearby drivers
  useEffect(() => {
    if (!position) return
    const fetchDrivers = () =>
      api.get('/api/v1/location/nearby', {
        params: { lat: position.lat, lng: position.lng, radius: 3 },
      }).then(r => setNearbyDrivers(r.data.data ?? [])).catch(() => {})
    fetchDrivers()
    const id = setInterval(fetchDrivers, 15000)
    return () => clearInterval(id)
  }, [position])

  // Pickup marker dragged → reverse geocode → update store
  const handlePickupDrag = useCallback(async (lat: number, lng: number) => {
    setPickup({ lat, lng, address: '…' })
    const address = await reverseGeocode(lat, lng).catch(() => 'Pinned location')
    setPickup({ lat, lng, address })
  }, [setPickup])

  // Drop marker dragged → reverse geocode → update store
  const handleDropDrag = useCallback(async (lat: number, lng: number) => {
    setDrop({ lat, lng, address: '…' })
    const address = await reverseGeocode(lat, lng).catch(() => 'Pinned location')
    setDrop({ lat, lng, address })
  }, [setDrop])

  // Tap map while booking sheet is open → set whichever point is still
  // missing (pickup first if it was cleared, otherwise drop) — a tap always
  // meant "set the empty one," it just used to hardcode drop. Completing the
  // pair this way closes the search sheet too, same as picking from the
  // list — the confirm bar takes over immediately either way.
  const handleMapTap = useCallback(async (lat: number, lng: number) => {
    if (!showBooking) return
    const setPoint = pickup ? setDrop : setPickup
    setPoint({ lat, lng, address: 'Loading address…' })
    const address = await reverseGeocode(lat, lng).catch(() => 'Pinned location')
    setPoint({ lat, lng, address })
    if (pickup) setShowBooking(false)
  }, [showBooking, pickup, setPickup, setDrop])

  const isRideActive = ['searching', 'driver_assigned', 'en_route', 'driver_arrived', 'in_progress'].includes(status)

  // Ride wrapped up — hand off to the dedicated receipt/payment screen
  // instead of a dead-end "Ride Complete" modal. rideStore.reset() happens
  // there once the rider taps Done, not here, so the redirect itself can't
  // race the receipt page's first fetch.
  useEffect(() => {
    if (status === 'completed' && useRideStore.getState().rideId) {
      router.replace(`/ride/${useRideStore.getState().rideId}/receipt`)
    }
  }, [status])

  if (!_hasHydrated) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full overflow-hidden">

      {/* Map — z-0 contains Leaflet's internal z-indices */}
      <RiderMap
        center={position ? [position.lat, position.lng] : undefined}
        drivers={nearbyDrivers.map(d => ({
          driverId: d.driverId,
          lat: d.lat ?? position?.lat ?? 12.97,
          lng: d.lng ?? position?.lng ?? 77.59,
          distanceKm: d.distanceKm,
        }))}
        pickupMarker={pickup ? [pickup.lat, pickup.lng] : undefined}
        dropMarker={drop ? [drop.lat, drop.lng] : undefined}
        route={route ?? undefined}
        driverLivePos={driver?.lat && driver?.lng ? [driver.lat, driver.lng] : undefined}
        driverRoute={driverRoute ?? undefined}
        onPickupDrag={handlePickupDrag}
        onDropDrag={handleDropDrag}
        onMapTap={handleMapTap}
        className="absolute inset-0 h-full w-full z-0"
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-2 shadow-md border border-white/50">
          <span className="text-orange-600 font-bold text-base">🛵 RideApp</span>
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="w-10 h-10 bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-white/50 flex items-center justify-center text-lg">
          👤
        </button>
      </div>

      {/* GPS loading */}
      {gpsLoading && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-md z-20 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-700 font-semibold">Getting your location…</span>
        </div>
      )}

      {/* Location pill — only for the partial state (pickup but no drop yet).
          Once both are set, RideConfirmBar below owns this summary. */}
      {pickup && !drop && !isRideActive && !showBooking && (
        <button
          onClick={() => setShowBooking(true)}
          className="absolute top-16 left-4 right-4 bg-white/97 backdrop-blur-sm rounded-2xl shadow-md border border-gray-100 p-3.5 z-20 text-left">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500 shrink-0 ring-2 ring-orange-200" />
            <p className="text-xs font-semibold text-gray-800 truncate">{pickup.address}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full border-2 border-dashed border-gray-400 shrink-0" />
            <p className="text-xs text-gray-400 font-medium">Tap to add destination</p>
          </div>
        </button>
      )}

      {/* Bottom CTA — only for the partial/empty state */}
      {!isRideActive && !showBooking && !(pickup && drop) && (
        <div className="absolute bottom-8 left-5 right-5 z-20">
          {pickup ? (
            <button
              onClick={() => setShowBooking(true)}
              className="w-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-2xl py-4 shadow-xl font-bold text-base transition-all">
              Set Destination
            </button>
          ) : (
            <button
              onClick={() => setShowBooking(true)}
              className="w-full bg-white rounded-2xl py-4 shadow-xl active:scale-[0.98] transition-all flex items-center gap-3 px-5 border border-gray-100">
              <span className="w-9 h-9 bg-orange-600 rounded-xl flex items-center justify-center text-white text-lg shrink-0">🔍</span>
              <span className="text-gray-500 font-medium">Where are you going?</span>
            </button>
          )}
        </div>
      )}

      {/* Confirm bar — both points set, sheet closed: compact, map + route stay visible */}
      {pickup && drop && !isRideActive && !showBooking && (
        <RideConfirmBar
          onEdit={() => setShowBooking(true)}
          onBooked={(rideId) => useRideStore.getState().setRide(rideId, 'searching')}
        />
      )}

      {/* Booking sheet — search step only, closes itself once both points are picked */}
      {showBooking && !isRideActive && (
        <BookingSheet
          currentPosition={position}
          onClose={() => setShowBooking(false)}
        />
      )}

      {/* Active ride UI */}
      {isRideActive && <DriverCard />}

      {/* Ride just wrapped up — brief transition state while redirecting to receipt */}
      {status === 'completed' && (
        <div className="absolute inset-0 bg-white flex items-center justify-center z-50">
          <div className="w-9 h-9 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
