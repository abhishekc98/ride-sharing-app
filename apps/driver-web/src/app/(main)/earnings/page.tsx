'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function EarningsPage() {
  const router = useRouter()
  const [earnings, setEarnings] = useState<any>(null)
  const [rides, setRides] = useState<any[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState(false)
  const [message, setMessage] = useState('')

  const load = () =>
    Promise.all([
      api.get('/api/v1/drivers/me/earnings'),
      api.get('/api/v1/drivers/me/rides?limit=10'),
      api.get('/api/v1/drivers/me'),
    ]).then(([e, r, d]) => {
      setEarnings(e.data.data)
      setRides(r.data.data)
      setWalletBalance(Number(d.data.data.wallet_balance ?? 0))
    }).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const withdraw = async () => {
    setWithdrawing(true)
    setMessage('')
    try {
      const res = await api.post('/api/v1/payments/payout/withdraw', {})
      setMessage(`Withdrawal of ₹${Number(res.data.data.amount).toFixed(0)} requested — settles to your bank shortly`)
      await load()
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'Could not start withdrawal')
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-2xl">←</button>
        <h1 className="text-xl font-bold">Earnings</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-4">
          {/* Withdrawable balance */}
          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-5 mb-4">
            <p className="text-green-100 text-xs font-bold uppercase tracking-wide mb-1">Available to withdraw</p>
            <p className="text-3xl font-bold mb-1">₹{walletBalance.toFixed(0)}</p>
            {Number(earnings?.pendingPayout ?? 0) > 0 && (
              <p className="text-green-100 text-xs font-medium mb-3">₹{Number(earnings.pendingPayout).toFixed(0)} pending settlement</p>
            )}
            <button
              onClick={withdraw}
              disabled={withdrawing || walletBalance <= 0}
              className="w-full bg-white text-green-700 rounded-xl py-3 font-bold text-sm mt-2 disabled:opacity-50">
              {withdrawing ? 'Requesting…' : 'Withdraw to bank'}
            </button>
            {message && <p className="text-green-50 text-xs font-medium mt-2">{message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: 'Today', value: earnings?.today ?? 0 },
              { label: 'This Week', value: earnings?.this_week ?? 0 },
              { label: 'This Month', value: earnings?.this_month ?? 0 },
              { label: 'Total', value: earnings?.total ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-2xl p-4">
                <p className="text-gray-400 text-sm">{label}</p>
                <p className="text-2xl font-bold text-orange-400">₹{Number(value).toFixed(0)}</p>
              </div>
            ))}
          </div>

          <h2 className="font-bold text-lg mb-3">Recent Trips</h2>
          {rides.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No trips yet</p>
          ) : (
            <div className="space-y-3">
              {rides.map((r: any) => (
                <div key={r.id} className="bg-gray-800 rounded-2xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.status === 'completed' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>{r.status}</span>
                    <span className="font-bold text-orange-400">₹{r.fare_final ?? r.fare_estimate}</span>
                  </div>
                  <p className="text-sm text-gray-300 truncate">📍 {r.pickup_address}</p>
                  <p className="text-sm text-gray-300 truncate">🏁 {r.drop_address}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(r.requested_at).toLocaleDateString('en-IN')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
