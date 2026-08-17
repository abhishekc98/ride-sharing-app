'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Sidebar } from '@/components/Sidebar'

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () =>
    api.get('/api/v1/payments/payout/pending').then((r) => setPayouts(r.data.data ?? [])).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const resolve = async (id: string, status: 'settled' | 'rejected') => {
    setBusyId(id)
    try {
      await api.post(`/api/v1/payments/payout/${id}/settle`, { status })
      await load()
    } catch {
      alert('Could not update payout')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-bold">Payouts</h1>
          <p className="text-gray-400 text-sm">Driver withdrawal requests awaiting bank transfer</p>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">💸</div>
              <p>No pending payout requests</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {payouts.map((p) => (
                <div key={p.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold">{p.driver_name ?? 'Driver'} <span className="text-gray-500 font-normal">· {p.driver_phone}</span></p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Requested {new Date(p.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-lg text-green-400">₹{Number(p.amount).toFixed(0)}</span>
                    <button onClick={() => resolve(p.id, 'rejected')} disabled={busyId === p.id}
                      className="text-xs font-bold text-red-400 border border-red-900 rounded-lg px-3 py-2 disabled:opacity-50">
                      Reject
                    </button>
                    <button onClick={() => resolve(p.id, 'settled')} disabled={busyId === p.id}
                      className="text-xs font-bold bg-green-600 hover:bg-green-500 rounded-lg px-3 py-2 disabled:opacity-50">
                      Mark settled
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
