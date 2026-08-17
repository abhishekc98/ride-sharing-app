'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'

export default function RideCompletePage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const { user } = useDriverStore()

  const [ride, setRide] = useState<any>(null)
  const [payment, setPayment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [myRating, setMyRating] = useState<any>(null)
  const [score, setScore] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const refetch = useCallback(async () => {
    const [rideRes, paymentRes, ratingsRes] = await Promise.all([
      api.get(`/api/v1/rides/${rideId}`),
      api.get(`/api/v1/payments/ride/${rideId}`),
      api.get(`/api/v1/ratings/ride/${rideId}`).catch(() => ({ data: { data: [] } })),
    ])
    setRide(rideRes.data.data)
    setPayment(paymentRes.data.data)
    setMyRating(ratingsRes.data.data.find((r: any) => r.from_user_id === user?.id) ?? null)
    setLoading(false)
  }, [rideId, user?.id])

  useEffect(() => { refetch().catch(() => setLoading(false)) }, [refetch])

  // The payment row may not exist yet at all when this screen first loads
  // (ride-service's completeRide() call can still be in flight relative to
  // the socket redirect that brought the driver here), or it may still be
  // `pending` waiting on the rider's Checkout. Poll until it resolves so
  // the earnings figure updates without a manual refresh.
  useEffect(() => {
    if (ride?.payment_method === 'cash') return
    if (payment?.status === 'captured' || payment?.status === 'failed') return
    const id = setInterval(() => { refetch().catch(() => {}) }, 4000)
    return () => clearInterval(id)
  }, [ride?.payment_method, payment?.status, refetch])

  const submitRating = async () => {
    if (!ride || score === 0) return
    setSubmitting(true)
    try {
      await api.post('/api/v1/ratings', { rideId, toUserId: ride.rider_id, score })
      await refetch()
    } catch {
      alert('Could not submit rating')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const fare = Number(ride?.fare_final ?? ride?.fare_estimate ?? 0)
  const earning = fare * 0.8
  const isPaid = payment?.status === 'captured' || ride?.payment_method === 'cash'

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
      <div className="px-6 pt-12 pb-8 text-center">
        <div className="text-5xl mb-3">🏁</div>
        <h1 className="text-xl font-bold">Trip complete</h1>
        <p className="text-gray-400 text-sm mt-1">
          {isPaid ? "Nice work — here's what you earned" : 'Waiting on rider payment to confirm your earnings'}
        </p>
        <p className="text-4xl font-bold text-green-400 mt-5">₹{earning.toFixed(0)}</p>
        {!isPaid && <p className="text-xs text-amber-400 font-medium mt-2">Credited once the rider's payment clears</p>}
      </div>

      <div className="px-5 space-y-3">
        <div className="bg-gray-800 rounded-2xl p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Trip fare</span>
            <span className="font-bold">₹{fare.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Your share (80%)</span>
            <span className="font-bold text-green-400">₹{earning.toFixed(0)}</span>
          </div>
        </div>

        {ride?.rider_id && (
          <div className="bg-gray-800 rounded-2xl p-5">
            {myRating ? (
              <div className="text-center py-2">
                <p className="text-sm font-semibold text-gray-300">Rider rated</p>
                <p className="text-yellow-500 text-lg mt-1">{'★'.repeat(myRating.score)}{'☆'.repeat(5 - myRating.score)}</p>
              </div>
            ) : (
              <>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Rate this rider</h2>
                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setScore(n)} className="text-3xl leading-none transition-transform active:scale-90">
                      {n <= score ? '★' : '☆'}
                    </button>
                  ))}
                </div>
                {score > 0 && (
                  <button onClick={submitRating} disabled={submitting}
                    className="w-full bg-orange-500 hover:bg-orange-600 rounded-xl py-3 font-bold text-sm disabled:opacity-50">
                    {submitting ? 'Submitting…' : 'Submit rating'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <button onClick={() => router.replace('/home')} className="w-full text-gray-400 font-bold text-sm py-3">
          Back to online
        </button>
      </div>
    </div>
  )
}
