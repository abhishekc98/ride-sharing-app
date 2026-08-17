'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-900 text-green-400',
  cancelled: 'bg-red-900 text-red-400',
  in_progress: 'bg-blue-900 text-blue-400',
}

export default function DriverRidesPage() {
  const router = useRouter()
  const [rides, setRides] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const load = (p: number) => {
    setLoading(true)
    api.get('/api/v1/drivers/me/rides', { params: { page: p, limit: 20 } })
      .then((r) => {
        setRides((prev) => (p === 1 ? r.data.data : [...prev, ...r.data.data]))
        setHasMore(r.data.data.length === 20)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-2xl">←</button>
        <h1 className="text-xl font-bold">Trip History</h1>
      </div>

      <div className="p-4">
        {rides.length === 0 && !loading ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-3">🛵</div>
            <p className="text-gray-500 font-medium">No trips yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rides.map((r) => (
              <div key={r.id} className="bg-gray-800 rounded-2xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold capitalize ${STATUS_STYLES[r.status] ?? 'bg-gray-700 text-gray-300'}`}>
                    {r.status?.replace(/_/g, ' ')}
                  </span>
                  <span className="font-bold text-orange-400">₹{r.fare_final ?? r.fare_estimate}</span>
                </div>
                <p className="text-sm text-gray-300 truncate">📍 {r.pickup_address}</p>
                <p className="text-sm text-gray-300 truncate mt-0.5">🏁 {r.drop_address}</p>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-700/60">
                  <p className="text-xs text-gray-500">{new Date(r.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-xs text-gray-500 capitalize">{r.rider_name ?? 'Rider'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && rides.length > 0 && (
          <button
            onClick={() => { const next = page + 1; setPage(next); load(next) }}
            disabled={loading}
            className="w-full text-center text-orange-400 font-bold text-sm py-4 disabled:opacity-50">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
