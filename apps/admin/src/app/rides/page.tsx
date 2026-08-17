'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Sidebar } from '@/components/Sidebar'

const STATUS_FILTERS = ['all', 'searching', 'driver_assigned', 'in_progress', 'completed', 'cancelled'] as const

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-400', cancelled: 'text-red-400', in_progress: 'text-blue-400',
  searching: 'text-amber-400', driver_assigned: 'text-orange-400',
}

function RidesContent() {
  const searchParams = useSearchParams()
  const [rides, setRides] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('all')
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'))

  useEffect(() => {
    setLoading(true)
    api.get('/api/v1/admin/rides', { params: { status: filter === 'all' ? undefined : filter, limit: 50 } })
      .then((r) => setRides(r.data.data ?? []))
      .finally(() => setLoading(false))
  }, [filter])

  const selected = rides.find((r) => r.id === selectedId)

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Rides</h1>
            <p className="text-gray-400 text-sm">All trips across the platform</p>
          </div>
          <div className="flex gap-2">
            {STATUS_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter === f ? 'bg-orange-500' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rides.length === 0 ? (
              <p className="text-gray-500 text-center py-16">No rides for this filter</p>
            ) : (
              <div className="space-y-2">
                {rides.map((r) => (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left bg-gray-900 rounded-xl p-4 border transition-colors ${
                      selectedId === r.id ? 'border-orange-500' : 'border-gray-800 hover:border-gray-700'
                    }`}>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className={`text-xs font-bold capitalize ${STATUS_COLORS[r.status] ?? 'text-gray-400'}`}>
                        {r.status?.replace(/_/g, ' ')}
                      </span>
                      <span className="font-bold text-sm">₹{r.fare_final ?? r.fare_estimate}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">📍 {r.pickup_address}</p>
                    <p className="text-xs text-gray-400 truncate">🏁 {r.drop_address}</p>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500">
                      <span>{r.rider_name ?? 'Rider'} → {r.driver_name ?? 'Unassigned'}</span>
                      <span>{new Date(r.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="w-80 shrink-0 bg-gray-900 border-l border-gray-800 p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Ride Detail</h2>
                <button onClick={() => setSelectedId(null)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              <p className={`text-sm font-bold capitalize mb-4 ${STATUS_COLORS[selected.status] ?? 'text-gray-300'}`}>
                {selected.status?.replace(/_/g, ' ')}
              </p>
              <div className="space-y-3 text-sm">
                <div><p className="text-gray-500 text-xs mb-0.5">Rider</p><p className="font-medium">{selected.rider_name ?? '—'} · {selected.rider_phone ?? ''}</p></div>
                <div><p className="text-gray-500 text-xs mb-0.5">Driver</p><p className="font-medium">{selected.driver_name ?? 'Unassigned'}</p></div>
                <div><p className="text-gray-500 text-xs mb-0.5">Pickup</p><p className="font-medium">{selected.pickup_address}</p></div>
                <div><p className="text-gray-500 text-xs mb-0.5">Drop</p><p className="font-medium">{selected.drop_address}</p></div>
                <div className="flex gap-4">
                  <div><p className="text-gray-500 text-xs mb-0.5">Estimate</p><p className="font-medium">₹{selected.fare_estimate}</p></div>
                  <div><p className="text-gray-500 text-xs mb-0.5">Final</p><p className="font-medium">{selected.fare_final != null ? `₹${selected.fare_final}` : '—'}</p></div>
                </div>
                <div className="flex gap-4">
                  <div><p className="text-gray-500 text-xs mb-0.5">Payment</p><p className="font-medium capitalize">{selected.payment_method ?? '—'}</p></div>
                  <div><p className="text-gray-500 text-xs mb-0.5">Status</p><p className="font-medium capitalize">{selected.payment_status ?? '—'}</p></div>
                </div>
                {selected.cancel_reason && (
                  <div><p className="text-gray-500 text-xs mb-0.5">Cancel reason</p><p className="font-medium">{selected.cancel_reason} ({selected.cancelled_by})</p></div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RidesPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-gray-950" />}>
      <RidesContent />
    </Suspense>
  )
}
