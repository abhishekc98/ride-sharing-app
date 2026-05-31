'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'

const VEHICLE_EMOJIS: Record<string, string> = { bike: '🛵', auto: '🛺', cab: '🚗' }

export function RideRequestModal() {
  const { pendingRequest, setPendingRequest, setCurrentRide, setRideStatus } = useDriverStore()
  const [timeLeft, setTimeLeft] = useState(30)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pendingRequest) return
    setTimeLeft(pendingRequest.timeoutSeconds ?? 30)
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          setPendingRequest(null)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [pendingRequest])

  if (!pendingRequest) return null

  const accept = async () => {
    setLoading(true)
    try {
      await api.post(`/api/v1/rides/${pendingRequest.rideId}/accept`)
      setCurrentRide({ id: pendingRequest.rideId, status: 'driver_assigned' })
      setPendingRequest(null)
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Could not accept')
      setPendingRequest(null)
    } finally {
      setLoading(false)
    }
  }

  const decline = async () => {
    try {
      await api.post(`/api/v1/rides/${pendingRequest.rideId}/decline`)
    } catch {}
    setPendingRequest(null)
  }

  const progress = (timeLeft / (pendingRequest.timeoutSeconds ?? 30)) * 100

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end z-50 animate-fade-in">
      <div className="w-full bg-white rounded-t-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-4xl">{VEHICLE_EMOJIS[pendingRequest.vehicleType] ?? '🛵'}</span>
          <div className="text-right">
            <p className="text-3xl font-bold text-orange-500">₹{pendingRequest.fareEstimate}</p>
            <p className="text-sm text-gray-500">{pendingRequest.distanceKm?.toFixed(1)} km</p>
          </div>
        </div>

        {/* Countdown bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
          <div
            className="h-2 bg-orange-500 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 mb-4">Accept in {timeLeft}s</p>

        <div className="flex gap-2 text-sm text-gray-600 mb-2">
          <span>📍</span>
          <span className="truncate">{pendingRequest.pickupAddress}</span>
        </div>
        <div className="flex gap-2 text-sm text-gray-600 mb-5">
          <span>🏁</span>
          <span className="truncate">{pendingRequest.dropAddress}</span>
        </div>

        <div className="flex gap-3">
          <button onClick={decline}
            className="flex-1 border-2 border-gray-200 text-gray-600 rounded-2xl py-4 font-bold text-lg">
            ✗ Decline
          </button>
          <button onClick={accept} disabled={loading}
            className="flex-1 bg-green-500 text-white rounded-2xl py-4 font-bold text-lg disabled:opacity-60">
            {loading ? '...' : '✓ Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
