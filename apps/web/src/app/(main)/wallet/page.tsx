'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function WalletPage() {
  const router = useRouter()
  const [wallet, setWallet] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState('')

  useEffect(() => {
    api.get('/api/v1/users/me/wallet')
      .then((r) => setWallet(r.data.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-2xl">←</button>
        <h1 className="text-xl font-bold">Wallet</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-4">
          <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-3xl p-6 text-white mb-6">
            <p className="text-sm opacity-80">Available Balance</p>
            <p className="text-4xl font-bold">₹{wallet?.balance?.toFixed(2) ?? '0.00'}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="font-bold mb-3">Add Money</h3>
            <div className="flex gap-2 flex-wrap mb-3">
              {[100, 200, 500, 1000].map((amt) => (
                <button key={amt}
                  onClick={() => setTopupAmount(String(amt))}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium ${topupAmount === String(amt) ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200'}`}>
                  ₹{amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              placeholder="Custom amount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              disabled={!topupAmount || Number(topupAmount) < 10}
              className="w-full bg-orange-500 text-white rounded-2xl py-3 font-bold disabled:opacity-50">
              Add ₹{topupAmount || '0'}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-bold mb-3">Transaction History</h3>
            {(wallet?.transactions ?? []).length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No transactions yet</p>
            ) : (
              <div className="space-y-3">
                {wallet.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString('en-IN')}</p>
                    </div>
                    <span className={`font-bold ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
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
