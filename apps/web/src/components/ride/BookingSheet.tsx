'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useRideStore } from '@/stores/rideStore'
import { geocode } from '@/lib/osrm'

interface Props {
  onBooked: (rideId: string) => void
}

const VEHICLE_OPTIONS = [
  { type: 'bike' as const, label: 'Bike', emoji: '🛵', desc: 'Fastest & cheapest' },
  { type: 'auto' as const, label: 'Auto', emoji: '🛺', desc: 'Comfortable' },
  { type: 'cab' as const, label: 'Cab', emoji: '🚗', desc: 'AC, premium' },
]

export function BookingSheet({ onBooked }: Props) {
  const { pickup, drop, setPickup, setDrop, vehicleType, setVehicleType, fareEstimate, setFareEstimate } = useRideStore()
  const [pickupQuery, setPickupQuery] = useState('')
  const [dropQuery, setDropQuery] = useState('')
  const [pickupResults, setPickupResults] = useState<any[]>([])
  const [dropResults, setDropResults] = useState<any[]>([])
  const [promoCode, setPromoCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)

  useEffect(() => {
    if (!pickup || !drop) return
    setEstimating(true)
    api.get('/api/v1/pricing/estimate', {
      params: { pickupLat: pickup.lat, pickupLng: pickup.lng, dropLat: drop.lat, dropLng: drop.lng, vehicleType },
    })
      .then((r) => setFareEstimate(r.data.data.total))
      .catch(console.error)
      .finally(() => setEstimating(false))
  }, [pickup, drop, vehicleType])

  const searchPickup = async (q: string) => {
    setPickupQuery(q)
    if (q.length < 3) return setPickupResults([])
    const results = await geocode(q)
    setPickupResults(results.slice(0, 4))
  }

  const searchDrop = async (q: string) => {
    setDropQuery(q)
    if (q.length < 3) return setDropResults([])
    const results = await geocode(q)
    setDropResults(results.slice(0, 4))
  }

  const bookRide = async () => {
    if (!pickup || !drop) return
    setLoading(true)
    try {
      const res = await api.post('/api/v1/rides', {
        pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: pickup.address,
        dropLat: drop.lat, dropLng: drop.lng, dropAddress: drop.address,
        vehicleType, promoCode: promoCode || undefined,
      })
      onBooked(res.data.data.id)
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Booking failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-6 z-50 max-h-[80vh] overflow-y-auto">
      <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-4" />
      <h2 className="text-xl font-bold mb-4">Book a Ride</h2>

      {/* Pickup */}
      <div className="mb-3 relative">
        <label className="text-sm text-gray-500 mb-1 block">Pickup</label>
        <input
          className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Enter pickup location"
          value={pickupQuery || pickup?.address || ''}
          onChange={(e) => searchPickup(e.target.value)}
        />
        {pickupResults.length > 0 && (
          <div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
            {pickupResults.map((r, i) => (
              <button key={i} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b last:border-0"
                onClick={() => { setPickup({ address: r.address, lat: r.lat, lng: r.lng }); setPickupQuery(''); setPickupResults([]) }}>
                {r.address.slice(0, 60)}...
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drop */}
      <div className="mb-4 relative">
        <label className="text-sm text-gray-500 mb-1 block">Drop</label>
        <input
          className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Where to?"
          value={dropQuery || drop?.address || ''}
          onChange={(e) => searchDrop(e.target.value)}
        />
        {dropResults.length > 0 && (
          <div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto">
            {dropResults.map((r, i) => (
              <button key={i} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b last:border-0"
                onClick={() => { setDrop({ address: r.address, lat: r.lat, lng: r.lng }); setDropQuery(''); setDropResults([]) }}>
                {r.address.slice(0, 60)}...
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vehicle type */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {VEHICLE_OPTIONS.map((v) => (
          <button key={v.type}
            className={`border-2 rounded-xl p-3 text-center transition-all ${vehicleType === v.type ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
            onClick={() => setVehicleType(v.type)}>
            <div className="text-2xl">{v.emoji}</div>
            <div className="font-semibold text-sm">{v.label}</div>
            <div className="text-xs text-gray-400">{v.desc}</div>
          </button>
        ))}
      </div>

      {/* Promo */}
      <input
        className="w-full border rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
        placeholder="Promo code (optional)"
        value={promoCode}
        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
      />

      {/* Fare */}
      {estimating && <p className="text-center text-gray-400 mb-3 text-sm">Estimating fare...</p>}
      {fareEstimate !== null && !estimating && (
        <div className="bg-orange-50 rounded-xl p-3 mb-4 flex justify-between items-center">
          <span className="text-gray-600 text-sm">Estimated fare</span>
          <span className="font-bold text-orange-600 text-lg">₹{fareEstimate}</span>
        </div>
      )}

      <button
        disabled={!pickup || !drop || loading}
        onClick={bookRide}
        className="w-full bg-orange-500 text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-50 active:scale-95 transition-transform">
        {loading ? 'Booking...' : 'Book Ride'}
      </button>
    </div>
  )
}
