'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { openRazorpayCheckout } from '@/lib/razorpay'
import { useAuthStore } from '@/stores/authStore'

export default function WalletPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [wallet, setWallet] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState('')
  const [topupState, setTopupState] = useState<'idle' | 'processing'>('idle')
  const [error, setError] = useState('')

  const load = () =>
    api.get('/api/v1/users/me/wallet').then((r) => setWallet(r.data.data)).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const QUICK_AMOUNTS = [100, 200, 500, 1000]

  const addMoney = async () => {
    const amount = Number(topupAmount)
    if (!amount || amount < 10) return
    if (amount > 50000) { setError('Max top-up is ₹50,000'); return }
    setError('')
    setTopupState('processing')
    try {
      const res = await api.post('/api/v1/payments/wallet/topup', { amount })
      const { orderId } = res.data.data
      await openRazorpayCheckout({
        orderId,
        amountRupees: amount,
        description: 'RideApp wallet top-up',
        prefillContact: user?.phone,
        onSuccess: async (resp) => {
          try {
            await api.post('/api/v1/payments/verify', resp)
            setTopupAmount('')
            await load()
          } catch {
            setError('Payment received but balance update failed — pull to refresh in a moment')
          } finally {
            setTopupState('idle')
          }
        },
        onDismiss: () => setTopupState('idle'),
      })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Could not start payment')
      setTopupState('idle')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-700 transition-colors font-bold text-lg">
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-900">Wallet</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {/* Balance card */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-md">
            <p className="text-sm font-semibold text-orange-100 uppercase tracking-wide mb-1">Available Balance</p>
            <p className="text-4xl font-bold">₹{Number(wallet?.balance ?? 0).toFixed(2)}</p>
            <p className="text-xs text-orange-200 mt-2 font-medium">RideApp Wallet · Instant payments</p>
          </div>

          {/* Add money */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">Add Money</h3>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {QUICK_AMOUNTS.map((amt) => (
                <button key={amt}
                  onClick={() => setTopupAmount(String(amt))}
                  className={`py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                    topupAmount === String(amt)
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}>
                  ₹{amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder="Custom amount (₹10 – ₹50,000)"
              value={topupAmount}
              onChange={(e) => { setTopupAmount(e.target.value); setError('') }}
              className="w-full border-2 border-gray-200 focus:border-orange-500 rounded-xl px-4 py-3 text-sm text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none transition-colors mb-3"
            />
            {error && <p className="text-xs text-red-500 font-medium mb-3">{error}</p>}
            <button
              onClick={addMoney}
              disabled={!topupAmount || Number(topupAmount) < 10 || Number(topupAmount) > 50000 || topupState === 'processing'}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-xl py-3.5 font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {topupState === 'processing' ? 'Opening payment…' : `Add ₹${topupAmount || '0'} to Wallet`}
            </button>
          </div>

          {/* Transaction history */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-3">Transactions</h3>
            {(wallet?.transactions ?? []).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">💳</p>
                <p className="text-sm text-gray-500 font-medium">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-0">
                {wallet.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between items-center py-3.5 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tx.description}</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`font-bold text-base ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.type === 'credit' ? '+' : '-'}₹{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
