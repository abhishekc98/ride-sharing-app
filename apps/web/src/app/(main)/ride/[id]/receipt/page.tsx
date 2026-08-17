'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useAuthStore } from '@/stores/authStore'
import { useRideStore } from '@/stores/rideStore'

const METHOD_LABEL: Record<string, string> = { wallet: 'Wallet', razorpay: 'Card / UPI', cash: 'Cash' }

export default function ReceiptPage() {
  const router = useRouter()
  const params = useParams()
  const rideId = params.id as string
  const { user } = useAuthStore()

  const [ride, setRide] = useState<any>(null)
  const [payment, setPayment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  const [myRating, setMyRating] = useState<any>(null)
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)

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
    return paymentRes.data.data
  }, [rideId, user?.id])

  useEffect(() => { refetch().catch(() => setLoading(false)) }, [refetch])

  // Poll while there's still something to wait for: the payment row may not
  // exist yet at all (ride-service's completeRide() call can still be
  // in-flight relative to this screen's very first fetch — it used to be
  // fire-and-forget and land well after the redirect here, so `payment`
  // being null was a real dead end, not just a rare edge case), or it may
  // be `pending` waiting on Checkout/the webhook. Cash rides never get a
  // payment row to wait on at all.
  useEffect(() => {
    if (ride?.payment_method === 'cash') return
    if (payment?.status === 'captured' || payment?.status === 'failed') return
    const id = setInterval(() => { refetch().catch(() => {}) }, 4000)
    return () => clearInterval(id)
  }, [ride?.payment_method, payment?.status, refetch])

  const payNow = async () => {
    if (!payment) return
    setPaying(true)
    setPayError('')
    try {
      await openRazorpayCheckout({
        orderId: payment.gateway_ref,
        amountRupees: Number(payment.amount),
        description: ride ? `Ride to ${ride.drop_address}` : 'Ride fare',
        prefillContact: user?.phone,
        onSuccess: async (resp) => {
          try {
            await api.post('/api/v1/payments/verify', resp)
            await refetch()
          } catch {
            setPayError('Payment received but confirmation failed — pull to refresh in a moment')
          } finally {
            setPaying(false)
          }
        },
        onDismiss: () => setPaying(false),
      })
    } catch {
      setPayError('Could not open payment gateway — check your connection and try again')
      setPaying(false)
    }
  }

  const submitRating = async () => {
    if (!ride || score === 0) return
    setSubmittingRating(true)
    try {
      await api.post('/api/v1/ratings', { rideId, toUserId: ride.driver_id, score, comment: comment || undefined })
      await refetch()
    } catch {
      alert('Could not submit rating — try again')
    } finally {
      setSubmittingRating(false)
    }
  }

  const done = () => {
    useRideStore.getState().reset()
    router.replace('/home')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-9 h-9 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!ride) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-gray-500 font-medium mb-4">Couldn't load this ride.</p>
        <button onClick={() => router.replace('/home')} className="text-orange-600 font-bold text-sm">Back home</button>
      </div>
    )
  }

  const isPaid = payment?.status === 'captured' || ride.payment_method === 'cash'
  const isPending = payment?.status === 'pending'
  const isFailed = payment?.status === 'failed'
  const isWaiting = !isPaid && !isPending && !isFailed // payment row not created yet — keep polling
  const fare = Number(ride.fare_final ?? ride.fare_estimate)
  const discount = Number(ride.promo_discount ?? 0)
  const grossFare = fare + discount

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="bg-white px-6 pt-10 pb-8 text-center rounded-b-[2rem] shadow-sm">
        <div className="text-5xl mb-3">{isPaid ? '✅' : '⏳'}</div>
        <h1 className="text-xl font-bold text-gray-900">{isPaid ? 'Ride complete' : 'Almost done'}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isPaid ? 'Thanks for riding with us' : 'Finish paying to close out this trip'}
        </p>
        <p className="text-4xl font-bold text-gray-900 mt-5">₹{fare.toFixed(0)}</p>
      </div>

      <div className="px-5 -mt-4 space-y-3">
        {/* Fare breakdown */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Fare details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Trip fare</span>
              <span className="font-medium text-gray-900">₹{grossFare.toFixed(0)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Promo {ride.promo_code ? `(${ride.promo_code})` : ''}</span>
                <span className="font-medium">−₹{discount.toFixed(0)}</span>
              </div>
            )}
            {Number(ride.cancellation_fee ?? 0) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Cancellation fee</span>
                <span className="font-medium text-gray-900">₹{Number(ride.cancellation_fee).toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-100 font-bold text-gray-900">
              <span>Total</span>
              <span>₹{fare.toFixed(0)}</span>
            </div>
          </div>
          <div className="flex items-start gap-2 mt-4 pt-4 border-t border-gray-100">
            <span className="text-orange-500 text-sm mt-0.5">📍</span>
            <p className="text-xs text-gray-600 flex-1">{ride.pickup_address}</p>
          </div>
          <div className="flex items-start gap-2 mt-2">
            <span className="text-gray-400 text-sm mt-0.5">🏁</span>
            <p className="text-xs text-gray-600 flex-1">{ride.drop_address}</p>
          </div>
        </div>

        {/* Payment status / action */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">Payment</h2>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              isPaid ? 'bg-green-100 text-green-700' : isFailed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {isPaid ? 'Paid' : isFailed ? 'Failed' : 'Pending'}
            </span>
          </div>
          <p className="text-sm text-gray-700 font-medium">
            {METHOD_LABEL[ride.payment_method ?? payment?.method] ?? 'Wallet'}
          </p>

          {isWaiting && (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 font-medium">
              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin shrink-0" />
              Setting up payment…
            </div>
          )}

          {isPending && (
            <div className="mt-4">
              <button
                onClick={payNow}
                disabled={paying}
                className="w-full bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl py-3.5 font-bold text-sm disabled:opacity-50 transition-all">
                {paying ? 'Opening payment…' : `Pay ₹${fare.toFixed(0)}`}
              </button>
              {payError && <p className="text-xs text-red-500 font-medium mt-2 text-center">{payError}</p>}
            </div>
          )}

          {isFailed && (
            <p className="text-xs text-red-500 font-medium mt-3">
              Something went wrong setting up this payment. Pull to refresh, or contact support if it doesn't resolve.
            </p>
          )}
        </div>

        {/* Rating */}
        {isPaid && ride.driver_id && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            {myRating ? (
              <div className="text-center py-2">
                <p className="text-sm font-semibold text-gray-700">Thanks for rating your driver!</p>
                <p className="text-yellow-500 text-lg mt-1">{'★'.repeat(myRating.score)}{'☆'.repeat(5 - myRating.score)}</p>
              </div>
            ) : (
              <>
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Rate your driver</h2>
                <div className="flex justify-center gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setScore(n)} className="text-3xl leading-none transition-transform active:scale-90">
                      {n <= score ? '★' : '☆'}
                      <span className="sr-only">{n} star</span>
                    </button>
                  ))}
                </div>
                {score > 0 && (
                  <>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment (optional)"
                      rows={2}
                      className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none mb-3 resize-none"
                    />
                    <button
                      onClick={submitRating}
                      disabled={submittingRating}
                      className="w-full bg-gray-900 hover:bg-black text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 transition-all">
                      {submittingRating ? 'Submitting…' : 'Submit rating'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <button
          onClick={done}
          className="w-full text-gray-500 font-bold text-sm py-3">
          {isPaid ? 'Done' : 'Pay later from Ride History'}
        </button>
      </div>
    </div>
  )
}
