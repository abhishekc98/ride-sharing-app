'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useRideStore } from '@/stores/rideStore'

interface Props {
  onEdit: () => void
  onBooked: (rideId: string) => void
}

const VEHICLE_OPTIONS = [
  { type: 'bike' as const, label: 'Bike', emoji: '🛵' },
  { type: 'auto' as const, label: 'Auto', emoji: '🛺' },
  { type: 'cab' as const, label: 'Cab', emoji: '🚗' },
]

// The compact "confirm" step — route already visible on the map above,
// this only needs vehicle + fare + the book action. Deliberately not a
// tall sheet: Rapido/Uber keep this step to a few rows so the route stays
// visible, unlike the search step which can take the screen.
const PAYMENT_OPTIONS = [
  { value: 'wallet' as const, label: 'Wallet', emoji: '👛' },
  { value: 'card' as const, label: 'Card/UPI', emoji: '💳' },
  { value: 'cash' as const, label: 'Cash', emoji: '💵' },
]

export function RideConfirmBar({ onEdit, onBooked }: Props) {
  const {
    pickup, drop, vehicleType, setVehicleType, fareEstimate, setFareEstimate,
    paymentPreference, setPaymentPreference,
  } = useRideStore()
  const [promoCode, setPromoCode] = useState('')
  const [promoResult, setPromoResult] = useState<{ valid: boolean; discount?: number; reason?: string } | null>(null)
  const [checkingPromo, setCheckingPromo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  useEffect(() => {
    api.get('/api/v1/users/me/wallet').then((r) => setWalletBalance(Number(r.data.data?.balance ?? 0))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickup || !drop) return
    setEstimating(true)
    setPromoResult(null)
    api.get('/api/v1/rides/estimate', {
      params: { pickupLat: pickup.lat, pickupLng: pickup.lng, dropLat: drop.lat, dropLng: drop.lng, vehicleType },
    })
      .then((r) => setFareEstimate(r.data.data.total))
      .catch(console.error)
      .finally(() => setEstimating(false))
  }, [pickup, drop, vehicleType])

  const checkPromo = () => {
    if (!promoCode || fareEstimate == null) return
    setCheckingPromo(true)
    api.get('/api/v1/rides/promo/validate', { params: { code: promoCode, fareAmount: fareEstimate } })
      .then((r) => setPromoResult(r.data.data))
      .catch(() => setPromoResult({ valid: false, reason: 'Could not validate code' }))
      .finally(() => setCheckingPromo(false))
  }

  if (!pickup || !drop) return null

  const discount = promoResult?.valid ? (promoResult.discount ?? 0) : 0
  const payable = fareEstimate != null ? Math.max(0, fareEstimate - discount) : null

  const bookRide = async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/v1/rides', {
        pickupLat: pickup.lat, pickupLng: pickup.lng, pickupAddress: pickup.address,
        dropLat: drop.lat, dropLng: drop.lng, dropAddress: drop.address,
        vehicleType, promoCode: promoResult?.valid ? promoCode : undefined,
        paymentPreference,
      })
      onBooked(res.data.data.id)
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Booking failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] z-20 px-5 pt-4 pb-6">
      <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3.5" />

      {/* Route summary — tap either line to jump back into search */}
      <button onClick={onEdit} className="w-full text-left mb-4">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0 ring-2 ring-orange-100" />
          <span className="text-xs font-semibold text-gray-800 truncate flex-1">{pickup.address}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-900 shrink-0" />
          <span className="text-xs font-semibold text-gray-800 truncate flex-1">{drop.address}</span>
          <span className="text-[10px] text-orange-600 font-bold shrink-0">EDIT</span>
        </div>
      </button>

      {/* Vehicle — compact row instead of a grid of tall cards */}
      <div className="flex gap-2 mb-3.5">
        {VEHICLE_OPTIONS.map((v) => (
          <button key={v.type}
            onClick={() => setVehicleType(v.type)}
            className={`flex-1 border-2 rounded-xl py-2 text-center transition-all ${
              vehicleType === v.type ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'
            }`}>
            <div className="text-lg leading-none mb-0.5">{v.emoji}</div>
            <div className={`text-xs font-bold ${vehicleType === v.type ? 'text-orange-700' : 'text-gray-700'}`}>{v.label}</div>
          </button>
        ))}
      </div>

      {/* Payment method — compact chips, same row treatment as vehicle */}
      <div className="flex gap-2 mb-3.5">
        {PAYMENT_OPTIONS.map((p) => (
          <button key={p.value}
            onClick={() => setPaymentPreference(p.value)}
            className={`flex-1 border-2 rounded-xl py-2 text-center transition-all ${
              paymentPreference === p.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'
            }`}>
            <div className="text-base leading-none mb-0.5">{p.emoji}</div>
            <div className={`text-[11px] font-bold ${paymentPreference === p.value ? 'text-orange-700' : 'text-gray-700'}`}>
              {p.label}
            </div>
          </button>
        ))}
      </div>
      {paymentPreference === 'wallet' && walletBalance !== null && (
        <p className="text-[11px] text-gray-400 font-medium mb-3.5 px-1">
          Wallet balance ₹{walletBalance.toFixed(0)}
          {payable !== null && walletBalance < payable && ' — not enough, you\'ll pay by card instead'}
        </p>
      )}

      {/* Promo */}
      <div className="flex items-center gap-2 mb-2">
        <input
          className="flex-1 min-w-0 border-2 border-gray-200 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none"
          placeholder="Promo code (optional)"
          value={promoCode}
          onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null) }}
        />
        <button
          type="button"
          onClick={checkPromo}
          disabled={!promoCode || checkingPromo}
          className="shrink-0 border-2 border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-40">
          {checkingPromo ? '…' : 'Apply'}
        </button>
      </div>
      {promoResult && (
        <p className={`text-xs font-semibold mb-2 px-1 ${promoResult.valid ? 'text-green-600' : 'text-red-500'}`}>
          {promoResult.valid ? `🎉 ₹${promoResult.discount} off applied` : promoResult.reason}
        </p>
      )}

      {/* Fare */}
      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-xs text-gray-500 font-medium">Estimated fare</span>
        {estimating ? (
          <span className="text-xs text-gray-500 font-medium">Calculating…</span>
        ) : fareEstimate !== null ? (
          <span className="flex items-baseline gap-1.5">
            {discount > 0 && <span className="text-xs text-gray-400 line-through">₹{fareEstimate}</span>}
            <span className="font-bold text-orange-600 text-xl">₹{payable}</span>
          </span>
        ) : null}
      </div>

      <button
        disabled={loading || estimating}
        onClick={bookRide}
        className="w-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl py-4 font-bold text-base disabled:opacity-40 transition-all shadow-sm">
        {loading ? 'Booking…' : 'Book Ride'}
      </button>
    </div>
  )
}
